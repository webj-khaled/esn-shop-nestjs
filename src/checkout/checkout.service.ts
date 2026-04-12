import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  CreateSessionItemRequest,
  CreateSessionRequest,
  DeliveryAddressRequest,
} from './dto/create-session.request';

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

type StripeSessionResponse = {
  id?: string;
  url?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string;
  metadata?: Record<string, string>;
  customer_details?: {
    email?: string | null;
  };
};

type StripeLineItem = {
  description?: string;
  quantity?: number;
  amount_total?: number;
  price?: {
    unit_amount?: number | null;
    product_details?: {
      description?: string;
    };
    product?:
      | {
          description?: string | null;
        }
      | string;
  };
};

type StripeLineItemsResponse = {
  data?: StripeLineItem[];
};

type StripeSessionListItem = {
  id?: string;
  payment_status?: string;
};

type StripeSessionListResponse = {
  data?: StripeSessionListItem[];
  has_more?: boolean;
};

type CheckoutOrderRow = {
  id: number;
  stripeSessionId: string;
  totalAmountCents: number;
  currency: string;
  customerEmail: string | null;
  deliveryFullName: string;
  deliveryPhone: string | null;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string | null;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  deliveryCountry: string;
  createdAt: Date;
};

type CheckoutOrderItemRow = {
  id: number;
  orderId: number;
  productName: string;
  productDescription: string | null;
  shirtColor: string | null;
  shirtSize: string | null;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
};

type CheckoutOrderResponse = {
  id: number;
  stripeSessionId: string;
  totalAmount: number;
  currency: string;
  customerEmail: string | null;
  deliveryAddress: {
    fullName: string;
    phone: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  createdAt: Date;
  items: Array<{
    id: number;
    productName: string;
    productDescription: string | null;
    shirtColor: string | null;
    shirtSize: string | null;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
  }>;
};

type ShirtColor = 'black' | 'white';
type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL';

type CatalogProduct = {
  id: number;
  name: string;
  description: string;
  unitAmountCents: number;
  colors: ShirtColor[];
  stockByColorAndSize: Record<ShirtColor, Record<ShirtSize, number>>;
};

type ValidatedCheckoutItem = CreateSessionItemRequest & {
  product: CatalogProduct;
};

const EMPTY_STOCK: Record<ShirtSize, number> = {
  XS: 0,
  S: 0,
  M: 0,
  L: 0,
  XL: 0,
};

const SHIRT_BLACK_STOCK: Record<ShirtSize, number> = {
  XS: 10,
  S: 15,
  M: 20,
  L: 12,
  XL: 8,
};

const SHIRT_WHITE_STOCK: Record<ShirtSize, number> = {
  XS: 8,
  S: 12,
  M: 18,
  L: 10,
  XL: 6,
};

const HOODIE_BLACK_STOCK: Record<ShirtSize, number> = {
  XS: 6,
  S: 10,
  M: 12,
  L: 9,
  XL: 5,
};

const HOODIE_WHITE_STOCK: Record<ShirtSize, number> = {
  XS: 5,
  S: 8,
  M: 10,
  L: 7,
  XL: 4,
};

const CHECKOUT_PRODUCTS: CatalogProduct[] = [
  {
    id: 1,
    name: 'Nightline Black Tee',
    description: 'Soft premium cotton tee inspired by Salzburg night events.',
    unitAmountCents: 3999,
    colors: ['black'],
    stockByColorAndSize: {
      black: SHIRT_BLACK_STOCK,
      white: EMPTY_STOCK,
    },
  },
  {
    id: 2,
    name: 'Snowline White Tee',
    description:
      'Soft premium cotton tee inspired by Salzburg winter mornings.',
    unitAmountCents: 3999,
    colors: ['white'],
    stockByColorAndSize: {
      black: EMPTY_STOCK,
      white: SHIRT_WHITE_STOCK,
    },
  },
  {
    id: 3,
    name: 'Nightline Black Hoodie',
    description:
      'Heavyweight hoodie with a brushed interior for colder evenings.',
    unitAmountCents: 5999,
    colors: ['black'],
    stockByColorAndSize: {
      black: HOODIE_BLACK_STOCK,
      white: EMPTY_STOCK,
    },
  },
  {
    id: 4,
    name: 'Snowline White Hoodie',
    description:
      'Heavyweight hoodie with a brushed interior for chilly mornings.',
    unitAmountCents: 5999,
    colors: ['white'],
    stockByColorAndSize: {
      black: EMPTY_STOCK,
      white: HOODIE_WHITE_STOCK,
    },
  },
];

const CHECKOUT_PRODUCTS_BY_ID = CHECKOUT_PRODUCTS.reduce<
  Record<number, CatalogProduct>
>((acc, product) => {
  acc[product.id] = product;
  return acc;
}, {});

const STRIPE_CURRENCY = 'eur';

@Injectable()
export class CheckoutService {
  private orderTablesReady = false;
  private lastBackfillAttemptAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async createSession(request: CreateSessionRequest) {
    const items = this.validateItems(request.items);
    const deliveryAddress = request.deliveryAddress;
    const stripeSecretKey = this.getStripeSecretKey();

    const frontendBaseUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const successUrl = `${frontendBaseUrl}/cart?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendBaseUrl}/cart?checkout=cancelled`;

    const payload = new URLSearchParams({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[itemCount]': items.length.toString(),
      'metadata[totalQuantity]': items
        .reduce((sum, item) => sum + item.quantity, 0)
        .toString(),
      'metadata[deliveryFullName]': deliveryAddress.fullName,
      'metadata[deliveryPhone]': deliveryAddress.phone ?? '',
      'metadata[deliveryAddressLine1]': deliveryAddress.line1,
      'metadata[deliveryAddressLine2]': deliveryAddress.line2 ?? '',
      'metadata[deliveryCity]': deliveryAddress.city,
      'metadata[deliveryState]': deliveryAddress.state,
      'metadata[deliveryPostalCode]': deliveryAddress.postalCode,
      'metadata[deliveryCountry]': deliveryAddress.country,
    });

    items.forEach((item, index) => {
      payload.append(`metadata[item${index}Color]`, item.color);
      payload.append(`metadata[item${index}Size]`, item.size);
      payload.append(
        `line_items[${index}][quantity]`,
        item.quantity.toString(),
      );
      payload.append(
        `line_items[${index}][price_data][currency]`,
        STRIPE_CURRENCY,
      );
      payload.append(
        `line_items[${index}][price_data][unit_amount]`,
        item.product.unitAmountCents.toString(),
      );
      payload.append(
        `line_items[${index}][price_data][product_data][name]`,
        item.product.name,
      );
      payload.append(
        `line_items[${index}][price_data][product_data][description]`,
        `${item.product.description} - Color: ${item.color}, Size: ${item.size}`,
      );
      payload.append(
        `line_items[${index}][adjustable_quantity][enabled]`,
        'false',
      );
    });

    const stripeResponse = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
      },
    );

    if (!stripeResponse.ok) {
      const stripeError = (await stripeResponse.json()) as StripeErrorResponse;
      throw new BadGatewayException(
        stripeError.error?.message ??
          'Failed to create Stripe checkout session.',
      );
    }

    const stripeSession =
      (await stripeResponse.json()) as StripeSessionResponse;
    if (!stripeSession.url) {
      throw new BadGatewayException('Stripe session URL is missing.');
    }

    return { url: stripeSession.url, sessionId: stripeSession.id };
  }

  async confirmSession(
    sessionId: string,
    options?: { sendCompletionEmail?: boolean },
  ) {
    await this.ensureOrderTables();

    const existingOrder = await this.findOrderBySessionId(sessionId);
    if (existingOrder) {
      return existingOrder;
    }

    const stripeSecretKey = this.getStripeSecretKey();
    const stripeSession = await this.fetchStripeSession(
      sessionId,
      stripeSecretKey,
    );

    if (stripeSession.payment_status !== 'paid') {
      throw new BadRequestException(
        'Checkout session is not paid yet. Please complete payment first.',
      );
    }

    const stripeLineItems = await this.fetchStripeLineItems(
      sessionId,
      stripeSecretKey,
    );
    if (!stripeLineItems.length) {
      throw new BadGatewayException('No line items found for this checkout.');
    }

    const deliveryAddress = this.extractDeliveryAddress(stripeSession.metadata);
    const totalAmountCents =
      stripeSession.amount_total ??
      stripeLineItems.reduce((sum, item) => sum + (item.amount_total ?? 0), 0);
    const currency = (stripeSession.currency ?? STRIPE_CURRENCY).toUpperCase();

    const createdOrderRows = await this.prismaService.$queryRaw<
      Pick<CheckoutOrderRow, 'id' | 'createdAt'>[]
    >`
      INSERT INTO "CheckoutOrder" (
        "stripeSessionId",
        "totalAmountCents",
        "currency",
        "customerEmail",
        "deliveryFullName",
        "deliveryPhone",
        "deliveryAddressLine1",
        "deliveryAddressLine2",
        "deliveryCity",
        "deliveryState",
        "deliveryPostalCode",
        "deliveryCountry"
      )
      VALUES (
        ${sessionId},
        ${totalAmountCents},
        ${currency},
        ${stripeSession.customer_details?.email ?? null},
        ${deliveryAddress.fullName},
        ${deliveryAddress.phone ?? null},
        ${deliveryAddress.line1},
        ${deliveryAddress.line2 ?? null},
        ${deliveryAddress.city},
        ${deliveryAddress.state},
        ${deliveryAddress.postalCode},
        ${deliveryAddress.country}
      )
      RETURNING "id", "createdAt"
    `;

    const createdOrder = createdOrderRows[0];
    if (!createdOrder) {
      throw new InternalServerErrorException(
        'Failed to persist checkout order.',
      );
    }

    for (const [index, lineItem] of stripeLineItems.entries()) {
      const quantity = lineItem.quantity ?? 1;
      const totalLineAmount = lineItem.amount_total ?? 0;
      const unitAmount =
        lineItem.price?.unit_amount ??
        (quantity > 0 ? Math.round(totalLineAmount / quantity) : 0);
      const productName = lineItem.description ?? 'ESN Salzburg Merchandise';
      const productDescription =
        this.resolveStripeLineItemDescription(lineItem);
      const shirtSelection = this.extractShirtSelection(
        productName,
        productDescription,
      );
      const metadataColor = stripeSession.metadata?.[`item${index}Color`];
      const metadataSize = stripeSession.metadata?.[`item${index}Size`];

      await this.prismaService.$executeRaw`
        INSERT INTO "CheckoutOrderItem" (
          "orderId",
          "productName",
          "productDescription",
          "shirtColor",
          "shirtSize",
          "quantity",
          "unitAmountCents",
          "totalAmountCents"
        )
        VALUES (
          ${createdOrder.id},
          ${productName},
          ${productDescription ?? null},
          ${metadataColor?.toLowerCase() ?? shirtSelection.color},
          ${metadataSize?.toUpperCase() ?? shirtSelection.size},
          ${quantity},
          ${unitAmount},
          ${totalLineAmount}
        )
      `;
    }

    const orderWithItems = await this.findOrderBySessionId(sessionId);
    if (!orderWithItems) {
      throw new InternalServerErrorException(
        'Order was created but could not be loaded.',
      );
    }

    if (options?.sendCompletionEmail !== false) {
      await this.sendOrderCompletionEmail(orderWithItems);
    }

    return orderWithItems;
  }

  async getOrders(cookieHeader?: string) {
    this.assertAdmin(cookieHeader);
    await this.ensureOrderTables();
    await this.backfillMissingOrders();

    const orderRows = await this.prismaService.$queryRaw<CheckoutOrderRow[]>`
      SELECT
        "id",
        "stripeSessionId",
        "totalAmountCents",
        "currency",
        "customerEmail",
        "deliveryFullName",
        "deliveryPhone",
        "deliveryAddressLine1",
        "deliveryAddressLine2",
        "deliveryCity",
        "deliveryState",
        "deliveryPostalCode",
        "deliveryCountry",
        "createdAt"
      FROM "CheckoutOrder"
      ORDER BY "createdAt" DESC
    `;

    return this.loadOrdersWithItems(orderRows);
  }

  async getMyOrders(cookieHeader?: string) {
    const email = this.assertAuthenticatedEmail(cookieHeader);
    await this.ensureOrderTables();

    const orderRows = await this.prismaService.$queryRaw<CheckoutOrderRow[]>`
      SELECT
        "id",
        "stripeSessionId",
        "totalAmountCents",
        "currency",
        "customerEmail",
        "deliveryFullName",
        "deliveryPhone",
        "deliveryAddressLine1",
        "deliveryAddressLine2",
        "deliveryCity",
        "deliveryState",
        "deliveryPostalCode",
        "deliveryCountry",
        "createdAt"
      FROM "CheckoutOrder"
      WHERE LOWER("customerEmail") = LOWER(${email})
      ORDER BY "createdAt" DESC
    `;

    return this.loadOrdersWithItems(orderRows);
  }

  private async loadOrdersWithItems(orderRows: CheckoutOrderRow[]) {
    const orders: CheckoutOrderResponse[] = [];
    for (const orderRow of orderRows) {
      let itemRows = await this.loadOrderItems(orderRow.id);
      if (itemRows.some((item) => !item.shirtColor || !item.shirtSize)) {
        await this.backfillMissingOrderItemSelections(orderRow, itemRows);
        itemRows = await this.loadOrderItems(orderRow.id);
      }

      orders.push(this.toOrderResponse(orderRow, itemRows));
    }
    return orders;
  }

  private async loadOrderItems(orderId: number) {
    return this.prismaService.$queryRaw<CheckoutOrderItemRow[]>`
      SELECT
        "id",
        "orderId",
        "productName",
        "productDescription",
        "shirtColor",
        "shirtSize",
        "quantity",
        "unitAmountCents",
        "totalAmountCents"
      FROM "CheckoutOrderItem"
      WHERE "orderId" = ${orderId}
      ORDER BY "id" ASC
    `;
  }

  private async backfillMissingOrderItemSelections(
    orderRow: Pick<CheckoutOrderRow, 'id' | 'stripeSessionId'>,
    itemRows: CheckoutOrderItemRow[],
  ) {
    try {
      const stripeSecretKey = this.getStripeSecretKey();
      const stripeSession = await this.fetchStripeSession(
        orderRow.stripeSessionId,
        stripeSecretKey,
      );
      const stripeLineItems = await this.fetchStripeLineItems(
        orderRow.stripeSessionId,
        stripeSecretKey,
      );

      for (const [index, itemRow] of itemRows.entries()) {
        if (itemRow.shirtColor && itemRow.shirtSize) {
          continue;
        }

        const stripeLineItem = stripeLineItems[index];
        const metadataColor = stripeSession.metadata?.[`item${index}Color`];
        const metadataSize = stripeSession.metadata?.[`item${index}Size`];

        const parsedSelection = this.extractShirtSelection(
          stripeLineItem?.description ?? itemRow.productName,
          this.resolveStripeLineItemDescription(stripeLineItem) ??
            itemRow.productDescription,
        );

        const shirtColor =
          metadataColor?.toLowerCase() ?? parsedSelection.color;
        const shirtSize = metadataSize?.toUpperCase() ?? parsedSelection.size;

        if (!shirtColor && !shirtSize) {
          continue;
        }

        await this.prismaService.$executeRaw`
          UPDATE "CheckoutOrderItem"
          SET
            "shirtColor" = COALESCE("shirtColor", ${shirtColor}),
            "shirtSize" = COALESCE("shirtSize", ${shirtSize})
          WHERE "id" = ${itemRow.id}
        `;
      }
    } catch {
      // Best-effort backfill only; order listing must still load.
    }
  }

  private async backfillMissingOrders() {
    const backfillCooldownMs = 60_000;
    if (Date.now() - this.lastBackfillAttemptAt < backfillCooldownMs) {
      return;
    }

    this.lastBackfillAttemptAt = Date.now();
    try {
      const stripeSecretKey = this.getStripeSecretKey();
      const paidSessionIds =
        await this.fetchRecentlyPaidStripeSessionIds(stripeSecretKey);

      for (const sessionId of paidSessionIds) {
        const existing = await this.findOrderBySessionId(sessionId);
        if (existing) {
          continue;
        }

        try {
          await this.confirmSession(sessionId, { sendCompletionEmail: false });
        } catch {
          // Older Stripe sessions may not have metadata expected by this app.
          // Keep loading existing orders instead of failing the admin page.
        }
      }
    } catch {
      // Stripe sync is best-effort for admin history visibility.
    }
  }

  private validateItems(
    items: CreateSessionItemRequest[],
  ): ValidatedCheckoutItem[] {
    return items.map((item) => {
      const product = CHECKOUT_PRODUCTS_BY_ID[item.productId];
      if (!product) {
        throw new BadRequestException('Product not found.');
      }

      const color = item.color;
      const size = item.size;
      if (!product.colors.includes(color)) {
        throw new BadRequestException(
          'Selected color is not available for this product.',
        );
      }

      const availableStock = product.stockByColorAndSize[color][size];
      if (item.quantity > availableStock) {
        throw new BadRequestException(
          'Selected quantity is not available for this color/size option.',
        );
      }
      return { ...item, color, size, product };
    });
  }

  private extractShirtSelection(
    productName?: string | null,
    productDescription?: string | null,
  ) {
    const source = `${productName ?? ''} ${productDescription ?? ''}`;
    const colorMatch = source.match(/color:\s*([a-z]+)/i);
    const sizeMatch = source.match(/size:\s*([a-z0-9]+)/i);

    return {
      color: colorMatch?.[1]?.toLowerCase() ?? null,
      size: sizeMatch?.[1]?.toUpperCase() ?? null,
    };
  }

  private resolveStripeLineItemDescription(lineItem?: StripeLineItem) {
    const productDetailsDescription =
      lineItem?.price?.product_details?.description;
    if (productDetailsDescription) {
      return productDetailsDescription;
    }

    const product = lineItem?.price?.product;
    if (product && typeof product === 'object') {
      return product.description ?? null;
    }

    return null;
  }

  private getStripeSecretKey() {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new InternalServerErrorException(
        'STRIPE_SECRET_KEY is not configured.',
      );
    }
    return stripeSecretKey;
  }

  private async sendOrderCompletionEmail(order: CheckoutOrderResponse) {
    if (!order.customerEmail) {
      return;
    }

    try {
      await this.emailService.sendOrderCompletedEmail(order.customerEmail, {
        orderId: order.id,
        totalAmount: order.totalAmount,
        currency: order.currency,
        items: order.items.map((item) => ({
          productName: item.productName,
          shirtColor: item.shirtColor,
          shirtSize: item.shirtSize,
          quantity: item.quantity,
          totalAmount: item.totalAmount,
        })),
      });
    } catch {
      // Email delivery must not block successful checkout confirmation.
    }
  }

  private assertAdmin(cookieHeader?: string) {
    const email = this.assertAuthenticatedEmail(cookieHeader);
    const admins = (this.configService.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!admins.length) {
      throw new ForbiddenException('ADMIN_EMAILS is not configured.');
    }
    if (!email || !admins.includes(email)) {
      throw new ForbiddenException('Admin access required.');
    }
  }

  private assertAuthenticatedEmail(cookieHeader?: string) {
    const token = this.getCookieValue(cookieHeader, 'Authentication');
    if (!token) {
      throw new ForbiddenException('Authentication required.');
    }

    const payload = this.verifyTokenPayload(token);
    const email = String(payload?.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) {
      throw new ForbiddenException('Authentication required.');
    }

    return email;
  }

  private getCookieValue(cookieHeader: string | undefined, name: string) {
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';');
    for (const cookieEntry of cookies) {
      const [key, ...rest] = cookieEntry.split('=');
      if (key?.trim() === name) {
        return decodeURIComponent(rest.join('=').trim());
      }
    }

    return undefined;
  }

  private verifyTokenPayload(
    token: string,
  ): { email?: string; exp?: number } | null {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) {
      return null;
    }

    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') ?? 'dev-secret';
    const unsignedToken = `${header}.${payload}`;
    const expectedSignature = this.base64url(
      createHmac('sha256', jwtSecret).update(unsignedToken).digest(),
    );

    if (expectedSignature !== signature) {
      return null;
    }

    try {
      const parsed = JSON.parse(this.decodeBase64url(payload)) as {
        email?: string;
        exp?: number;
      };

      if (parsed.exp && Date.now() / 1000 > parsed.exp) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private decodeBase64url(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = normalized.length % 4;
    const padded =
      padLength === 0 ? normalized : normalized + '='.repeat(4 - padLength);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private base64url(value: Buffer) {
    return value
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async fetchStripeSession(sessionId: string, stripeSecretKey: string) {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
      },
    );

    if (!response.ok) {
      const stripeError = (await response.json()) as StripeErrorResponse;
      throw new BadGatewayException(
        stripeError.error?.message ?? 'Failed to read Stripe checkout session.',
      );
    }

    return (await response.json()) as StripeSessionResponse;
  }

  private async fetchStripeLineItems(
    sessionId: string,
    stripeSecretKey: string,
  ) {
    const params = new URLSearchParams({ limit: '100' });
    params.append('expand[]', 'data.price.product');

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params.toString()}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
      },
    );

    if (!response.ok) {
      const stripeError = (await response.json()) as StripeErrorResponse;
      throw new BadGatewayException(
        stripeError.error?.message ??
          'Failed to load Stripe checkout line items.',
      );
    }

    const payload = (await response.json()) as StripeLineItemsResponse;
    return payload.data ?? [];
  }

  private async fetchRecentlyPaidStripeSessionIds(stripeSecretKey: string) {
    const ids: string[] = [];
    let startingAfter: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({
        limit: '100',
        payment_status: 'paid',
      });
      if (startingAfter) {
        params.set('starting_after', startingAfter);
      }

      const response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions?${params.toString()}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${stripeSecretKey}` },
        },
      );

      if (!response.ok) {
        const stripeError = (await response.json()) as StripeErrorResponse;
        throw new BadGatewayException(
          stripeError.error?.message ??
            'Failed to load paid Stripe checkout sessions.',
        );
      }

      const payload = (await response.json()) as StripeSessionListResponse;
      const pageSessions = payload.data ?? [];
      const paidIds = pageSessions
        .filter((session) => session.payment_status === 'paid')
        .map((session) => session.id)
        .filter((id): id is string => !!id);
      ids.push(...paidIds);

      const lastId = pageSessions.at(-1)?.id;
      if (!payload.has_more || !lastId) {
        break;
      }
      startingAfter = lastId;
    }

    return [...new Set(ids)];
  }

  private extractDeliveryAddress(metadata: Record<string, string> | undefined) {
    const fullName = metadata?.deliveryFullName?.trim() ?? '';
    const phone = metadata?.deliveryPhone?.trim() || undefined;
    const line1 = metadata?.deliveryAddressLine1?.trim() ?? '';
    const line2 = metadata?.deliveryAddressLine2?.trim() || undefined;
    const city = metadata?.deliveryCity?.trim() ?? '';
    const state = metadata?.deliveryState?.trim() ?? '';
    const postalCode = metadata?.deliveryPostalCode?.trim() ?? '';
    const country = metadata?.deliveryCountry?.trim() ?? '';

    const deliveryAddress: DeliveryAddressRequest = {
      fullName,
      phone,
      line1,
      line2,
      city,
      state,
      postalCode,
      country,
    };

    const missingRequired =
      !fullName || !line1 || !city || !state || !postalCode || !country;
    if (missingRequired) {
      throw new BadRequestException(
        'Delivery address is missing from the checkout session metadata.',
      );
    }
    return deliveryAddress;
  }

  private async ensureOrderTables() {
    if (this.orderTablesReady) {
      return;
    }

    await this.prismaService.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CheckoutOrder" (
        "id" SERIAL PRIMARY KEY,
        "stripeSessionId" TEXT NOT NULL UNIQUE,
        "totalAmountCents" INTEGER NOT NULL,
        "currency" TEXT NOT NULL,
        "customerEmail" TEXT,
        "deliveryFullName" TEXT NOT NULL,
        "deliveryPhone" TEXT,
        "deliveryAddressLine1" TEXT NOT NULL,
        "deliveryAddressLine2" TEXT,
        "deliveryCity" TEXT NOT NULL,
        "deliveryState" TEXT NOT NULL,
        "deliveryPostalCode" TEXT NOT NULL,
        "deliveryCountry" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE "CheckoutOrder"
      ADD COLUMN IF NOT EXISTS "deliveryPhone" TEXT
    `);

    await this.prismaService.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CheckoutOrderItem" (
        "id" SERIAL PRIMARY KEY,
        "orderId" INTEGER NOT NULL REFERENCES "CheckoutOrder"("id") ON DELETE CASCADE,
        "productName" TEXT NOT NULL,
        "productDescription" TEXT,
        "shirtColor" TEXT,
        "shirtSize" TEXT,
        "quantity" INTEGER NOT NULL,
        "unitAmountCents" INTEGER NOT NULL,
        "totalAmountCents" INTEGER NOT NULL
      )
    `);

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE "CheckoutOrderItem"
      ADD COLUMN IF NOT EXISTS "shirtColor" TEXT
    `);

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE "CheckoutOrderItem"
      ADD COLUMN IF NOT EXISTS "shirtSize" TEXT
    `);

    this.orderTablesReady = true;
  }

  private async findOrderBySessionId(sessionId: string) {
    const orderRows = await this.prismaService.$queryRaw<CheckoutOrderRow[]>`
      SELECT
        "id",
        "stripeSessionId",
        "totalAmountCents",
        "currency",
        "customerEmail",
        "deliveryFullName",
        "deliveryPhone",
        "deliveryAddressLine1",
        "deliveryAddressLine2",
        "deliveryCity",
        "deliveryState",
        "deliveryPostalCode",
        "deliveryCountry",
        "createdAt"
      FROM "CheckoutOrder"
      WHERE "stripeSessionId" = ${sessionId}
      LIMIT 1
    `;
    const orderRow = orderRows[0];
    if (!orderRow) {
      return null;
    }

    let itemRows = await this.loadOrderItems(orderRow.id);
    if (itemRows.some((item) => !item.shirtColor || !item.shirtSize)) {
      await this.backfillMissingOrderItemSelections(orderRow, itemRows);
      itemRows = await this.loadOrderItems(orderRow.id);
    }

    return this.toOrderResponse(orderRow, itemRows);
  }

  private toOrderResponse(
    orderRow: CheckoutOrderRow,
    itemRows: CheckoutOrderItemRow[],
  ): CheckoutOrderResponse {
    return {
      id: orderRow.id,
      stripeSessionId: orderRow.stripeSessionId,
      totalAmount: orderRow.totalAmountCents / 100,
      currency: orderRow.currency,
      customerEmail: orderRow.customerEmail,
      deliveryAddress: {
        fullName: orderRow.deliveryFullName,
        phone: orderRow.deliveryPhone,
        line1: orderRow.deliveryAddressLine1,
        line2: orderRow.deliveryAddressLine2,
        city: orderRow.deliveryCity,
        state: orderRow.deliveryState,
        postalCode: orderRow.deliveryPostalCode,
        country: orderRow.deliveryCountry,
      },
      createdAt: orderRow.createdAt,
      items: itemRows.map((item) => {
        const shirtSelection = this.extractShirtSelection(
          item.productName,
          item.productDescription,
        );

        return {
          id: item.id,
          productName: item.productName,
          productDescription: item.productDescription,
          shirtColor: item.shirtColor ?? shirtSelection.color,
          shirtSize: item.shirtSize ?? shirtSelection.size,
          quantity: item.quantity,
          unitAmount: item.unitAmountCents / 100,
          totalAmount: item.totalAmountCents / 100,
        };
      }),
    };
  }
}

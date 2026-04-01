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
    quantity: number;
    unitAmount: number;
    totalAmount: number;
  }>;
};

const SHIRT_PRODUCT = {
  id: 1,
  name: 'Classic Shirt',
  description: 'Premium cotton shirt with a modern fit.',
  unitAmountCents: 3999,
  stockByColorAndSize: {
    black: {
      XS: 10,
      S: 15,
      M: 20,
      L: 12,
      XL: 8,
    },
    white: {
      XS: 8,
      S: 12,
      M: 18,
      L: 10,
      XL: 6,
    },
  },
} as const;

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
      payload.append(
        `line_items[${index}][quantity]`,
        item.quantity.toString(),
      );
      payload.append(`line_items[${index}][price_data][currency]`, 'usd');
      payload.append(
        `line_items[${index}][price_data][unit_amount]`,
        SHIRT_PRODUCT.unitAmountCents.toString(),
      );
      payload.append(
        `line_items[${index}][price_data][product_data][name]`,
        SHIRT_PRODUCT.name,
      );
      payload.append(
        `line_items[${index}][price_data][product_data][description]`,
        `${SHIRT_PRODUCT.description} - Color: ${item.color}, Size: ${item.size}`,
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
    const currency = (stripeSession.currency ?? 'usd').toUpperCase();

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

    for (const lineItem of stripeLineItems) {
      const quantity = lineItem.quantity ?? 1;
      const totalLineAmount = lineItem.amount_total ?? 0;
      const unitAmount =
        lineItem.price?.unit_amount ??
        (quantity > 0 ? Math.round(totalLineAmount / quantity) : 0);

      await this.prismaService.$executeRaw`
        INSERT INTO "CheckoutOrderItem" (
          "orderId",
          "productName",
          "productDescription",
          "quantity",
          "unitAmountCents",
          "totalAmountCents"
        )
        VALUES (
          ${createdOrder.id},
          ${lineItem.description ?? SHIRT_PRODUCT.name},
          ${lineItem.price?.product_details?.description ?? null},
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

    const orders: CheckoutOrderResponse[] = [];
    for (const orderRow of orderRows) {
      const itemRows = await this.prismaService.$queryRaw<
        CheckoutOrderItemRow[]
      >`
        SELECT
          "id",
          "orderId",
          "productName",
          "productDescription",
          "quantity",
          "unitAmountCents",
          "totalAmountCents"
        FROM "CheckoutOrderItem"
        WHERE "orderId" = ${orderRow.id}
        ORDER BY "id" ASC
      `;
      orders.push(this.toOrderResponse(orderRow, itemRows));
    }
    return orders;
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

  private validateItems(items: CreateSessionItemRequest[]) {
    return items.map((item) => {
      if (item.productId !== SHIRT_PRODUCT.id) {
        throw new BadRequestException('Product not found.');
      }
      const availableStock =
        SHIRT_PRODUCT.stockByColorAndSize[item.color][item.size];
      if (item.quantity > availableStock) {
        throw new BadRequestException(
          `Only ${availableStock} item(s) available for ${item.color}/${item.size}.`,
        );
      }
      return item;
    });
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
          quantity: item.quantity,
          totalAmount: item.totalAmount,
        })),
      });
    } catch {
      // Email delivery must not block successful checkout confirmation.
    }
  }

  private assertAdmin(cookieHeader?: string) {
    const token = this.getCookieValue(cookieHeader, 'Authentication');
    if (!token) {
      throw new ForbiddenException('Admin access required.');
    }

    const payload = this.verifyTokenPayload(token);
    if (!payload) {
      throw new ForbiddenException('Admin access required.');
    }

    const email = String(payload.email ?? '')
      .trim()
      .toLowerCase();
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
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100`,
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
        "quantity" INTEGER NOT NULL,
        "unitAmountCents" INTEGER NOT NULL,
        "totalAmountCents" INTEGER NOT NULL
      )
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

    const itemRows = await this.prismaService.$queryRaw<CheckoutOrderItemRow[]>`
      SELECT
        "id",
        "orderId",
        "productName",
        "productDescription",
        "quantity",
        "unitAmountCents",
        "totalAmountCents"
      FROM "CheckoutOrderItem"
      WHERE "orderId" = ${orderRow.id}
      ORDER BY "id" ASC
    `;

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
      items: itemRows.map((item) => ({
        id: item.id,
        productName: item.productName,
        productDescription: item.productDescription,
        quantity: item.quantity,
        unitAmount: item.unitAmountCents / 100,
        totalAmount: item.totalAmountCents / 100,
      })),
    };
  }
}

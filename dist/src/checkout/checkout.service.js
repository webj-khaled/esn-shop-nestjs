"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const email_service_1 = require("../email/email.service");
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
};
const STRIPE_CURRENCY = 'eur';
let CheckoutService = class CheckoutService {
    configService;
    prismaService;
    emailService;
    orderTablesReady = false;
    lastBackfillAttemptAt = 0;
    constructor(configService, prismaService, emailService) {
        this.configService = configService;
        this.prismaService = prismaService;
        this.emailService = emailService;
    }
    async createSession(request) {
        const items = this.validateItems(request.items);
        const deliveryAddress = request.deliveryAddress;
        const stripeSecretKey = this.getStripeSecretKey();
        const frontendBaseUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';
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
            payload.append(`line_items[${index}][quantity]`, item.quantity.toString());
            payload.append(`line_items[${index}][price_data][currency]`, STRIPE_CURRENCY);
            payload.append(`line_items[${index}][price_data][unit_amount]`, SHIRT_PRODUCT.unitAmountCents.toString());
            payload.append(`line_items[${index}][price_data][product_data][name]`, SHIRT_PRODUCT.name);
            payload.append(`line_items[${index}][price_data][product_data][description]`, `${SHIRT_PRODUCT.description} - Color: ${item.color}, Size: ${item.size}`);
            payload.append(`line_items[${index}][adjustable_quantity][enabled]`, 'false');
        });
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: payload.toString(),
        });
        if (!stripeResponse.ok) {
            const stripeError = (await stripeResponse.json());
            throw new common_1.BadGatewayException(stripeError.error?.message ??
                'Failed to create Stripe checkout session.');
        }
        const stripeSession = (await stripeResponse.json());
        if (!stripeSession.url) {
            throw new common_1.BadGatewayException('Stripe session URL is missing.');
        }
        return { url: stripeSession.url, sessionId: stripeSession.id };
    }
    async confirmSession(sessionId, options) {
        await this.ensureOrderTables();
        const existingOrder = await this.findOrderBySessionId(sessionId);
        if (existingOrder) {
            return existingOrder;
        }
        const stripeSecretKey = this.getStripeSecretKey();
        const stripeSession = await this.fetchStripeSession(sessionId, stripeSecretKey);
        if (stripeSession.payment_status !== 'paid') {
            throw new common_1.BadRequestException('Checkout session is not paid yet. Please complete payment first.');
        }
        const stripeLineItems = await this.fetchStripeLineItems(sessionId, stripeSecretKey);
        if (!stripeLineItems.length) {
            throw new common_1.BadGatewayException('No line items found for this checkout.');
        }
        const deliveryAddress = this.extractDeliveryAddress(stripeSession.metadata);
        const totalAmountCents = stripeSession.amount_total ??
            stripeLineItems.reduce((sum, item) => sum + (item.amount_total ?? 0), 0);
        const currency = (stripeSession.currency ?? STRIPE_CURRENCY).toUpperCase();
        const createdOrderRows = await this.prismaService.$queryRaw `
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
            throw new common_1.InternalServerErrorException('Failed to persist checkout order.');
        }
        for (const [index, lineItem] of stripeLineItems.entries()) {
            const quantity = lineItem.quantity ?? 1;
            const totalLineAmount = lineItem.amount_total ?? 0;
            const unitAmount = lineItem.price?.unit_amount ??
                (quantity > 0 ? Math.round(totalLineAmount / quantity) : 0);
            const productName = lineItem.description ?? SHIRT_PRODUCT.name;
            const productDescription = this.resolveStripeLineItemDescription(lineItem);
            const shirtSelection = this.extractShirtSelection(productName, productDescription);
            const metadataColor = stripeSession.metadata?.[`item${index}Color`];
            const metadataSize = stripeSession.metadata?.[`item${index}Size`];
            await this.prismaService.$executeRaw `
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
            throw new common_1.InternalServerErrorException('Order was created but could not be loaded.');
        }
        if (options?.sendCompletionEmail !== false) {
            await this.sendOrderCompletionEmail(orderWithItems);
        }
        return orderWithItems;
    }
    async getOrders(cookieHeader) {
        this.assertAdmin(cookieHeader);
        await this.ensureOrderTables();
        await this.backfillMissingOrders();
        const orderRows = await this.prismaService.$queryRaw `
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
    async getMyOrders(cookieHeader) {
        const email = this.assertAuthenticatedEmail(cookieHeader);
        await this.ensureOrderTables();
        const orderRows = await this.prismaService.$queryRaw `
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
    async loadOrdersWithItems(orderRows) {
        const orders = [];
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
    async loadOrderItems(orderId) {
        return this.prismaService.$queryRaw `
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
    async backfillMissingOrderItemSelections(orderRow, itemRows) {
        try {
            const stripeSecretKey = this.getStripeSecretKey();
            const stripeSession = await this.fetchStripeSession(orderRow.stripeSessionId, stripeSecretKey);
            const stripeLineItems = await this.fetchStripeLineItems(orderRow.stripeSessionId, stripeSecretKey);
            for (const [index, itemRow] of itemRows.entries()) {
                if (itemRow.shirtColor && itemRow.shirtSize) {
                    continue;
                }
                const stripeLineItem = stripeLineItems[index];
                const metadataColor = stripeSession.metadata?.[`item${index}Color`];
                const metadataSize = stripeSession.metadata?.[`item${index}Size`];
                const parsedSelection = this.extractShirtSelection(stripeLineItem?.description ?? itemRow.productName, this.resolveStripeLineItemDescription(stripeLineItem) ??
                    itemRow.productDescription);
                const shirtColor = metadataColor?.toLowerCase() ?? parsedSelection.color;
                const shirtSize = metadataSize?.toUpperCase() ?? parsedSelection.size;
                if (!shirtColor && !shirtSize) {
                    continue;
                }
                await this.prismaService.$executeRaw `
          UPDATE "CheckoutOrderItem"
          SET
            "shirtColor" = COALESCE("shirtColor", ${shirtColor}),
            "shirtSize" = COALESCE("shirtSize", ${shirtSize})
          WHERE "id" = ${itemRow.id}
        `;
            }
        }
        catch {
        }
    }
    async backfillMissingOrders() {
        const backfillCooldownMs = 60_000;
        if (Date.now() - this.lastBackfillAttemptAt < backfillCooldownMs) {
            return;
        }
        this.lastBackfillAttemptAt = Date.now();
        try {
            const stripeSecretKey = this.getStripeSecretKey();
            const paidSessionIds = await this.fetchRecentlyPaidStripeSessionIds(stripeSecretKey);
            for (const sessionId of paidSessionIds) {
                const existing = await this.findOrderBySessionId(sessionId);
                if (existing) {
                    continue;
                }
                try {
                    await this.confirmSession(sessionId, { sendCompletionEmail: false });
                }
                catch {
                }
            }
        }
        catch {
        }
    }
    validateItems(items) {
        return items.map((item) => {
            if (item.productId !== SHIRT_PRODUCT.id) {
                throw new common_1.BadRequestException('Product not found.');
            }
            const availableStock = SHIRT_PRODUCT.stockByColorAndSize[item.color][item.size];
            if (item.quantity > availableStock) {
                throw new common_1.BadRequestException('Selected quantity is not available for this color/size option.');
            }
            return item;
        });
    }
    extractShirtSelection(productName, productDescription) {
        const source = `${productName ?? ''} ${productDescription ?? ''}`;
        const colorMatch = source.match(/color:\s*([a-z]+)/i);
        const sizeMatch = source.match(/size:\s*([a-z0-9]+)/i);
        return {
            color: colorMatch?.[1]?.toLowerCase() ?? null,
            size: sizeMatch?.[1]?.toUpperCase() ?? null,
        };
    }
    resolveStripeLineItemDescription(lineItem) {
        const productDetailsDescription = lineItem?.price?.product_details?.description;
        if (productDetailsDescription) {
            return productDetailsDescription;
        }
        const product = lineItem?.price?.product;
        if (product && typeof product === 'object') {
            return product.description ?? null;
        }
        return null;
    }
    getStripeSecretKey() {
        const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
        if (!stripeSecretKey) {
            throw new common_1.InternalServerErrorException('STRIPE_SECRET_KEY is not configured.');
        }
        return stripeSecretKey;
    }
    async sendOrderCompletionEmail(order) {
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
        }
        catch {
        }
    }
    assertAdmin(cookieHeader) {
        const email = this.assertAuthenticatedEmail(cookieHeader);
        const admins = (this.configService.get('ADMIN_EMAILS') ?? '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        if (!admins.length) {
            throw new common_1.ForbiddenException('ADMIN_EMAILS is not configured.');
        }
        if (!email || !admins.includes(email)) {
            throw new common_1.ForbiddenException('Admin access required.');
        }
    }
    assertAuthenticatedEmail(cookieHeader) {
        const token = this.getCookieValue(cookieHeader, 'Authentication');
        if (!token) {
            throw new common_1.ForbiddenException('Authentication required.');
        }
        const payload = this.verifyTokenPayload(token);
        const email = String(payload?.email ?? '')
            .trim()
            .toLowerCase();
        if (!email) {
            throw new common_1.ForbiddenException('Authentication required.');
        }
        return email;
    }
    getCookieValue(cookieHeader, name) {
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
    verifyTokenPayload(token) {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) {
            return null;
        }
        const jwtSecret = this.configService.get('JWT_SECRET') ?? 'dev-secret';
        const unsignedToken = `${header}.${payload}`;
        const expectedSignature = this.base64url((0, crypto_1.createHmac)('sha256', jwtSecret).update(unsignedToken).digest());
        if (expectedSignature !== signature) {
            return null;
        }
        try {
            const parsed = JSON.parse(this.decodeBase64url(payload));
            if (parsed.exp && Date.now() / 1000 > parsed.exp) {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    decodeBase64url(value) {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = normalized.length % 4;
        const padded = padLength === 0 ? normalized : normalized + '='.repeat(4 - padLength);
        return Buffer.from(padded, 'base64').toString('utf8');
    }
    base64url(value) {
        return value
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    async fetchStripeSession(sessionId, stripeSecretKey) {
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
        });
        if (!response.ok) {
            const stripeError = (await response.json());
            throw new common_1.BadGatewayException(stripeError.error?.message ?? 'Failed to read Stripe checkout session.');
        }
        return (await response.json());
    }
    async fetchStripeLineItems(sessionId, stripeSecretKey) {
        const params = new URLSearchParams({ limit: '100' });
        params.append('expand[]', 'data.price.product');
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params.toString()}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
        });
        if (!response.ok) {
            const stripeError = (await response.json());
            throw new common_1.BadGatewayException(stripeError.error?.message ??
                'Failed to load Stripe checkout line items.');
        }
        const payload = (await response.json());
        return payload.data ?? [];
    }
    async fetchRecentlyPaidStripeSessionIds(stripeSecretKey) {
        const ids = [];
        let startingAfter;
        for (let page = 0; page < 20; page += 1) {
            const params = new URLSearchParams({
                limit: '100',
                payment_status: 'paid',
            });
            if (startingAfter) {
                params.set('starting_after', startingAfter);
            }
            const response = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params.toString()}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${stripeSecretKey}` },
            });
            if (!response.ok) {
                const stripeError = (await response.json());
                throw new common_1.BadGatewayException(stripeError.error?.message ??
                    'Failed to load paid Stripe checkout sessions.');
            }
            const payload = (await response.json());
            const pageSessions = payload.data ?? [];
            const paidIds = pageSessions
                .filter((session) => session.payment_status === 'paid')
                .map((session) => session.id)
                .filter((id) => !!id);
            ids.push(...paidIds);
            const lastId = pageSessions.at(-1)?.id;
            if (!payload.has_more || !lastId) {
                break;
            }
            startingAfter = lastId;
        }
        return [...new Set(ids)];
    }
    extractDeliveryAddress(metadata) {
        const fullName = metadata?.deliveryFullName?.trim() ?? '';
        const phone = metadata?.deliveryPhone?.trim() || undefined;
        const line1 = metadata?.deliveryAddressLine1?.trim() ?? '';
        const line2 = metadata?.deliveryAddressLine2?.trim() || undefined;
        const city = metadata?.deliveryCity?.trim() ?? '';
        const state = metadata?.deliveryState?.trim() ?? '';
        const postalCode = metadata?.deliveryPostalCode?.trim() ?? '';
        const country = metadata?.deliveryCountry?.trim() ?? '';
        const deliveryAddress = {
            fullName,
            phone,
            line1,
            line2,
            city,
            state,
            postalCode,
            country,
        };
        const missingRequired = !fullName || !line1 || !city || !state || !postalCode || !country;
        if (missingRequired) {
            throw new common_1.BadRequestException('Delivery address is missing from the checkout session metadata.');
        }
        return deliveryAddress;
    }
    async ensureOrderTables() {
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
    async findOrderBySessionId(sessionId) {
        const orderRows = await this.prismaService.$queryRaw `
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
    toOrderResponse(orderRow, itemRows) {
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
                const shirtSelection = this.extractShirtSelection(item.productName, item.productDescription);
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
};
exports.CheckoutService = CheckoutService;
exports.CheckoutService = CheckoutService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        email_service_1.EmailService])
], CheckoutService);
//# sourceMappingURL=checkout.service.js.map
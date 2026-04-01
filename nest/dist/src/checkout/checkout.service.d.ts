import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateSessionRequest } from './dto/create-session.request';
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
export declare class CheckoutService {
    private readonly configService;
    private readonly prismaService;
    private readonly emailService;
    private orderTablesReady;
    private lastBackfillAttemptAt;
    constructor(configService: ConfigService, prismaService: PrismaService, emailService: EmailService);
    createSession(request: CreateSessionRequest): Promise<{
        url: string;
        sessionId: string | undefined;
    }>;
    confirmSession(sessionId: string, options?: {
        sendCompletionEmail?: boolean;
    }): Promise<CheckoutOrderResponse>;
    getOrders(cookieHeader?: string): Promise<CheckoutOrderResponse[]>;
    private backfillMissingOrders;
    private validateItems;
    private getStripeSecretKey;
    private sendOrderCompletionEmail;
    private assertAdmin;
    private getCookieValue;
    private verifyTokenPayload;
    private decodeBase64url;
    private base64url;
    private fetchStripeSession;
    private fetchStripeLineItems;
    private fetchRecentlyPaidStripeSessionIds;
    private extractDeliveryAddress;
    private ensureOrderTables;
    private findOrderBySessionId;
    private toOrderResponse;
}
export {};

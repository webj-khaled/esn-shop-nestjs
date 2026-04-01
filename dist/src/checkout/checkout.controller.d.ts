import { CheckoutService } from './checkout.service';
import { CreateSessionRequest } from './dto/create-session.request';
import { ConfirmSessionRequest } from './dto/confirm-session.request';
export declare class CheckoutController {
    private readonly checkoutService;
    constructor(checkoutService: CheckoutService);
    createSession(request: CreateSessionRequest): Promise<{
        url: string;
        sessionId: string | undefined;
    }>;
    confirm(request: ConfirmSessionRequest): Promise<{
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
    }>;
    getOrders(cookieHeader?: string): Promise<{
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
    }[]>;
}

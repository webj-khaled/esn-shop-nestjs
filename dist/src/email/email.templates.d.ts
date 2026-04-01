export interface EmailTemplate {
    subject: string;
    html: string;
    text: string;
}
export interface OrderCompletionTemplateInput {
    orderId: number;
    totalAmount: number;
    currency: string;
    items: Array<{
        productName: string;
        quantity: number;
        totalAmount: number;
    }>;
}
export declare const buildWelcomeEmail: (appName: string) => EmailTemplate;
export declare const buildPasswordResetEmail: (appName: string, resetUrl: string, expiresInMinutes: number) => EmailTemplate;
export declare const buildOrderCompletedEmail: (appName: string, input: OrderCompletionTemplateInput) => EmailTemplate;

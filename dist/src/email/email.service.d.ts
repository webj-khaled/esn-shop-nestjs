import { ConfigService } from '@nestjs/config';
import { OrderCompletionTemplateInput } from './email.templates';
export declare class EmailService {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService);
    sendWelcomeEmail(to: string): Promise<void>;
    sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
    sendOrderCompletedEmail(to: string, order: OrderCompletionTemplateInput): Promise<void>;
    sendTestEmail(to: string, subject?: string, message?: string): Promise<void>;
    private getAppName;
    private getPasswordResetTtlMinutes;
    private getResendApiKey;
    private getEmailFromAddress;
    private sendEmail;
}

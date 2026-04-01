import { ConfigService } from '@nestjs/config';
import { SendTestEmailRequest } from './dto/send-test-email.request';
import { EmailService } from './email.service';
export declare class EmailController {
    private readonly configService;
    private readonly emailService;
    constructor(configService: ConfigService, emailService: EmailService);
    sendTestEmail(request: SendTestEmailRequest): Promise<{
        message: string;
    }>;
}

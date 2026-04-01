import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildOrderCompletedEmail,
  buildPasswordResetEmail,
  buildWelcomeEmail,
  OrderCompletionTemplateInput,
} from './email.templates';

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendWelcomeEmail(to: string) {
    const appName = this.getAppName();
    const template = buildWelcomeEmail(appName);
    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const appName = this.getAppName();
    const expiresInMinutes = this.getPasswordResetTtlMinutes();
    const template = buildPasswordResetEmail(
      appName,
      resetUrl,
      expiresInMinutes,
    );
    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendOrderCompletedEmail(
    to: string,
    order: OrderCompletionTemplateInput,
  ) {
    const appName = this.getAppName();
    const template = buildOrderCompletedEmail(appName, order);
    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendTestEmail(to: string, subject?: string, message?: string) {
    await this.sendEmail({
      to,
      subject: subject?.trim() || 'Email service test',
      html: `<p>${message?.trim() || 'Resend integration is working.'}</p>`,
      text: message?.trim() || 'Resend integration is working.',
    });
  }

  private getAppName() {
    return (this.configService.get<string>('APP_NAME') ?? 'Shoppy').trim();
  }

  private getPasswordResetTtlMinutes() {
    const ttl = this.configService.get<number>('PASSWORD_RESET_TTL_MINUTES');
    if (ttl && ttl > 0) {
      return ttl;
    }
    return 30;
  }

  private getResendApiKey() {
    const value = this.configService.get<string>('RESEND_API_KEY')?.trim();
    if (!value) {
      throw new InternalServerErrorException(
        'RESEND_API_KEY is not configured.',
      );
    }
    return value;
  }

  private getEmailFromAddress() {
    const value = this.configService.get<string>('EMAIL_FROM')?.trim();
    if (!value) {
      throw new InternalServerErrorException('EMAIL_FROM is not configured.');
    }
    return value;
  }

  private async sendEmail(payload: SendEmailPayload) {
    const resendApiKey = this.getResendApiKey();
    const from = this.getEmailFromAddress();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send email.';
      try {
        const responseBody = (await response.json()) as {
          message?: string;
          error?: string;
        };
        errorMessage =
          responseBody.message ?? responseBody.error ?? errorMessage;
      } catch {
        // Use fallback message for non-JSON responses.
      }
      this.logger.error(`Email send failed: ${errorMessage}`);
      throw new BadGatewayException(errorMessage);
    }
  }
}

import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendTestEmailRequest } from './dto/send-test-email.request';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  @Post('test')
  async sendTestEmail(@Body() request: SendTestEmailRequest) {
    const enabled =
      this.configService.get<string>('EMAIL_TEST_ENDPOINT_ENABLED') === 'true';
    if (!enabled) {
      throw new ForbiddenException('Email test endpoint is disabled.');
    }

    await this.emailService.sendTestEmail(
      request.to,
      request.subject,
      request.message,
    );

    return { message: 'Test email sent.' };
  }
}

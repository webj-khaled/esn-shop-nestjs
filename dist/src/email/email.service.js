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
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const email_templates_1 = require("./email.templates");
let EmailService = EmailService_1 = class EmailService {
    configService;
    logger = new common_1.Logger(EmailService_1.name);
    constructor(configService) {
        this.configService = configService;
    }
    async sendWelcomeEmail(to) {
        const appName = this.getAppName();
        const template = (0, email_templates_1.buildWelcomeEmail)(appName);
        await this.sendEmail({
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendPasswordResetEmail(to, resetUrl) {
        const appName = this.getAppName();
        const expiresInMinutes = this.getPasswordResetTtlMinutes();
        const template = (0, email_templates_1.buildPasswordResetEmail)(appName, resetUrl, expiresInMinutes);
        await this.sendEmail({
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendOrderCompletedEmail(to, order) {
        const appName = this.getAppName();
        const template = (0, email_templates_1.buildOrderCompletedEmail)(appName, order);
        await this.sendEmail({
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendTestEmail(to, subject, message) {
        await this.sendEmail({
            to,
            subject: subject?.trim() || 'Email service test',
            html: `<p>${message?.trim() || 'Resend integration is working.'}</p>`,
            text: message?.trim() || 'Resend integration is working.',
        });
    }
    getAppName() {
        return (this.configService.get('APP_NAME') ?? 'Shoppy').trim();
    }
    getPasswordResetTtlMinutes() {
        const ttl = this.configService.get('PASSWORD_RESET_TTL_MINUTES');
        if (ttl && ttl > 0) {
            return ttl;
        }
        return 30;
    }
    getResendApiKey() {
        const value = this.configService.get('RESEND_API_KEY')?.trim();
        if (!value) {
            throw new common_1.InternalServerErrorException('RESEND_API_KEY is not configured.');
        }
        return value;
    }
    getEmailFromAddress() {
        const value = this.configService.get('EMAIL_FROM')?.trim();
        if (!value) {
            throw new common_1.InternalServerErrorException('EMAIL_FROM is not configured.');
        }
        return value;
    }
    async sendEmail(payload) {
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
                const responseBody = (await response.json());
                errorMessage =
                    responseBody.message ?? responseBody.error ?? errorMessage;
            }
            catch {
            }
            this.logger.error(`Email send failed: ${errorMessage}`);
            throw new common_1.BadGatewayException(errorMessage);
        }
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
//# sourceMappingURL=email.service.js.map
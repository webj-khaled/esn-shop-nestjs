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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const send_test_email_request_1 = require("./dto/send-test-email.request");
const email_service_1 = require("./email.service");
let EmailController = class EmailController {
    configService;
    emailService;
    constructor(configService, emailService) {
        this.configService = configService;
        this.emailService = emailService;
    }
    async sendTestEmail(request) {
        const enabled = this.configService.get('EMAIL_TEST_ENDPOINT_ENABLED') === 'true';
        if (!enabled) {
            throw new common_1.ForbiddenException('Email test endpoint is disabled.');
        }
        await this.emailService.sendTestEmail(request.to, request.subject, request.message);
        return { message: 'Test email sent.' };
    }
};
exports.EmailController = EmailController;
__decorate([
    (0, common_1.Post)('test'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_test_email_request_1.SendTestEmailRequest]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendTestEmail", null);
exports.EmailController = EmailController = __decorate([
    (0, common_1.Controller)('email'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        email_service_1.EmailService])
], EmailController);
//# sourceMappingURL=email.controller.js.map
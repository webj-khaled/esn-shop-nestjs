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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const login_request_1 = require("./dto/login.request");
const auth_service_1 = require("./auth.service");
const login_success_1 = require("./dto/login.success");
const recovery_start_request_1 = require("./dto/recovery-start.request");
const recovery_complete_request_1 = require("./dto/recovery-complete.request");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(payload, userAgent, response) {
        const result = await this.authService.login(payload.identifier, payload.password, userAgent);
        response.cookie('Authentication', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: result.expiresAt,
            path: '/',
        });
        return new login_success_1.LoginSuccessResponse();
    }
    startRecovery(payload) {
        return this.authService.startPasswordRecovery(payload.identifier);
    }
    completeRecovery(payload) {
        return this.authService.completePasswordRecovery(payload.token, payload.password);
    }
    getAuthState(cookieHeader) {
        return this.authService.getAuthenticationState(cookieHeader);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('user-agent')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_request_1.LoginRequest, String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('password-recovery/start'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recovery_start_request_1.RecoveryStartRequest]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "startRecovery", null);
__decorate([
    (0, common_1.Post)('password-recovery/complete'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recovery_complete_request_1.RecoveryCompleteRequest]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "completeRecovery", null);
__decorate([
    (0, common_1.Get)('state'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getAuthState", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map
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
exports.CheckoutController = void 0;
const common_1 = require("@nestjs/common");
const checkout_service_1 = require("./checkout.service");
const create_session_request_1 = require("./dto/create-session.request");
const confirm_session_request_1 = require("./dto/confirm-session.request");
let CheckoutController = class CheckoutController {
    checkoutService;
    constructor(checkoutService) {
        this.checkoutService = checkoutService;
    }
    createSession(request) {
        return this.checkoutService.createSession(request);
    }
    confirm(request) {
        return this.checkoutService.confirmSession(request.sessionId);
    }
    getOrders(cookieHeader) {
        return this.checkoutService.getOrders(cookieHeader);
    }
    getMyOrders(cookieHeader) {
        return this.checkoutService.getMyOrders(cookieHeader);
    }
};
exports.CheckoutController = CheckoutController;
__decorate([
    (0, common_1.Post)('session'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_session_request_1.CreateSessionRequest]),
    __metadata("design:returntype", void 0)
], CheckoutController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)('confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [confirm_session_request_1.ConfirmSessionRequest]),
    __metadata("design:returntype", void 0)
], CheckoutController.prototype, "confirm", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckoutController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('my-orders'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckoutController.prototype, "getMyOrders", null);
exports.CheckoutController = CheckoutController = __decorate([
    (0, common_1.Controller)('checkout'),
    __metadata("design:paramtypes", [checkout_service_1.CheckoutService])
], CheckoutController);
//# sourceMappingURL=checkout.controller.js.map
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateSessionRequest = exports.DeliveryAddressRequest = exports.CreateSessionItemRequest = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const colors = ['black', 'white'];
const sizes = ['XS', 'S', 'M', 'L', 'XL'];
class CreateSessionItemRequest {
    productId;
    color;
    size;
    quantity;
}
exports.CreateSessionItemRequest = CreateSessionItemRequest;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSessionItemRequest.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(colors),
    __metadata("design:type", Object)
], CreateSessionItemRequest.prototype, "color", void 0);
__decorate([
    (0, class_validator_1.IsIn)(sizes),
    __metadata("design:type", Object)
], CreateSessionItemRequest.prototype, "size", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSessionItemRequest.prototype, "quantity", void 0);
class DeliveryAddressRequest {
    fullName;
    phone;
    line1;
    line2;
    city;
    state;
    postalCode;
    country;
}
exports.DeliveryAddressRequest = DeliveryAddressRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "fullName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "line1", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "line2", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "city", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "postalCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], DeliveryAddressRequest.prototype, "country", void 0);
class CreateSessionRequest {
    items;
    deliveryAddress;
}
exports.CreateSessionRequest = CreateSessionRequest;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateSessionItemRequest),
    __metadata("design:type", Array)
], CreateSessionRequest.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeliveryAddressRequest),
    __metadata("design:type", DeliveryAddressRequest)
], CreateSessionRequest.prototype, "deliveryAddress", void 0);
//# sourceMappingURL=create-session.request.js.map
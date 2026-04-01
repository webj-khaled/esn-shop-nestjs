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
exports.SignInAttemptsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let SignInAttemptsService = class SignInAttemptsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async record(payload) {
        try {
            await this.prisma
                .$executeRaw `INSERT INTO "SignInAttempt" ("identifierRaw","identifierNormalized","outcome","failureReason","userAgent","responseLatencyMs","userId")
                VALUES (${payload.identifierRaw}, ${payload.identifierNormalized}, ${payload.outcome}, ${payload.failureReason}, ${payload.userAgent}, ${payload.responseLatencyMs}, ${payload.userId})`;
        }
        catch (error) {
            const prismaCode = error?.code;
            const originalCode = error?.meta?.driverAdapterError?.cause?.originalCode;
            const missingAuditTable = prismaCode === 'P2010' && originalCode === '42P01';
            if (missingAuditTable) {
                return;
            }
            throw error;
        }
    }
};
exports.SignInAttemptsService = SignInAttemptsService;
exports.SignInAttemptsService = SignInAttemptsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SignInAttemptsService);
//# sourceMappingURL=sign-in-attempts.service.js.map
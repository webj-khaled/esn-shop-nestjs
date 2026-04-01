"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const identifier_normalizer_1 = require("../auth/identifier-normalizer");
const email_service_1 = require("../email/email.service");
let UsersService = UsersService_1 = class UsersService {
    prismaService;
    emailService;
    logger = new common_1.Logger(UsersService_1.name);
    constructor(prismaService, emailService) {
        this.prismaService = prismaService;
        this.emailService = emailService;
    }
    async createUser(data) {
        try {
            const createdUser = await this.prismaService.user.create({
                data: {
                    email: (0, identifier_normalizer_1.normalizeIdentifier)(data.identifier),
                    password: await bcrypt.hash(data.password, 10),
                },
                select: {
                    email: true,
                    id: true,
                },
            });
            try {
                await this.emailService.sendWelcomeEmail(createdUser.email);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown email error.';
                this.logger.warn(`Welcome email could not be sent to ${createdUser.email}: ${message}`);
            }
            return createdUser;
        }
        catch (err) {
            const prismaErrorCode = typeof err === 'object' &&
                err !== null &&
                'code' in err &&
                typeof err.code === 'string'
                ? err.code
                : '';
            if (prismaErrorCode === 'P2002') {
                throw new common_1.UnprocessableEntityException('Email already exists.');
            }
            throw err;
        }
    }
    async findByIdentifier(identifier) {
        const normalized = (0, identifier_normalizer_1.normalizeIdentifier)(identifier);
        if (!normalized) {
            return null;
        }
        return this.prismaService.user.findUnique({
            where: { email: normalized },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        email_service_1.EmailService])
], UsersService);
//# sourceMappingURL=users.service.js.map
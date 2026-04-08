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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcrypt"));
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
const sign_in_attempts_service_1 = require("./sign-in-attempts.service");
const identifier_normalizer_1 = require("./identifier-normalizer");
const auth_error_mapper_1 = require("./auth-error-mapper");
const email_service_1 = require("../email/email.service");
let AuthService = AuthService_1 = class AuthService {
    usersService;
    signInAttemptsService;
    configService;
    prismaService;
    emailService;
    logger = new common_1.Logger(AuthService_1.name);
    jwtSecret;
    tokenTtlMs;
    passwordResetTableReady = false;
    constructor(usersService, signInAttemptsService, configService, prismaService, emailService) {
        this.usersService = usersService;
        this.signInAttemptsService = signInAttemptsService;
        this.configService = configService;
        this.prismaService = prismaService;
        this.emailService = emailService;
        this.jwtSecret =
            this.configService.get('JWT_SECRET') ?? 'dev-secret';
        this.tokenTtlMs =
            this.configService.get('JWT_TTL_MS') ?? 30 * 60 * 1000;
    }
    async login(identifier, password, userAgent) {
        const normalized = (0, identifier_normalizer_1.normalizeIdentifier)(identifier);
        if (!normalized) {
            return this.failure('invalid_credentials', identifier, userAgent, 0);
        }
        const start = Date.now();
        const user = await this.usersService.findByIdentifier(normalized);
        if (!user) {
            return this.failure('invalid_credentials', identifier, userAgent, Date.now() - start);
        }
        const valid = await bcrypt.compare(password, user.password);
        const duration = Date.now() - start;
        if (!valid) {
            return this.failure('invalid_credentials', identifier, userAgent, duration, user.id);
        }
        const expiresAt = new Date(Date.now() + this.tokenTtlMs);
        const payload = JSON.stringify({
            sub: user.id,
            email: normalized,
            exp: Math.round(expiresAt.getTime() / 1000),
        });
        const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
        const unsignedToken = `${this.base64url(header)}.${this.base64url(payload)}`;
        const signature = this.base64url((0, crypto_1.createHmac)('sha256', this.jwtSecret).update(unsignedToken).digest());
        const token = `${unsignedToken}.${signature}`;
        await this.signInAttemptsService.record({
            identifierRaw: identifier,
            identifierNormalized: normalized,
            outcome: 'success',
            responseLatencyMs: duration,
            userAgent,
            userId: user.id,
        });
        return { token, expiresAt };
    }
    async startPasswordRecovery(identifier) {
        const message = 'If an account exists for this email, a password reset link was sent.';
        const normalized = (0, identifier_normalizer_1.normalizeIdentifier)(identifier);
        if (!normalized) {
            return { message };
        }
        const user = await this.usersService.findByIdentifier(normalized);
        if (!user) {
            return { message };
        }
        await this.ensurePasswordResetTable();
        const expiresInMinutes = this.getPasswordResetTtlMinutes();
        await this.prismaService.$executeRaw `
      UPDATE "PasswordResetToken"
      SET "usedAt" = NOW()
      WHERE "userId" = ${user.id}
        AND "usedAt" IS NULL
    `;
        const rawToken = (0, crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = this.hashRecoveryToken(rawToken);
        await this.prismaService.$executeRaw `
      INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt")
      VALUES (
        ${user.id},
        ${tokenHash},
        NOW() + (${expiresInMinutes} * INTERVAL '1 minute')
      )
    `;
        const frontendBaseUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';
        const resetUrl = `${frontendBaseUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
        try {
            await this.emailService.sendPasswordResetEmail(user.email, resetUrl);
        }
        catch {
            this.logger.warn(`Password reset email could not be sent for user ${user.id}.`);
        }
        return { message };
    }
    async completePasswordRecovery(token, password) {
        await this.ensurePasswordResetTable();
        const normalizedToken = this.normalizeRecoveryToken(token);
        const tokenHash = this.hashRecoveryToken(normalizedToken);
        const rows = await this.prismaService.$queryRaw `
      SELECT "id", "userId"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
        AND "usedAt" IS NULL
        AND "expiresAt" > NOW()
      LIMIT 1
    `;
        const resetToken = rows[0];
        if (!resetToken) {
            throw new common_1.BadRequestException('Invalid or expired recovery token.');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await this.prismaService.$transaction([
            this.prismaService.$executeRaw `
        UPDATE "User"
        SET "password" = ${hashedPassword}
        WHERE "id" = ${resetToken.userId}
      `,
            this.prismaService.$executeRaw `
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "userId" = ${resetToken.userId}
          AND "usedAt" IS NULL
      `,
        ]);
        return { message: 'Password reset successful.' };
    }
    getAuthenticationState(cookieHeader) {
        const token = this.getCookieValue(cookieHeader, 'Authentication');
        if (!token) {
            return { authenticated: false, email: null, isAdmin: false };
        }
        const payload = this.verifyTokenPayload(token);
        const email = String(payload?.email ?? '')
            .trim()
            .toLowerCase();
        if (!email) {
            return { authenticated: false, email: null, isAdmin: false };
        }
        const adminEmails = (this.configService.get('ADMIN_EMAILS') ?? '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        return {
            authenticated: true,
            email,
            isAdmin: adminEmails.includes(email),
        };
    }
    async ensurePasswordResetTable() {
        if (this.passwordResetTableReady) {
            return;
        }
        await this.prismaService.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "tokenHash" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await this.prismaService.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_password_reset_user_active"
      ON "PasswordResetToken" ("userId")
      WHERE "usedAt" IS NULL
    `);
        this.passwordResetTableReady = true;
    }
    getPasswordResetTtlMinutes() {
        const configured = Number(this.configService.get('PASSWORD_RESET_TTL_MINUTES'));
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        return 30;
    }
    hashRecoveryToken(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    normalizeRecoveryToken(token) {
        const trimmed = token.trim();
        const tokenMatch = trimmed.match(/[a-f0-9]{64}/i);
        if (!tokenMatch) {
            return trimmed.toLowerCase();
        }
        return tokenMatch[0].toLowerCase();
    }
    base64url(value) {
        return Buffer.from(value)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    getCookieValue(cookieHeader, name) {
        if (!cookieHeader) {
            return undefined;
        }
        const cookies = cookieHeader.split(';');
        for (const cookieEntry of cookies) {
            const [key, ...rest] = cookieEntry.split('=');
            if (key?.trim() === name) {
                return decodeURIComponent(rest.join('=').trim());
            }
        }
        return undefined;
    }
    verifyTokenPayload(token) {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) {
            return null;
        }
        const unsignedToken = `${header}.${payload}`;
        const expectedSignature = this.base64url((0, crypto_1.createHmac)('sha256', this.jwtSecret).update(unsignedToken).digest());
        if (expectedSignature !== signature) {
            return null;
        }
        try {
            const parsed = JSON.parse(this.decodeBase64url(payload));
            if (parsed.exp && Date.now() / 1000 > parsed.exp) {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    decodeBase64url(value) {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = normalized.length % 4;
        const padded = padLength === 0 ? normalized : normalized + '='.repeat(4 - padLength);
        return Buffer.from(padded, 'base64').toString('utf8');
    }
    async failure(category, identifier, userAgent, latencyMs, userId) {
        const descriptor = auth_error_mapper_1.loginFailureMap[category];
        await this.signInAttemptsService.record({
            identifierRaw: identifier,
            identifierNormalized: (0, identifier_normalizer_1.normalizeIdentifier)(identifier) ?? '',
            outcome: category === 'rate_limited' ? 'rate_limited' : 'invalid_credentials',
            failureReason: descriptor.message,
            responseLatencyMs: latencyMs,
            userAgent,
            userId,
        });
        throw new common_1.HttpException(descriptor, descriptor.statusCode);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        sign_in_attempts_service_1.SignInAttemptsService,
        config_1.ConfigService,
        prisma_service_1.PrismaService,
        email_service_1.EmailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SignInAttemptsService } from './sign-in-attempts.service';
import { normalizeIdentifier } from './identifier-normalizer';
import { loginFailureMap, LoginFailureCategory } from './auth-error-mapper';
import { EmailService } from '../email/email.service';

interface LoginResult {
  token: string;
  expiresAt: Date;
}

interface PasswordResetTokenRow {
  id: number;
  userId: number;
}

export interface AuthenticationState {
  authenticated: boolean;
  email: string | null;
  isAdmin: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly tokenTtlMs: number;
  private passwordResetTableReady = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly signInAttemptsService: SignInAttemptsService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') ?? 'dev-secret';
    this.tokenTtlMs =
      this.configService.get<number>('JWT_TTL_MS') ?? 30 * 60 * 1000;
  }

  async login(
    identifier: string,
    password: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return this.failure('invalid_credentials', identifier, userAgent, 0);
    }

    const start = Date.now();
    const user = await this.usersService.findByIdentifier(normalized);
    if (!user) {
      return this.failure(
        'invalid_credentials',
        identifier,
        userAgent,
        Date.now() - start,
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    const duration = Date.now() - start;

    if (!valid) {
      return this.failure(
        'invalid_credentials',
        identifier,
        userAgent,
        duration,
        user.id,
      );
    }

    const expiresAt = new Date(Date.now() + this.tokenTtlMs);
    const payload = JSON.stringify({
      sub: user.id,
      email: normalized,
      exp: Math.round(expiresAt.getTime() / 1000),
    });
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const unsignedToken = `${this.base64url(header)}.${this.base64url(payload)}`;
    const signature = this.base64url(
      createHmac('sha256', this.jwtSecret).update(unsignedToken).digest(),
    );
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

  async startPasswordRecovery(identifier: string) {
    const message =
      'If an account exists for this email, a password reset link was sent.';
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return { message };
    }

    const user = await this.usersService.findByIdentifier(normalized);
    if (!user) {
      return { message };
    }

    await this.ensurePasswordResetTable();
    const expiresInMinutes = this.getPasswordResetTtlMinutes();

    await this.prismaService.$executeRaw`
      UPDATE "PasswordResetToken"
      SET "usedAt" = NOW()
      WHERE "userId" = ${user.id}
        AND "usedAt" IS NULL
    `;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashRecoveryToken(rawToken);

    await this.prismaService.$executeRaw`
      INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt")
      VALUES (
        ${user.id},
        ${tokenHash},
        NOW() + (${expiresInMinutes} * INTERVAL '1 minute')
      )
    `;

    const frontendBaseUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendBaseUrl}/auth/reset-password?token=${encodeURIComponent(
      rawToken,
    )}`;

    try {
      await this.emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch {
      this.logger.warn(
        `Password reset email could not be sent for user ${user.id}.`,
      );
    }

    return { message };
  }

  async completePasswordRecovery(token: string, password: string) {
    await this.ensurePasswordResetTable();
    const normalizedToken = this.normalizeRecoveryToken(token);
    const tokenHash = this.hashRecoveryToken(normalizedToken);

    const rows = await this.prismaService.$queryRaw<PasswordResetTokenRow[]>`
      SELECT "id", "userId"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
        AND "usedAt" IS NULL
        AND "expiresAt" > NOW()
      LIMIT 1
    `;

    const resetToken = rows[0];
    if (!resetToken) {
      throw new BadRequestException('Invalid or expired recovery token.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await this.prismaService.$transaction([
      this.prismaService.$executeRaw`
        UPDATE "User"
        SET "password" = ${hashedPassword}
        WHERE "id" = ${resetToken.userId}
      `,
      this.prismaService.$executeRaw`
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "userId" = ${resetToken.userId}
          AND "usedAt" IS NULL
      `,
    ]);

    return { message: 'Password reset successful.' };
  }

  getAuthenticationState(cookieHeader?: string): AuthenticationState {
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

    const adminEmails = (this.configService.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return {
      authenticated: true,
      email,
      isAdmin: adminEmails.includes(email),
    };
  }

  private async ensurePasswordResetTable() {
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

  private getPasswordResetTtlMinutes() {
    const configured = Number(
      this.configService.get<string>('PASSWORD_RESET_TTL_MINUTES'),
    );
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return 30;
  }

  private hashRecoveryToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeRecoveryToken(token: string) {
    const trimmed = token.trim();
    const tokenMatch = trimmed.match(/[a-f0-9]{64}/i);
    if (!tokenMatch) {
      return trimmed.toLowerCase();
    }
    return tokenMatch[0].toLowerCase();
  }

  private base64url(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private getCookieValue(cookieHeader: string | undefined, name: string) {
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

  private verifyTokenPayload(
    token: string,
  ): { email?: string; exp?: number } | null {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) {
      return null;
    }

    const unsignedToken = `${header}.${payload}`;
    const expectedSignature = this.base64url(
      createHmac('sha256', this.jwtSecret).update(unsignedToken).digest(),
    );
    if (expectedSignature !== signature) {
      return null;
    }

    try {
      const parsed = JSON.parse(this.decodeBase64url(payload)) as {
        email?: string;
        exp?: number;
      };

      if (parsed.exp && Date.now() / 1000 > parsed.exp) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private decodeBase64url(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = normalized.length % 4;
    const padded =
      padLength === 0 ? normalized : normalized + '='.repeat(4 - padLength);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private async failure(
    category: LoginFailureCategory,
    identifier: string,
    userAgent: string | undefined,
    latencyMs: number,
    userId?: number,
  ): Promise<never> {
    const descriptor = loginFailureMap[category];
    await this.signInAttemptsService.record({
      identifierRaw: identifier,
      identifierNormalized: normalizeIdentifier(identifier) ?? '',
      outcome:
        category === 'rate_limited' ? 'rate_limited' : 'invalid_credentials',
      failureReason: descriptor.message,
      responseLatencyMs: latencyMs,
      userAgent,
      userId,
    });

    throw new HttpException(descriptor, descriptor.statusCode);
  }
}

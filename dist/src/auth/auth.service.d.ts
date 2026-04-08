import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SignInAttemptsService } from './sign-in-attempts.service';
import { EmailService } from '../email/email.service';
interface LoginResult {
    token: string;
    expiresAt: Date;
}
export interface AuthenticationState {
    authenticated: boolean;
    email: string | null;
    isAdmin: boolean;
}
export declare class AuthService {
    private readonly usersService;
    private readonly signInAttemptsService;
    private readonly configService;
    private readonly prismaService;
    private readonly emailService;
    private readonly logger;
    private readonly jwtSecret;
    private readonly tokenTtlMs;
    private passwordResetTableReady;
    constructor(usersService: UsersService, signInAttemptsService: SignInAttemptsService, configService: ConfigService, prismaService: PrismaService, emailService: EmailService);
    login(identifier: string, password: string, userAgent?: string): Promise<LoginResult>;
    startPasswordRecovery(identifier: string): Promise<{
        message: string;
    }>;
    completePasswordRecovery(token: string, password: string): Promise<{
        message: string;
    }>;
    getAuthenticationState(cookieHeader?: string): AuthenticationState;
    private ensurePasswordResetTable;
    private getPasswordResetTtlMinutes;
    private hashRecoveryToken;
    private normalizeRecoveryToken;
    private base64url;
    private getCookieValue;
    private verifyTokenPayload;
    private decodeBase64url;
    private failure;
}
export {};

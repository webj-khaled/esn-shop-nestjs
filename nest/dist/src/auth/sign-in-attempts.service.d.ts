import { PrismaService } from '../prisma/prisma.service';
export interface SignInAttemptPayload {
    identifierRaw: string;
    identifierNormalized: string;
    outcome: 'success' | 'invalid_credentials' | 'account_not_ready' | 'rate_limited' | 'system_error';
    failureReason?: string;
    userAgent?: string;
    responseLatencyMs: number;
    userId?: number;
}
export declare class SignInAttemptsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    record(payload: SignInAttemptPayload): Promise<void>;
}

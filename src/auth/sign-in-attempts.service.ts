import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SignInAttemptPayload {
  identifierRaw: string;
  identifierNormalized: string;
  outcome:
    | 'success'
    | 'invalid_credentials'
    | 'account_not_ready'
    | 'rate_limited'
    | 'system_error';
  failureReason?: string;
  userAgent?: string;
  responseLatencyMs: number;
  userId?: number;
}

@Injectable()
export class SignInAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(payload: SignInAttemptPayload) {
    try {
      await this.prisma
        .$executeRaw`INSERT INTO "SignInAttempt" ("identifierRaw","identifierNormalized","outcome","failureReason","userAgent","responseLatencyMs","userId")
                VALUES (${payload.identifierRaw}, ${payload.identifierNormalized}, ${payload.outcome}, ${payload.failureReason}, ${payload.userAgent}, ${payload.responseLatencyMs}, ${payload.userId})`;
    } catch (error: any) {
      const prismaCode = error?.code;
      const originalCode = error?.meta?.driverAdapterError?.cause?.originalCode;
      const missingAuditTable =
        prismaCode === 'P2010' && originalCode === '42P01';

      // Login must keep working even if audit table migration has not been applied yet.
      if (missingAuditTable) {
        return;
      }
      throw error;
    }
  }
}

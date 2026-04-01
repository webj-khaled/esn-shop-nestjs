import { HttpStatus } from '@nestjs/common';

export type LoginFailureCategory =
  | 'invalid_credentials'
  | 'account_not_ready'
  | 'rate_limited';

export interface FailureDescriptor {
  statusCode: HttpStatus;
  category: LoginFailureCategory;
  message: string;
  recoveryAction: string;
}

export const loginFailureMap: Record<LoginFailureCategory, FailureDescriptor> =
  {
    invalid_credentials: {
      statusCode: HttpStatus.UNAUTHORIZED,
      category: 'invalid_credentials',
      message: 'Invalid credentials or account not found.',
      recoveryAction: 'Verify credentials or start recovery.',
    },
    account_not_ready: {
      statusCode: HttpStatus.UNAUTHORIZED,
      category: 'account_not_ready',
      message: 'Account not ready for login.',
      recoveryAction: 'Complete verification or recover the account.',
    },
    rate_limited: {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      category: 'rate_limited',
      message: 'Too many login attempts.',
      recoveryAction: 'Wait a moment before retrying or recover your account.',
    },
  };

import { HttpStatus } from '@nestjs/common';
export type LoginFailureCategory = 'invalid_credentials' | 'account_not_ready' | 'rate_limited';
export interface FailureDescriptor {
    statusCode: HttpStatus;
    category: LoginFailureCategory;
    message: string;
    recoveryAction: string;
}
export declare const loginFailureMap: Record<LoginFailureCategory, FailureDescriptor>;

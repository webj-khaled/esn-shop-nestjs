import { Response } from 'express';
import { LoginRequest } from './dto/login.request';
import { AuthService } from './auth.service';
import { LoginSuccessResponse } from './dto/login.success';
import { RecoveryStartRequest } from './dto/recovery-start.request';
import { RecoveryCompleteRequest } from './dto/recovery-complete.request';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(payload: LoginRequest, userAgent: string, response: Response): Promise<LoginSuccessResponse>;
    startRecovery(payload: RecoveryStartRequest): Promise<{
        message: string;
    }>;
    completeRecovery(payload: RecoveryCompleteRequest): Promise<{
        message: string;
    }>;
    getAuthState(cookieHeader?: string): import("./auth.service").AuthenticationState;
}

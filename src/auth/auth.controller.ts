import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { LoginRequest } from './dto/login.request';
import { AuthService } from './auth.service';
import { LoginSuccessResponse } from './dto/login.success';
import { RecoveryStartRequest } from './dto/recovery-start.request';
import { RecoveryCompleteRequest } from './dto/recovery-complete.request';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() payload: LoginRequest,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      payload.identifier,
      payload.password,
      userAgent,
    );
    response.cookie('Authentication', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: result.expiresAt,
      path: '/',
    });
    return new LoginSuccessResponse();
  }

  @Post('password-recovery/start')
  startRecovery(@Body() payload: RecoveryStartRequest) {
    return this.authService.startPasswordRecovery(payload.identifier);
  }

  @Post('password-recovery/complete')
  completeRecovery(@Body() payload: RecoveryCompleteRequest) {
    return this.authService.completePasswordRecovery(
      payload.token,
      payload.password,
    );
  }

  @Get('state')
  getAuthState(@Headers('cookie') cookieHeader?: string) {
    return this.authService.getAuthenticationState(cookieHeader);
  }
}

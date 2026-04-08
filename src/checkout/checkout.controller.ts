import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateSessionRequest } from './dto/create-session.request';
import { ConfirmSessionRequest } from './dto/confirm-session.request';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('session')
  createSession(@Body() request: CreateSessionRequest) {
    return this.checkoutService.createSession(request);
  }

  @Post('confirm')
  confirm(@Body() request: ConfirmSessionRequest) {
    return this.checkoutService.confirmSession(request.sessionId);
  }

  @Get('orders')
  getOrders(@Headers('cookie') cookieHeader?: string) {
    return this.checkoutService.getOrders(cookieHeader);
  }

  @Get('my-orders')
  getMyOrders(@Headers('cookie') cookieHeader?: string) {
    return this.checkoutService.getMyOrders(cookieHeader);
  }
}

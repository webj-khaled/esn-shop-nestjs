import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignInAttemptsService } from './sign-in-attempts.service';

@Module({
  imports: [PrismaModule, UsersModule, ConfigModule, EmailModule],
  controllers: [AuthController],
  providers: [AuthService, SignInAttemptsService],
})
export class AuthModule {}

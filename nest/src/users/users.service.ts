import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserRequest } from './dto/create-user.request';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIdentifier } from '../auth/identifier-normalizer';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async createUser(data: CreateUserRequest) {
    try {
      const createdUser = await this.prismaService.user.create({
        data: {
          email: normalizeIdentifier(data.identifier),
          password: await bcrypt.hash(data.password, 10),
        },
        select: {
          email: true,
          id: true,
        },
      });

      try {
        await this.emailService.sendWelcomeEmail(createdUser.email);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown email error.';
        this.logger.warn(
          `Welcome email could not be sent to ${createdUser.email}: ${message}`,
        );
        // Welcome emails are best-effort and must not block signup.
      }

      return createdUser;
    } catch (err: unknown) {
      const prismaErrorCode =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : '';

      if (prismaErrorCode === 'P2002') {
        throw new UnprocessableEntityException('Email already exists.');
      }
      throw err;
    }
  }

  async findByIdentifier(identifier: string) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }
    return this.prismaService.user.findUnique({
      where: { email: normalized },
    });
  }
}

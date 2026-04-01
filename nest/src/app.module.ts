import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CheckoutModule } from './checkout/checkout.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                  },
                },
            level: isProduction ? 'info' : 'debug',
          },
        };
      },
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(__dirname, '..', '.env'),
        resolve(__dirname, '..', '..', '.env'),
      ],
    }),
    UsersModule,
    AuthModule,
    ProductsModule,
    CheckoutModule,
    EmailModule,
  ],
  controllers: [],
})
export class AppModule {}

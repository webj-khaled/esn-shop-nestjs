import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  app.use('/images', express.static(join(process.cwd(), 'images')));
  if (process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('DevMatch API')
      .setDescription('Dev API - Disabled in production')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(app.get(ConfigService).getOrThrow('PORT'));
}
bootstrap();

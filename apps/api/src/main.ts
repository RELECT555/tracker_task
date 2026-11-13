import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/presentation/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  const localOrigin = 'http://localhost:3000';
  const defaultOrigins =
    process.env.NODE_ENV === 'production'
      ? localOrigin
      : `${localOrigin},http://127.0.0.1:3000`;
  const allowedOrigins = (process.env.CORS_ORIGIN ?? defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();

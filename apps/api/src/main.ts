import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.validation.js';

dotenv.config();

async function bootstrap() {
  // 1. Fail fast if environment is invalid
  const envConfig = validateEnv(process.env);
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 2. Structured logging (Pino) with request IDs
  const pino = (pinoHttp as any)({
    autoLogging: {
      ignore: (req: any) => req.url === '/health' || req.url === '/ready',
    },
    genReqId: (req: any) => req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    serializers: {
      req: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
  });
  app.use(pino);

  // 3. Security: Helmet & CORS
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI requires inline scripts
    }),
  );

  const allowedOrigins = envConfig.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
  });

  // 4. API URI Versioning (/v1)
  app.setGlobalPrefix('v1', {
    exclude: ['health', 'ready', 'docs', 'docs-json'],
  });

  // 5. OpenAPI Swagger Documentation (/docs)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wasel API')
    .setDescription('Wasel Logistics & Delivery Platform Modular Monolith API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // 6. Graceful shutdown hooks
  app.enableShutdownHooks();

  const port = envConfig.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Wasel API server running on: http://localhost:${port}/v1`);
  logger.log(`📚 OpenAPI Documentation available at: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal API bootstrap error:', err);
  process.exit(1);
});

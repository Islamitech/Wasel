import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import express from 'express';
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

  // Enable trust proxy from env
  const trustProxy = envConfig.TRUST_PROXY;
  if (trustProxy === 'true') {
    (app.getHttpAdapter().getInstance() as any).set('trust proxy', true);
  } else if (trustProxy !== 'false') {
    (app.getHttpAdapter().getInstance() as any).set('trust proxy', trustProxy);
  }

  // Request payload size limit (ADR / security hardening)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 2. Structured logging (Pino) with request IDs and secret redaction
  const pino = (pinoHttp as any)({
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.token',
        'req.body.refreshToken',
        'req.body.code',
      ],
      censor: '[REDACTED]',
    },
    autoLogging: {
      ignore: (req: any) => req.url === '/health' || req.url === '/ready',
    },
    genReqId: (req: any) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && /^[a-zA-Z0-9\-_]{8,64}$/.test(incoming)) {
        return incoming;
      }
      return `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    },
    serializers: {
      req: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.url.split('?')[0], // Never log query strings to prevent token/secret leaks
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
  });
  app.use(pino);

  // 3. Security: Helmet with CSP enabled for API endpoints, excluded for /docs
  app.use((req: any, res: any, next: any) => {
    if (req.path.startsWith('/docs')) {
      return helmet({
        contentSecurityPolicy: false,
      })(req, res, next);
    }
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })(req, res, next);
  });

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

  // 5. OpenAPI Swagger Documentation (/docs) - disabled in production unless ENABLE_DOCS=true
  const isProduction = envConfig.NODE_ENV === 'production' || envConfig.APP_ENV === 'production';
  const enableDocs = !isProduction || envConfig.ENABLE_DOCS;

  if (enableDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Wasel API')
      .setDescription('Wasel Logistics & Delivery Platform Modular Monolith API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    logger.log(`📚 OpenAPI Documentation available at: http://localhost:${envConfig.PORT || 3000}/docs`);
  } else {
    logger.log('🔒 OpenAPI Documentation disabled in production mode');
  }

  // 6. Graceful shutdown hooks
  app.enableShutdownHooks();

  const port = envConfig.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Wasel API server running on: http://localhost:${port}/v1`);
}

bootstrap().catch((err) => {
  console.error('Fatal API bootstrap error:', err);
  process.exit(1);
});

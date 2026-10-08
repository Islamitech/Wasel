import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import express from 'express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.validation.js';

dotenv.config();

async function bootstrap() {
  // 1. Fail fast if environment is invalid
  const envConfig = validateEnv(process.env);
  const logger = new Logger('Bootstrap');

  // Initialize Sentry if SENTRY_DSN is configured
  if (envConfig.SENTRY_DSN) {
    Sentry.init({
      dsn: envConfig.SENTRY_DSN,
      environment: envConfig.APP_ENV,
      tracesSampleRate: envConfig.APP_ENV === 'production' ? 0.2 : 1.0,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-metrics-token'];
        }
        if (event.request?.data && typeof event.request.data === 'object') {
          const sensitiveKeys = ['phone', 'nationalId', 'password', 'code', 'token', 'refreshToken', 'secret'];
          for (const key of sensitiveKeys) {
            if (key in event.request.data) {
              (event.request.data as any)[key] = '[REDACTED]';
            }
          }
        }
        return event;
      },
    });
    logger.log('🛡️ Sentry error monitoring initialized with PII sanitization');
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Auto-run migrations, seeds, and admin bootstrap in pilot/dev mode
  if (envConfig.ALLOW_DEV_PROVIDERS === 'true' || process.env.AUTO_MIGRATE === 'true') {
    try {
      logger.log('🌱 Checking and applying schema migrations...');
      const { runMigrations } = await import('./database/migrate.js');
      await runMigrations();
      logger.log('✅ Database migrations up to date');

      const { runSeeds } = await import('./database/seed.js');
      await runSeeds();
      logger.log('✅ Canonical reference seeds applied');

      const { bootstrapAdminSafe } = await import('./database/bootstrap-admin.js');
      await bootstrapAdminSafe();
    } catch (migErr: any) {
      logger.warn(`Database auto-init notice: ${migErr.message}`);
    }
  }

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

  // 2. Structured logging (Pino) with request IDs, configurable level, and secret redaction
  const isProduction = envConfig.NODE_ENV === 'production' || envConfig.APP_ENV === 'production';
  const logLevel = envConfig.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  const pino = (pinoHttp as any)({
    level: logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-metrics-token"]',
        'req.body.password',
        'req.body.token',
        'req.body.refreshToken',
        'req.body.code',
        'req.body.otp',
        'req.body.nationalId',
        'req.body.secret',
      ],
      censor: '[REDACTED]',
    },
    autoLogging: {
      ignore: (req: any) =>
        req.url === '/health' || req.url === '/ready' || req.url === '/metrics',
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
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key', 'X-Metrics-Token'],
  });

  // 4. API URI Versioning (/v1)
  app.setGlobalPrefix('v1', {
    exclude: ['health', 'ready', 'docs', 'docs-json', 'metrics', 'system/migrate'],
  });

  // 5. OpenAPI Swagger Documentation (/docs) - disabled in production unless ENABLE_DOCS=true
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

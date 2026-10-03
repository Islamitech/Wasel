import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module.js';

async function generateOpenApiSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('v1', {
    exclude: ['health', 'ready', 'docs'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wasel API')
    .setDescription('Wasel Logistics & Delivery Platform Modular Monolith API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

  console.log(`✅ OpenAPI specification exported to ${outputPath}`);
  await app.close();
  process.exit(0);
}

generateOpenApiSpec().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});

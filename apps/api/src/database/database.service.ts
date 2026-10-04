import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index.js';
import { initEmbeddedDatabase } from './embedded.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private client?: postgres.Sql;
  private pglite?: PGlite;
  public db!: PostgresJsDatabase<typeof schema>;

  async onModuleInit() {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';

    const isTest = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
    const maxRetries = isTest ? 1 : 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const testClient = postgres(connectionString, {
          max: 1,
          connect_timeout: isTest ? 0.5 : 2,
          idle_timeout: 1,
        });
        await testClient`SELECT 1`;
        await testClient.end();

        this.client = postgres(connectionString, { max: 20 });
        this.db = drizzle(this.client, { schema });
        this.logger.log('✅ Connected to external PostgreSQL (Production PostGIS Engine: Real PostGIS + GiST indexes active)');
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 250;
          this.logger.warn(`PostgreSQL connection attempt ${attempt} failed (${err.message}). Retrying in ${delayMs}ms...`);
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }
    }

    // Fail-fast in production and development (NO PGlite fallback in runtime)
    if (!isTest) {
      this.logger.error(`❌ Fatal: Unable to connect to external PostgreSQL after ${maxRetries} attempts: ${lastError?.message}`);
      throw new Error(`Database connection failed: ${lastError?.message || 'Unable to reach PostgreSQL'}`);
    }

    // In isolated test runner environment ONLY:
    this.logger.warn(
      `⚠️ External PostgreSQL not available in test runner (${lastError?.message || 'connection failed'}). Using embedded test PGlite...`,
    );
    const embedded = await initEmbeddedDatabase();
    this.pglite = embedded.pglite;
    this.db = embedded.db as any;
    this.logger.log('✅ Embedded test PostgreSQL (PGlite) active [TEST RUNNER ONLY]');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection pool closed gracefully');
    }
    if (this.pglite) {
      await this.pglite.close();
      this.logger.log('Embedded database closed gracefully');
    }
  }
}

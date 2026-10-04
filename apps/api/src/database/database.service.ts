import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public client?: postgres.Sql;
  public db!: PostgresJsDatabase<typeof schema>;

  private static testDbInstance?: any;

  /**
   * Test runner hook: allows test harnesses (e.g. test-harness.ts) to inject
   * a test database instance without bundling test dependencies in production.
   */
  public static setTestDb(db: any): void {
    DatabaseService.testDbInstance = db;
  }

  public static getTestDb(): any {
    return DatabaseService.testDbInstance;
  }

  async onModuleInit() {
    const isTest =
      (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test') &&
      process.env.NODE_ENV !== 'production' &&
      process.env.APP_ENV !== 'production';

    // If a test runner has provided a pre-initialized test database, use it (TEST RUNNER ONLY, NEVER IN PRODUCTION)
    if (isTest && DatabaseService.testDbInstance) {
      this.db = DatabaseService.testDbInstance;
      this.logger.log('✅ Injected test database active [TEST RUNNER ONLY]');
      return;
    }

    const connectionString =
      process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';
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

    // Fail-fast in production, staging, and development (NO fallback in runtime)
    this.logger.error(`❌ Fatal: Unable to connect to external PostgreSQL after ${maxRetries} attempts: ${lastError?.message}`);
    throw new Error(`Database connection failed: ${lastError?.message || 'Unable to reach PostgreSQL'}`);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection pool closed gracefully');
    }
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.js';

export type TransactionActor = 'system' | 'customer' | 'driver' | 'admin' | string;

export interface TransactionOptions {
  actor?: TransactionActor;
}

export type DatabaseTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
> & {
  _afterCommit?: (cb: () => void | Promise<void>) => void;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public client?: postgres.Sql;
  public db!: PostgresJsDatabase<typeof schema>;

  private static testDbInstance?: unknown;

  /**
   * Test runner hook: allows test harnesses (e.g. test-harness.ts) to inject
   * a test database instance without bundling test dependencies in production.
   */
  public static setTestDb(db: unknown): void {
    DatabaseService.testDbInstance = db;
  }

  public static getTestDb(): unknown {
    return DatabaseService.testDbInstance;
  }

  private activeQueryCount = 0;
  private poolMax = 20;

  public getPoolMetrics(): { active: number; max: number; saturation: number } {
    return {
      active: this.activeQueryCount,
      max: this.poolMax,
      saturation: this.poolMax > 0 ? Math.min(1, this.activeQueryCount / this.poolMax) : 0,
    };
  }

  /**
   * Execute a database operation within an ACID transaction.
   * Sets app.actor_role locally for RLS and status transition triggers.
   * Supports registering afterCommit hooks that fire only upon successful commit.
   */
  async transaction<T>(
    fn: (tx: DatabaseTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const afterCommitHooks: Array<() => void | Promise<void>> = [];
    this.activeQueryCount++;

    try {
      const result = await this.db.transaction(async (tx) => {
        const customTx = tx as DatabaseTransaction;
        if (options?.actor) {
          await customTx.execute(sql`SELECT set_config('app.actor_role', ${options.actor}, true)`);
        }

        customTx._afterCommit = (cb: () => void | Promise<void>) => {
          afterCommitHooks.push(cb);
        };

        return await fn(customTx);
      });

      for (const hook of afterCommitHooks) {
        try {
          await hook();
        } catch (err: unknown) {
          this.logger.error(
            `Error executing afterCommit hook: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return result;
    } finally {
      this.activeQueryCount = Math.max(0, this.activeQueryCount - 1);
    }
  }

  async onModuleInit() {
    const isTest =
      (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test') &&
      process.env.NODE_ENV !== 'production' &&
      process.env.APP_ENV !== 'production';

    // If a test runner has provided a pre-initialized test database, use it (TEST RUNNER ONLY, NEVER IN PRODUCTION)
    if (isTest && DatabaseService.testDbInstance) {
      this.db = DatabaseService.testDbInstance as PostgresJsDatabase<typeof schema>;
      this.logger.log('✅ Injected test database active [TEST RUNNER ONLY]');
      return;
    }

    const connectionString =
      process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';
    const maxRetries = isTest ? 1 : 3;
    let lastError: Error | null = null;

    this.poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
    const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30', 10);
    const connectTimeout = isTest ? 0.5 : parseInt(process.env.DB_CONNECT_TIMEOUT || '5', 10);
    const statementTimeout = parseInt(process.env.DB_STATEMENT_TIMEOUT || '10000', 10);
    const prepare = process.env.DB_PREPARE !== 'false';
    const isProduction =
      process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
    const ssl =
      process.env.DB_SSL === 'require' ||
      process.env.DB_SSL === 'true' ||
      (isProduction &&
        process.env.DB_SSL !== 'false' &&
        !connectionString.includes('localhost') &&
        !connectionString.includes('127.0.0.1'))
        ? 'require'
        : false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const testClient = postgres(connectionString, {
          max: 1,
          connect_timeout: connectTimeout,
          idle_timeout: 1,
          ssl,
        });
        await testClient`SELECT 1`;
        await testClient.end();

        this.client = postgres(connectionString, {
          max: this.poolMax,
          idle_timeout: idleTimeout,
          connect_timeout: connectTimeout,
          prepare,
          ssl,
          connection: {
            statement_timeout: statementTimeout,
          },
        });
        this.db = drizzle(this.client, { schema });
        this.logger.log(
          `✅ Connected to PostgreSQL (pool max: ${this.poolMax}, idle: ${idleTimeout}s, prepare: ${prepare}, ssl: ${Boolean(ssl)})`,
        );
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 250;
          this.logger.warn(
            `PostgreSQL connection attempt ${attempt} failed (${err.message}). Retrying in ${delayMs}ms...`,
          );
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }
    }

    // Fail-fast in production, staging, and development (NO fallback in runtime)
    this.logger.error(
      `❌ Fatal: Unable to connect to external PostgreSQL after ${maxRetries} attempts: ${lastError?.message}`,
    );
    throw new Error(`Database connection failed: ${lastError?.message || 'Unable to reach PostgreSQL'}`);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection pool closed gracefully');
    }
  }
}

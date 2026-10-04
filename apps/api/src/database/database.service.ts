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

    try {
      // Test external PostgreSQL connection with 1.5s timeout
      const testClient = postgres(connectionString, {
        max: 1,
        connect_timeout: 1.5,
        idle_timeout: 1,
      });
      await testClient`SELECT 1`;
      await testClient.end();

      // PostgreSQL is available
      this.client = postgres(connectionString, { max: 20 });
      this.db = drizzle(this.client, { schema });
      this.logger.log('✅ Connected to external PostgreSQL (Production PostGIS Engine: Real PostGIS + GiST indexes active)');
    } catch (err: any) {
      this.logger.warn(
        `⚠️ External PostgreSQL not available (${err.message || 'connection failed'}). Falling back to embedded local PostgreSQL (PGlite)...`,
      );

      // Initialize embedded PGlite
      const embedded = await initEmbeddedDatabase();
      this.pglite = embedded.pglite;
      this.db = embedded.db as any;
      this.logger.log('✅ Embedded PostgreSQL (PGlite) active [ENGINE: FAST APPROXIMATION ONLY - NOT PRODUCTION PROOF FOR POSTGIS GIST INDEXES]');
    }
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

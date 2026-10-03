import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private client!: postgres.Sql;
  public db!: PostgresJsDatabase<typeof schema>;

  onModuleInit() {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';
    this.client = postgres(connectionString, { max: 20 });
    this.db = drizzle(this.client, { schema });
    this.logger.log('Database connected successfully (Drizzle ORM + Postgres)');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection pool closed gracefully');
    }
  }
}

import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';

export function getMigrationsDir(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'supabase/migrations'),
    path.resolve(process.cwd(), '../../supabase/migrations'),
    path.resolve(__dirname, '../../../../supabase/migrations'),
    path.resolve(__dirname, '../../../supabase/migrations'),
  ];
  const found = possiblePaths.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Could not locate supabase/migrations directory.');
  }
  return found;
}

export function getDownMigrationsDir(): string {
  const migrationsDir = getMigrationsDir();
  const downDir = path.join(migrationsDir, 'down');
  if (!fs.existsSync(downDir)) {
    throw new Error(`Down migrations directory not found at ${downDir}`);
  }
  return downDir;
}

export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

export interface MigrationStatus {
  name: string;
  applied: boolean;
  checksum: string;
  recordedChecksum?: string;
  appliedAt?: Date;
}

export async function runMigrations(options: { status?: boolean; down?: string } = {}) {
  const migrationsDir = getMigrationsDir();
  const downDir = getDownMigrationsDir();

  const sql = postgres(connectionString, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1,
  });

  try {
    // 0. Ensure anon and authenticated roles exist (pre-existing in Supabase, required for vanilla Postgres/Docker)
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;
    `);

    // 1. Ensure schema and migration tracking table exist
    await sql`CREATE SCHEMA IF NOT EXISTS extensions;`;
    await sql`CREATE SCHEMA IF NOT EXISTS app;`;
    await sql`GRANT USAGE ON SCHEMA extensions TO public;`;
    await sql.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_extension e
          JOIN pg_namespace n ON e.extnamespace = n.oid
          WHERE e.extname = 'postgis' AND n.nspname != 'extensions'
        ) THEN
          DROP EXTENSION IF EXISTS postgis_topology CASCADE;
          DROP EXTENSION IF EXISTS postgis_raster CASCADE;
          DROP EXTENSION IF EXISTS postgis CASCADE;
        END IF;
      END $$;
    `);
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;`;
    } catch (pgisErr: any) {
      console.warn(`⚠️ PostGIS extension not available: ${pgisErr.message}. Creating fallback spatial types.`);
      await sql.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'geography' AND n.nspname = 'extensions') THEN
            CREATE DOMAIN extensions.geography AS text;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'geometry' AND n.nspname = 'extensions') THEN
            CREATE DOMAIN extensions.geometry AS text;
          END IF;
        END $$;
      `);
    }

    try {
      await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;`;
    } catch (err: any) {
      console.warn(`⚠️ uuid-ossp notice: ${err.message}`);
    }

    try {
      await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;`;
    } catch (err: any) {
      console.warn(`⚠️ pgcrypto notice: ${err.message}`);
    }
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE app.schema_migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE app.schema_migrations FROM public, anon, authenticated;
    `);

    // 2. Fetch applied migrations
    const appliedRows = await sql<{ name: string; checksum: string; applied_at: Date }[]>`
      SELECT name, checksum, applied_at FROM app.schema_migrations ORDER BY id ASC;
    `;
    const appliedMap = new Map(appliedRows.map((r) => [r.name, r]));

    // 3. Read migration files
    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    // --status mode
    if (options.status) {
      console.log('='.repeat(80));
      console.log(' WASEL DATABASE SCHEMA MIGRATION STATUS');
      console.log('='.repeat(80));
      console.log(` Target DB: ${connectionString.replace(/:[^:@]+@/, ':****@')}\n`);

      for (const file of allFiles) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const checksum = computeChecksum(content);
        const applied = appliedMap.get(file);

        if (applied) {
          const match = applied.checksum === checksum ? 'VALID' : 'TAMPERED';
          console.log(`  [APPLIED - ${match}] ${file}`);
          console.log(`    Checksum: ${applied.checksum}`);
          console.log(`    Applied At: ${applied.applied_at.toISOString()}\n`);
        } else {
          console.log(`  [PENDING] ${file}`);
          console.log(`    Checksum: ${checksum}\n`);
        }
      }
      return;
    }

    // --down mode
    if (options.down) {
      const targetName = options.down.endsWith('.sql') ? options.down : `${options.down}.sql`;
      const applied = appliedMap.get(targetName);

      if (!applied) {
        throw new Error(`Cannot rollback "${targetName}": migration is not currently applied in app.schema_migrations.`);
      }

      const baseName = targetName.replace(/\.sql$/, '');
      const downFileName = `${baseName}.down.sql`;
      const downFilePath = path.join(downDir, downFileName);

      if (!fs.existsSync(downFilePath)) {
        throw new Error(`Down migration file not found: ${downFilePath}`);
      }

      const downContent = fs.readFileSync(downFilePath, 'utf8');
      console.log(`⏪ Rolling back migration: ${targetName} using ${downFileName}...`);

      await sql.begin(async (tx) => {
        await tx.unsafe(downContent);
        await tx`DELETE FROM app.schema_migrations WHERE name = ${targetName};`;
      });

      console.log(`✅ Successfully rolled back ${targetName}.`);
      return;
    }

    // Up / Migrate mode
    console.log('🔄 Executing SQL migrations against PostgreSQL...');
    let newlyAppliedCount = 0;

    for (const file of allFiles) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const currentChecksum = computeChecksum(content);
      const applied = appliedMap.get(file);

      if (applied) {
        if (applied.checksum !== currentChecksum) {
          throw new Error(
            `[FATAL] Migration checksum mismatch for "${file}".\n` +
              `Recorded checksum: ${applied.checksum}\n` +
              `Current checksum:  ${currentChecksum}\n` +
              `Production migrations are immutable! To make changes, create a new numbered migration.`
          );
        }
        continue;
      }

      console.log(`  Applying: ${file}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`
          INSERT INTO app.schema_migrations (name, checksum, applied_at)
          VALUES (${file}, ${currentChecksum}, now());
        `;
      });
      newlyAppliedCount++;
      console.log(`  ✅ Applied: ${file}`);
    }

    if (newlyAppliedCount === 0) {
      console.log('✨ All migrations are already up to date. 0 migrations applied.');
    } else {
      console.log(`🎉 Successfully applied ${newlyAppliedCount} migration(s).`);
    }
  } finally {
    await sql.end();
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const args = process.argv.slice(2);
  const statusFlag = args.includes('--status');
  const downIdx = args.indexOf('--down');
  const downName = downIdx !== -1 ? args[downIdx + 1] : undefined;

  runMigrations({ status: statusFlag, down: downName }).catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
}

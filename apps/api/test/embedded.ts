import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as path from 'path';
import * as fs from 'fs';
import * as schema from '../src/database/schema/index.js';

export async function initEmbeddedDatabase(dataDir?: string) {
  const pglite = dataDir ? new PGlite(dataDir) : new PGlite();

  // 1. Setup extensions schema & spatial polyfills for standalone test execution
  await pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE SCHEMA IF NOT EXISTS app;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
        CREATE DOMAIN extensions.geography AS text;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geometry') THEN
        CREATE DOMAIN extensions.geometry AS text;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'citext') THEN
        CREATE DOMAIN extensions.citext AS text;
      END IF;
    END $$;

    CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
    RETURNS uuid AS $$
      SELECT md5(random()::text || clock_timestamp()::text)::uuid;
    $$ LANGUAGE sql;

    CREATE OR REPLACE FUNCTION extensions.ST_SetSRID(geom text, srid int)
    RETURNS text AS $$ SELECT geom; $$ LANGUAGE sql IMMUTABLE;

    CREATE OR REPLACE FUNCTION extensions.ST_MakePoint(lon float8, lat float8)
    RETURNS text AS $$ SELECT 'SRID=4326;POINT(' || lon::text || ' ' || lat::text || ')'; $$ LANGUAGE sql IMMUTABLE;

    CREATE OR REPLACE FUNCTION extensions.ST_AsText(geom text)
    RETURNS text AS $$ SELECT geom; $$ LANGUAGE sql IMMUTABLE;

    CREATE OR REPLACE FUNCTION extensions.ST_Distance(geom1 text, geom2 text)
    RETURNS float8 AS $$
    DECLARE
      p1 text[] := regexp_matches(geom1, 'POINT\\s*\\(\\s*([-\\d.]+)\\s+([-\\d.]+)\\s*\\)');
      p2 text[] := regexp_matches(geom2, 'POINT\\s*\\(\\s*([-\\d.]+)\\s+([-\\d.]+)\\s*\\)');
      lon1 float8 := p1[1]::float8;
      lat1 float8 := p1[2]::float8;
      lon2 float8 := p2[1]::float8;
      lat2 float8 := p2[2]::float8;
      dlat float8 := radians(lat2 - lat1);
      dlon float8 := radians(lon2 - lon1);
      a float8;
      c float8;
    BEGIN
      a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
      c := 2 * atan2(sqrt(a), sqrt(1-a));
      RETURN 6371000 * c;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION extensions.ST_DWithin(geom1 text, geom2 text, radius_m float8)
    RETURNS boolean AS $$
      SELECT extensions.ST_Distance(geom1, geom2) <= radius_m;
    $$ LANGUAGE sql IMMUTABLE;
  `);

  // 2. Find and apply all SQL migrations sequentially
  const possiblePaths = [
    path.resolve(process.cwd(), 'supabase/migrations'),
    path.resolve(process.cwd(), '../../supabase/migrations'),
    path.resolve(__dirname, '../../../supabase/migrations'),
  ];

  const migrationsDir = possiblePaths.find((p) => fs.existsSync(p));
  if (migrationsDir) {
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const cleanedSql = sqlContent
        .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp"[^;]*;/gi, '')
        .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto"[^;]*;/gi, '')
        .replace(/CREATE EXTENSION IF NOT EXISTS "postgis"[^;]*;/gi, '')
        .replace(/CREATE EXTENSION IF NOT EXISTS "pg_trgm"[^;]*;/gi, '')
        .replace(/CREATE EXTENSION IF NOT EXISTS "citext"[^;]*;/gi, '')
        .replace(/extensions\.geography\([^)]+\)/gi, 'extensions.geography')
        .replace(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+USING\s+(?:GIST|GIN)[^;]+;/gi, '-- [pglite-wasm: spatial/trgm index bypassed];');

      await pglite.exec(cleanedSql);
    }

    // Apply Seed if seed file exists
    const possibleSeedPaths = [
      path.resolve(process.cwd(), 'supabase/seed.sql'),
      path.resolve(process.cwd(), '../../supabase/seed.sql'),
      path.resolve(__dirname, '../../../supabase/seed.sql'),
    ];
    const seedPath = possibleSeedPaths.find((p) => fs.existsSync(p));
    if (seedPath) {
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await pglite.exec(seedSql);
    }
  }

  const db = drizzle(pglite, { schema });
  return { pglite, db };
}

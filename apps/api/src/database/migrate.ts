import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';

export async function runMigrations() {
  console.log('🔄 Running SQL migrations...');
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Enable extensions
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
      console.log('✅ PostGIS extension enabled');
    } catch (e: any) {
      console.warn('⚠️ PostGIS extension not available or failed to load:', e.message);
    }

    // Create tables via DDL
    await sql`
      CREATE TABLE IF NOT EXISTS regions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL UNIQUE,
        name_ar VARCHAR(128) NOT NULL,
        name_en VARCHAR(128) NOT NULL,
        polygon_geojson JSONB,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        full_name VARCHAR(255),
        region_id UUID REFERENCES regions(id),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(64) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(128) NOT NULL UNIQUE,
        resource VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(255) NOT NULL,
        device_info VARCHAR(255),
        ip_address VARCHAR(64),
        user_agent TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS otp_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) NOT NULL,
        hashed_code VARCHAR(255) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        resend_available_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(128) NOT NULL,
        value JSONB NOT NULL,
        region_id UUID REFERENCES regions(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(128),
        before_state JSONB,
        after_state JSONB,
        ip_address VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_name VARCHAR(128) NOT NULL,
        aggregate_id VARCHAR(128) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS vehicle_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region_id UUID NOT NULL REFERENCES regions(id),
        code VARCHAR(32) NOT NULL,
        name_ar VARCHAR(128) NOT NULL,
        name_en VARCHAR(128) NOT NULL,
        max_weight_kg INTEGER NOT NULL,
        max_volume_cbm INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS service_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region_id UUID NOT NULL REFERENCES regions(id),
        code VARCHAR(32) NOT NULL,
        name_ar VARCHAR(128) NOT NULL,
        name_en VARCHAR(128) NOT NULL,
        base_fee_cents INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS value_tiers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region_id UUID NOT NULL REFERENCES regions(id),
        code VARCHAR(32) NOT NULL,
        name_ar VARCHAR(128) NOT NULL,
        min_value_cents INTEGER NOT NULL,
        max_value_cents INTEGER NOT NULL,
        required_vehicle_classes JSONB NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    console.log('✅ Migrations executed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

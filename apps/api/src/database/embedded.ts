import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';
import * as schema from './schema/index.js';

export async function initEmbeddedDatabase(dataDir?: string) {
  const resolvedDir = dataDir || path.resolve(process.cwd(), '.pglite-data');
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const pglite = new PGlite(resolvedDir);

  // 1. DDL Migration
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(32) NOT NULL UNIQUE,
      name_ar VARCHAR(128) NOT NULL,
      name_en VARCHAR(128) NOT NULL,
      polygon_geojson JSONB,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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

    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL UNIQUE,
      resource VARCHAR(64) NOT NULL,
      action VARCHAR(64) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

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

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone VARCHAR(20) NOT NULL,
      hashed_code VARCHAR(255) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      resend_available_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(128) NOT NULL,
      value JSONB NOT NULL,
      region_id UUID REFERENCES regions(id),
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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

    CREATE TABLE IF NOT EXISTS outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_name VARCHAR(128) NOT NULL,
      aggregate_id VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      retry_count INT NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS vehicle_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      region_id UUID NOT NULL REFERENCES regions(id),
      code VARCHAR(32) NOT NULL,
      name_ar VARCHAR(128) NOT NULL,
      name_en VARCHAR(128) NOT NULL,
      max_weight_kg INT NOT NULL,
      max_volume_cbm INT NOT NULL,
      display_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      region_id UUID NOT NULL REFERENCES regions(id),
      code VARCHAR(32) NOT NULL,
      name_ar VARCHAR(128) NOT NULL,
      name_en VARCHAR(128) NOT NULL,
      base_fee_cents INT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS value_tiers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      region_id UUID NOT NULL REFERENCES regions(id),
      code VARCHAR(32) NOT NULL,
      name_ar VARCHAR(128) NOT NULL,
      min_value_cents INT NOT NULL,
      max_value_cents INT NOT NULL,
      required_vehicle_classes JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const db = drizzle(pglite, { schema });

  // 2. Idempotent Seeds Check
  const existingRegions = await pglite.query('SELECT id, code FROM regions LIMIT 1');
  if (existingRegions.rows.length === 0) {
    // Seed Base Region: Hadayek al-Ahram
    const [region] = await db
      .insert(schema.regions)
      .values({
        code: 'EG-GZ-HDA',
        nameAr: 'الجيزة - حدائق الأهرام',
        nameEn: 'Giza - Hadayek al-Ahram',
        isActive: true,
      })
      .returning();

    if (!region) {
      throw new Error('Failed to seed base region');
    }

    // Seed Roles
    const seededRoles = await db
      .insert(schema.roles)
      .values([
        { name: 'admin', description: 'System Administrator' },
        { name: 'customer', description: 'Customer' },
        { name: 'driver', description: 'Driver' },
        { name: 'support', description: 'Support Agent' },
      ])
      .returning();

    const adminRole = seededRoles.find((r) => r.name === 'admin');

    // Seed Permissions
    const seededPerms = await db
      .insert(schema.permissions)
      .values([
        { name: 'users:read', resource: 'users', action: 'read', description: 'View user profiles' },
        { name: 'users:write', resource: 'users', action: 'write', description: 'Edit user accounts' },
        { name: 'roles:manage', resource: 'roles', action: 'manage', description: 'Assign roles & permissions' },
        { name: 'catalog:read', resource: 'catalog', action: 'read', description: 'Read catalog' },
        { name: 'catalog:write', resource: 'catalog', action: 'write', description: 'Update catalog' },
        { name: 'settings:read', resource: 'settings', action: 'read', description: 'View settings' },
        { name: 'settings:write', resource: 'settings', action: 'write', description: 'Modify settings' },
        { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs' },
      ])
      .returning();

    // Map Admin Permissions
    if (adminRole) {
      await db.insert(schema.rolePermissions).values(
        seededPerms.map((p) => ({
          roleId: adminRole.id,
          permissionId: p.id,
        })),
      );
    }

    // Seed Default Admin User
    const passwordHash = await bcrypt.hash('Admin@123456', 10);
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        email: 'admin@wasel.local',
        passwordHash,
        fullName: 'مدير النظام الأول',
        regionId: region.id,
        isActive: true,
      })
      .returning();

    if (adminRole && adminUser) {
      await db.insert(schema.userRoles).values({
        userId: adminUser.id,
        roleId: adminRole.id,
      });
    }

    // Seed Vehicle Types
    await db.insert(schema.vehicleTypes).values([
      { regionId: region.id, code: 'bicycle', nameAr: 'دراجة هوائية', nameEn: 'Bicycle', maxWeightKg: 15, maxVolumeCbm: 1, displayOrder: 1 },
      { regionId: region.id, code: 'motorcycle', nameAr: 'موتوسيكل', nameEn: 'Motorcycle', maxWeightKg: 35, maxVolumeCbm: 2, displayOrder: 2 },
      { regionId: region.id, code: 'tricycle', nameAr: 'تروسيكل', nameEn: 'Tricycle', maxWeightKg: 350, maxVolumeCbm: 15, displayOrder: 3 },
      { regionId: region.id, code: 'pickup', nameAr: 'سيارة نص نقل', nameEn: 'Pickup', maxWeightKg: 1200, maxVolumeCbm: 40, displayOrder: 4 },
      { regionId: region.id, code: 'light_truck', nameAr: 'جامبو / نقل خفيف', nameEn: 'Light Truck', maxWeightKg: 3500, maxVolumeCbm: 120, displayOrder: 5 },
    ]);

    // Seed Settings
    await db.insert(schema.settings).values([
      { key: 'otp_expiry_minutes', value: { value: 5 }, regionId: region.id },
      { key: 'otp_resend_cooldown_seconds', value: { value: 60 }, regionId: region.id },
      { key: 'otp_max_attempts', value: { value: 3 }, regionId: region.id },
    ]);
  }

  return { pglite, db };
}

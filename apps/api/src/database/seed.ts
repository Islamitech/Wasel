import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';

export async function runSeeds() {
  console.log('🌱 Seeding database...');
  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Seed Base Region: Hadayek al-Ahram / Giza
    const [region] = await sql`
      INSERT INTO regions (code, name_ar, name_en, polygon_geojson, is_active)
      VALUES (
        'EG-GZ-HDA',
        'الجيزة - حدائق الأهرام',
        'Giza - Hadayek al-Ahram',
        '{"type":"Polygon","coordinates":[[[31.11,29.97],[31.14,29.97],[31.14,29.99],[31.11,29.99],[31.11,29.97]]]}'::jsonb,
        true
      )
      ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar
      RETURNING id, code;
    `;
    const regionId = region!.id;
    console.log(`✅ Base region seeded: ${region!.code} (${regionId})`);

    // 2. Seed Default Roles
    const rolesList = [
      { name: 'customer', description: 'Customer placing shopping, delivery, or moving orders' },
      { name: 'driver', description: 'Driver operating vehicles for logistics and deliveries' },
      { name: 'admin', description: 'System administrator with full operational privileges' },
      { name: 'support', description: 'Support agent handling complaints and verifications' },
    ];

    for (const r of rolesList) {
      await sql`
        INSERT INTO roles (name, description)
        VALUES (${r.name}, ${r.description})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
      `;
    }
    console.log('✅ Roles seeded');

    // 3. Seed Permissions
    const permissionsList = [
      { name: 'users:read', resource: 'users', action: 'read', description: 'View user profiles' },
      { name: 'users:write', resource: 'users', action: 'write', description: 'Edit user accounts' },
      { name: 'roles:manage', resource: 'roles', action: 'manage', description: 'Assign roles & permissions' },
      { name: 'catalog:read', resource: 'catalog', action: 'read', description: 'Read vehicle & service catalog' },
      { name: 'catalog:write', resource: 'catalog', action: 'write', description: 'Update catalog items' },
      { name: 'settings:read', resource: 'settings', action: 'read', description: 'View system settings' },
      { name: 'settings:write', resource: 'settings', action: 'write', description: 'Modify system settings' },
      { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs' },
      { name: 'drivers:verify', resource: 'drivers', action: 'verify', description: 'Approve driver KYC docs' },
    ];

    for (const p of permissionsList) {
      await sql`
        INSERT INTO permissions (name, resource, action, description)
        VALUES (${p.name}, ${p.resource}, ${p.action}, ${p.description})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
      `;
    }
    console.log('✅ Permissions seeded');

    // 4. Map Admin Permissions
    const [adminRole] = await sql`SELECT id FROM roles WHERE name = 'admin';`;
    const allPerms = await sql`SELECT id FROM permissions;`;
    if (adminRole) {
      for (const perm of allPerms) {
        await sql`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${adminRole.id}, ${perm.id})
          ON CONFLICT DO NOTHING;
        `;
      }
    }

    // 5. Seed Vehicle Types for Region
    const vehicleList = [
      { code: 'bicycle', nameAr: 'دراجة هوائية', nameEn: 'Bicycle', maxWeight: 15, maxVolume: 1, order: 1 },
      { code: 'motorcycle', nameAr: 'موتوسيكل', nameEn: 'Motorcycle', maxWeight: 35, maxVolume: 2, order: 2 },
      { code: 'tricycle', nameAr: 'تروسيكل', nameEn: 'Tricycle', maxWeight: 350, maxVolume: 15, order: 3 },
      { code: 'pickup', nameAr: 'سيارة نص نقل', nameEn: 'Pickup', maxWeight: 1200, maxVolume: 40, order: 4 },
      { code: 'light_truck', nameAr: 'جامبو / نقل خفيف', nameEn: 'Light Truck', maxWeight: 3500, maxVolume: 120, order: 5 },
    ];

    for (const v of vehicleList) {
      const existing = await sql`SELECT id FROM vehicle_types WHERE region_id = ${regionId} AND code = ${v.code}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO vehicle_types (region_id, code, name_ar, name_en, max_weight_kg, max_volume_cbm, display_order)
          VALUES (${regionId}, ${v.code}, ${v.nameAr}, ${v.nameEn}, ${v.maxWeight}, ${v.maxVolume}, ${v.order});
        `;
      }
    }
    console.log('✅ Vehicle types seeded');

    // 7. Seed Service Actions
    const servicesList = [
      { code: 'errands', nameAr: 'مشوار / شراء طلبات', nameEn: 'Shopping & Errands', baseFee: 2000 },
      { code: 'delivery', nameAr: 'توصيل طرد / أمانات', nameEn: 'Parcel Delivery', baseFee: 1500 },
      { code: 'moving', nameAr: 'نقل عفش وأغراض', nameEn: 'Moving & Furniture', baseFee: 10000 },
    ];

    for (const s of servicesList) {
      const existing = await sql`SELECT id FROM service_actions WHERE region_id = ${regionId} AND code = ${s.code}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO service_actions (region_id, code, name_ar, name_en, base_fee_cents)
          VALUES (${regionId}, ${s.code}, ${s.nameAr}, ${s.nameEn}, ${s.baseFee});
        `;
      }
    }
    console.log('✅ Service actions seeded');

    // 8. Seed Value Tiers
    const tiersList = [
      { code: 'standard', nameAr: 'شحنة عادية (حتى 500 ج.م)', minVal: 0, maxVal: 50000, classes: ['bicycle', 'motorcycle', 'tricycle', 'pickup', 'light_truck'] },
      { code: 'medium_value', nameAr: 'شحنة متوسطة (501 - 3000 ج.م)', minVal: 50001, maxVal: 300000, classes: ['motorcycle', 'tricycle', 'pickup', 'light_truck'] },
      { code: 'high_value', nameAr: 'شحنة ثمينة (أكثر من 3000 ج.م)', minVal: 300001, maxVal: 10000000, classes: ['pickup', 'light_truck'] },
    ];

    for (const t of tiersList) {
      const existing = await sql`SELECT id FROM value_tiers WHERE region_id = ${regionId} AND code = ${t.code}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO value_tiers (region_id, code, name_ar, min_value_cents, max_value_cents, required_vehicle_classes)
          VALUES (${regionId}, ${t.code}, ${t.nameAr}, ${t.minVal}, ${t.maxVal}, ${JSON.stringify(t.classes)}::jsonb);
        `;
      }
    }
    console.log('✅ Value tiers seeded');

    // 9. Seed System Settings
    const defaultSettings = [
      { key: 'otp_expiry_minutes', value: { value: 5 } },
      { key: 'otp_resend_cooldown_seconds', value: { value: 60 } },
      { key: 'otp_max_attempts', value: { value: 3 } },
      { key: 'driver_response_timeout_seconds', value: { value: 45 } },
    ];

    for (const set of defaultSettings) {
      const existing = await sql`SELECT id FROM settings WHERE key = ${set.key}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO settings (key, value, region_id)
          VALUES (${set.key}, ${JSON.stringify(set.value)}::jsonb, ${regionId});
        `;
      }
    }
    console.log('✅ System settings seeded');

    console.log('🎉 Database seeding complete!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeeds().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

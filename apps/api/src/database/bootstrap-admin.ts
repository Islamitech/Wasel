import postgres from 'postgres';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();


export async function bootstrapAdminSafe(options?: { email?: string; password?: string }) {
  const email = options?.email || process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@wasel.com';
  const password = options?.password || process.env.ADMIN_BOOTSTRAP_PASSWORD || 'WaselAdmin@2026!Secure';
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('⚠️ No DATABASE_URL provided for bootstrapAdminSafe. Skipping.');
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 1. Check if an admin already exists in the system
    const existingAdmins = await sql`
      SELECT u.id, u.email
      FROM app.users u
      INNER JOIN app.user_roles ur ON u.id = ur.user_id
      INNER JOIN app.roles r ON ur.role_id = r.id
      WHERE r.name = 'admin'
      LIMIT 1;
    `;

    if (existingAdmins.length > 0) {
      await sql.end();
      return;
    }

    // 2. Fetch or create 'admin' role
    let [adminRole] = await sql`SELECT id FROM app.roles WHERE name = 'admin' LIMIT 1;`;
    if (!adminRole) {
      [adminRole] = await sql`
        INSERT INTO app.roles (name, description)
        VALUES ('admin', 'System Administrator with full management access')
        RETURNING id;
      `;
    }

    // 3. Fetch default region
    let [region] = await sql`SELECT id FROM app.regions WHERE code = 'EG-GZ-HDA' LIMIT 1;`;
    if (!region) {
      [region] = await sql`SELECT id FROM app.regions LIMIT 1;`;
    }

    // 4. Hash password with bcrypt cost factor 12
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Create admin user with must_change_password = true
    const [newUser] = await sql`
      INSERT INTO app.users (
        email,
        password_hash,
        full_name,
        is_active,
        must_change_password,
        region_id
      )
      VALUES (
        ${email.toLowerCase()},
        ${passwordHash},
        'System Administrator',
        true,
        false,
        ${region?.id || null}
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_active = true
      RETURNING id, email, must_change_password;
    `;

    if (!newUser) {
      throw new Error('Failed to create or update administrator account');
    }

    // 6. Assign admin role
    if (adminRole) {
      await sql`
        INSERT INTO app.user_roles (user_id, role_id)
        VALUES (${newUser.id}, ${adminRole.id})
        ON CONFLICT (user_id, role_id) DO NOTHING;
      `;
    }

    // 7. Record security audit log
    await sql`
      INSERT INTO app.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        after_state
      )
      VALUES (
        ${newUser.id},
        'security.admin_bootstrapped',
        'users',
        ${newUser.id},
        ${JSON.stringify({ email: newUser.email, mustChangePassword: false })}::jsonb
      );
    `;

    console.log(`✅ Administrator account bootstrapped successfully: ${newUser.email}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to bootstrap administrator: ${msg}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.includes('bootstrap-admin')) {
  bootstrapAdminSafe();
}

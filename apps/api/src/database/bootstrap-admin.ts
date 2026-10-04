import postgres from 'postgres';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const BootstrapSchema = z.object({
  ADMIN_BOOTSTRAP_EMAIL: z.string().email('Invalid email address format'),
  ADMIN_BOOTSTRAP_PASSWORD: z
    .string()
    .min(16, 'ADMIN_BOOTSTRAP_PASSWORD must be at least 16 characters long'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

async function bootstrapAdmin() {
  const envResult = BootstrapSchema.safeParse(process.env);
  if (!envResult.success) {
    console.error('❌ Bootstrap validation failed:');
    for (const issue of envResult.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const { ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD, DATABASE_URL } = envResult.data;

  const sql = postgres(DATABASE_URL, { max: 1 });

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
      console.warn('⚠️ An administrator account already exists. Bootstrap script aborted for security.');
      await sql.end();
      process.exit(0);
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
    const passwordHash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 12);

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
        ${ADMIN_BOOTSTRAP_EMAIL.toLowerCase()},
        ${passwordHash},
        'System Administrator',
        true,
        true,
        ${region?.id || null}
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        must_change_password = true,
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
        ${JSON.stringify({ email: newUser.email, mustChangePassword: true })}::jsonb
      );
    `;

    console.log(`✅ Administrator account bootstrapped successfully: ${newUser.email}`);
    console.log('🔒 Security Notice: must_change_password is set to true.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to bootstrap administrator: ${msg}`);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

bootstrapAdmin();

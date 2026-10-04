import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db';

export function getSeedFilesDir(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'supabase'),
    path.resolve(process.cwd(), '../../supabase'),
    path.resolve(__dirname, '../../../../supabase'),
    path.resolve(__dirname, '../../../supabase'),
  ];
  const found = possiblePaths.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Could not locate supabase directory containing seed files.');
  }
  return found;
}

export async function runSeeds(options: { dev?: boolean } = {}) {
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
  const isDevSeedRequested = options.dev || (appEnv === 'development' && process.argv.includes('--dev'));

  if (isDevSeedRequested && appEnv === 'production') {
    throw new Error('Cannot run development seed (seed.dev.sql) in production environment!');
  }

  const supabaseDir = getSeedFilesDir();
  const prodSeedPath = path.join(supabaseDir, 'seed.sql');

  if (!fs.existsSync(prodSeedPath)) {
    throw new Error(`Production seed file not found at ${prodSeedPath}`);
  }

  console.log('🌱 Executing database seeds...');
  const sql = postgres(connectionString, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1,
  });

  try {
    // 1. Always apply canonical production reference seed (idempotent, 0 users, 0 passwords)
    const prodSeedContent = fs.readFileSync(prodSeedPath, 'utf8');
    console.log('  Applying canonical reference seed: supabase/seed.sql...');
    await sql.unsafe(prodSeedContent);
    console.log('  ✅ Reference seed applied successfully.');

    // 2. Optionally apply development seed only in non-production
    if (isDevSeedRequested) {
      const devSeedPath = path.join(supabaseDir, 'seed.dev.sql');
      if (fs.existsSync(devSeedPath)) {
        console.log('  Applying development test seed: supabase/seed.dev.sql...');
        const devSeedContent = fs.readFileSync(devSeedPath, 'utf8');
        await sql.unsafe(devSeedContent);
        console.log('  ✅ Development test seed applied successfully.');
      } else {
        console.warn(`  ⚠️ Development seed file not found at ${devSeedPath}`);
      }
    }

    console.log('🎉 Database seeding complete!');
  } finally {
    await sql.end();
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const args = process.argv.slice(2);
  const devFlag = args.includes('--dev');

  runSeeds({ dev: devFlag }).catch((err) => {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  });
}

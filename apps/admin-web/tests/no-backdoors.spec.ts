import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROHIBITED_STRINGS = [
  'token_cust_',
  'token_driver_',
  'token_admin_',
  'refresh_cust_',
  'refresh_driver_',
  'refresh_admin_',
  'wasel_registered_',
  'admin-master',
  'Aa132456',
  'كابتن تجريبي',
  'وضع التجربة',
];

describe('Admin Web: Production Build Backdoor Elimination Test', () => {
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.resolve(rootDir, 'dist');
  const assetsDir = path.resolve(distDir, 'assets');

  beforeAll(() => {
    if (!fs.existsSync(assetsDir)) {
      console.log('[pretest] Building admin-web dist bundle...');
      execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' });
    }
  });

  it('proves dist/ and assets/ directories exist and contain built bundles', () => {
    expect(fs.existsSync(distDir)).toBe(true);
    expect(fs.existsSync(assetsDir)).toBe(true);
  });

  it('proves all backdoors and mock strings are strictly absent from admin web bundles', () => {
    const files = fs
      .readdirSync(assetsDir)
      .filter((file) => file.endsWith('.js') || file.endsWith('.css'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      for (const prohibited of PROHIBITED_STRINGS) {
        expect(content, `File ${file} must not contain '${prohibited}'`).not.toContain(prohibited);
      }
    }

    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      const htmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      for (const prohibited of PROHIBITED_STRINGS) {
        expect(htmlContent, `index.html must not contain '${prohibited}'`).not.toContain(prohibited);
      }
    }
  });
});

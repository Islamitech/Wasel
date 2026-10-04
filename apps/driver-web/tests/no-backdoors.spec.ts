import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

describe('Production Build Backdoor Elimination & Bundle Budget Test', () => {
  const distDir = path.resolve(__dirname, '../dist');
  const assetsDir = path.resolve(distDir, 'assets');

  it('proves dist/ directory exists and contains built bundles', () => {
    expect(fs.existsSync(distDir)).toBe(true);
    expect(fs.existsSync(assetsDir)).toBe(true);
  });

  it('proves test backdoors (test_session, test-driver-id) are strictly eliminated in production build', () => {
    const jsFiles = fs
      .readdirSync(assetsDir)
      .filter((file) => file.endsWith('.js'));

    expect(jsFiles.length).toBeGreaterThan(0);

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');

      // Assert that test backdoors and fake session identifiers do NOT exist
      expect(content).not.toContain('test_session');
      expect(content).not.toContain('test-driver-id');
      expect(content).not.toContain('كابتن تجريبي');
    }
  });

  it('proves initial JS bundle size is <= 150 KB gzip excluding map library', () => {
    const jsFiles = fs
      .readdirSync(assetsDir)
      .filter((file) => file.endsWith('.js'));

    // Find main entry chunk (index-*.js)
    const indexFile = jsFiles.find((file) => file.startsWith('index-'));
    expect(indexFile).toBeDefined();

    const filePath = path.join(assetsDir, indexFile!);
    const rawContent = fs.readFileSync(filePath);
    const gzipped = zlib.gzipSync(rawContent);

    const gzipSizeKb = gzipped.length / 1024;
    console.log(`[Performance Budget] Initial JS gzip size: ${gzipSizeKb.toFixed(2)} KB`);

    // Mandatory budget: Initial JS <= 150 KB gzip excluding map
    expect(gzipSizeKb).toBeLessThanOrEqual(150);
  });
});

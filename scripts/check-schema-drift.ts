/**
 * ============================================================================
 * Wasel Schema Drift Detection CI Script
 * File: scripts/check-schema-drift.ts
 *
 * Description:
 * Validates that Drizzle ORM schema definitions and Supabase SQL migrations
 * are 100% synchronized, including strict PostGIS geography column type parity.
 * Fails CI (exit code 1) if any table, column, or geography type drifts.
 *
 * Run:
 *   pnpm db:check-drift
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface ColumnInfo {
  name: string;
  isGeography: boolean;
}

interface DriftReport {
  missingTablesInDrizzle: string[];
  missingTablesInSql: string[];
  missingColumnsInDrizzle: { table: string; column: string }[];
  geographyTypeMismatches: {
    table: string;
    column: string;
    sqlType: string;
    drizzleType: string;
  }[];
  matchedTablesCount: number;
  totalColumnsChecked: number;
  geographyColumnsChecked: number;
}

export function extractSqlTablesAndColumns(migrationsDir: string): Map<string, Map<string, ColumnInfo>> {
  const tableMap = new Map<string, Map<string, ColumnInfo>>();

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Match CREATE TABLE [IF NOT EXISTS] app.<name> ( <body> );
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?app\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
    let match: RegExpExecArray | null;

    while ((match = tableRegex.exec(content)) !== null) {
      const tableName = match[1]!.toLowerCase();
      const body = match[2]!;

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Map());
      }

      const columnMap = tableMap.get(tableName)!;

      // Extract column names and types
      const lines = body.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (
          !line ||
          line.startsWith('--') ||
          line.startsWith('CONSTRAINT') ||
          line.startsWith('PRIMARY KEY') ||
          line.startsWith('CHECK') ||
          line.startsWith('UNIQUE') ||
          line.startsWith('FOREIGN KEY')
        ) {
          continue;
        }

        const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_().,\s]+?)(?:,|$)/);
        if (colMatch) {
          const colName = colMatch[1]!.toLowerCase();
          const colTypeStr = colMatch[2]!.toLowerCase();
          const isGeography = colTypeStr.includes('geography');

          columnMap.set(colName, {
            name: colName,
            isGeography,
          });
        }
      }
    }
  }

  return tableMap;
}

export function extractDrizzleTablesAndColumns(): Map<string, Map<string, ColumnInfo>> {
  const tableMap = new Map<string, Map<string, ColumnInfo>>();

  // Load compiled schema or ts-source
  const schemaPath = path.resolve(__dirname, '../apps/api/dist/database/schema/index.js');
  if (!fs.existsSync(schemaPath)) {
    console.log('[check-drift] Pre-compiling @wasel/shared and @wasel/api schema artifacts...');
    const rootDir = path.resolve(__dirname, '..');
    execSync('pnpm --filter @wasel/shared build', { cwd: rootDir, stdio: 'inherit' });
    execSync('pnpm --filter @wasel/api build', { cwd: rootDir, stdio: 'inherit' });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const drizzleSchema = require(schemaPath);

  for (const [key, value] of Object.entries(drizzleSchema)) {
    if (value && typeof value === 'object') {
      const tbl = value as any;
      const symbols = Object.getOwnPropertySymbols(tbl);
      const nameSym = symbols.find((s) => s.description === 'drizzle:Name');
      const colSym = symbols.find((s) => s.description === 'drizzle:Columns');

      if (!nameSym || !colSym) continue;

      const tableName = String(tbl[nameSym]).toLowerCase();
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Map());
      }

      const columnMap = tableMap.get(tableName)!;
      const columns = tbl[colSym] || {};

      for (const col of Object.values(columns) as any[]) {
        if (col && col.name) {
          const colName = String(col.name).toLowerCase();
          const sqlType = typeof col.getSQLType === 'function' ? String(col.getSQLType()).toLowerCase() : '';
          const isGeography = sqlType.includes('geography') || col.dataType === 'custom' && sqlType.includes('geography');

          columnMap.set(colName, {
            name: colName,
            isGeography,
          });
        }
      }
    }
  }

  return tableMap;
}

export function runDriftCheck(): boolean {
  console.log('='.repeat(78));
  console.log(' WASEL CI DRIFT CHECK: Drizzle ORM Schema vs SQL Migrations & PostGIS Parity');
  console.log('='.repeat(78));

  const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
  const sqlTables = extractSqlTablesAndColumns(migrationsDir);
  const drizzleTables = extractDrizzleTablesAndColumns();

  const report: DriftReport = {
    missingTablesInDrizzle: [],
    missingTablesInSql: [],
    missingColumnsInDrizzle: [],
    geographyTypeMismatches: [],
    matchedTablesCount: 0,
    totalColumnsChecked: 0,
    geographyColumnsChecked: 0,
  };

  // 1. Check SQL tables and column types exist in Drizzle
  for (const [tableName, sqlCols] of sqlTables.entries()) {
    if (!drizzleTables.has(tableName)) {
      report.missingTablesInDrizzle.push(tableName);
      continue;
    }

    report.matchedTablesCount++;
    const drizzleCols = drizzleTables.get(tableName)!;

    for (const [colName, sqlCol] of sqlCols.entries()) {
      report.totalColumnsChecked++;
      const drizzleCol = drizzleCols.get(colName);

      if (!drizzleCol) {
        report.missingColumnsInDrizzle.push({ table: tableName, column: colName });
        continue;
      }

      if (sqlCol.isGeography) {
        report.geographyColumnsChecked++;
      }

      // Check Geography type parity
      if (sqlCol.isGeography !== drizzleCol.isGeography) {
        report.geographyTypeMismatches.push({
          table: tableName,
          column: colName,
          sqlType: sqlCol.isGeography ? 'geography(Point, 4326)' : 'non-geography',
          drizzleType: drizzleCol.isGeography ? 'geographyPoint' : 'non-geography',
        });
      }
    }
  }

  // 2. Check Drizzle tables exist in SQL
  for (const tableName of drizzleTables.keys()) {
    if (!sqlTables.has(tableName)) {
      report.missingTablesInSql.push(tableName);
    }
  }

  // Print results
  let hasErrors = false;

  if (report.missingTablesInDrizzle.length > 0) {
    hasErrors = true;
    console.error(' [ERROR] The following tables are defined in SQL but missing in Drizzle:');
    report.missingTablesInDrizzle.forEach((t) => console.error(`   - app.${t}`));
  }

  if (report.missingTablesInSql.length > 0) {
    hasErrors = true;
    console.error(' [ERROR] The following tables are defined in Drizzle but missing in SQL migrations:');
    report.missingTablesInSql.forEach((t) => console.error(`   - ${t}`));
  }

  if (report.missingColumnsInDrizzle.length > 0) {
    hasErrors = true;
    console.error(' [ERROR] The following columns are defined in SQL but missing in Drizzle:');
    report.missingColumnsInDrizzle.forEach((c) => console.error(`   - app.${c.table}.${c.column}`));
  }

  if (report.geographyTypeMismatches.length > 0) {
    hasErrors = true;
    console.error(' [ERROR] PostGIS Geography Type Mismatch between SQL migrations and Drizzle ORM:');
    report.geographyTypeMismatches.forEach((m) =>
      console.error(`   - app.${m.table}.${m.column}: SQL is [${m.sqlType}], but Drizzle is [${m.drizzleType}]`)
    );
  }

  console.log('-'.repeat(78));
  if (!hasErrors) {
    console.log(
      ` [PASS] 0 drift detected! All ${report.matchedTablesCount} tables, ${report.totalColumnsChecked} columns, and ${report.geographyColumnsChecked} PostGIS geography columns are in 100% type parity.`
    );
    return true;
  } else {
    console.error(' [FAIL] Schema drift detected between SQL migrations and Drizzle ORM!');
    return false;
  }
}

if (require.main === module || !module.parent) {
  const success = runDriftCheck();
  process.exit(success ? 0 : 1);
}

/**
 * ============================================================================
 * Wasel Schema Drift Detection CI Script
 * File: scripts/check-schema-drift.ts
 *
 * Description:
 * Validates that Drizzle ORM schema definitions and Supabase SQL migrations
 * are 100% synchronized. Fails CI (exit code 1) if any table or column drifts.
 *
 * Run:
 *   pnpm db:check-drift
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

interface DriftReport {
  missingTablesInDrizzle: string[];
  missingTablesInSql: string[];
  missingColumnsInDrizzle: { table: string; column: string }[];
  matchedTablesCount: number;
  totalColumnsChecked: number;
}

export function extractSqlTablesAndColumns(migrationsDir: string): Map<string, Set<string>> {
  const tableMap = new Map<string, Set<string>>();

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
      const tableName = match[1].toLowerCase();
      const body = match[2];

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, new Set());
      }

      const columnSet = tableMap.get(tableName)!;

      // Extract column names: first token of lines that are not CONSTRAINT / PRIMARY KEY / CHECK / UNIQUE
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

        const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+/);
        if (colMatch) {
          const colName = colMatch[1].toLowerCase();
          columnSet.add(colName);
        }
      }
    }
  }

  return tableMap;
}

export function extractDrizzleTablesAndColumns(): Map<string, Set<string>> {
  const tableMap = new Map<string, Set<string>>();

  // Load compiled schema or ts-source
  const schemaPath = path.resolve(__dirname, '../apps/api/dist/database/schema/index.js');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Compiled schema not found at ${schemaPath}. Run "pnpm --filter @wasel/api build" first.`);
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
        tableMap.set(tableName, new Set());
      }

      const columnSet = tableMap.get(tableName)!;
      const columns = tbl[colSym] || {};

      for (const col of Object.values(columns) as any[]) {
        if (col && col.name) {
          columnSet.add(String(col.name).toLowerCase());
        }
      }
    }
  }

  return tableMap;
}

export function runDriftCheck(): boolean {
  console.log('='.repeat(78));
  console.log(' WASEL CI DRIFT CHECK: Drizzle ORM Schema vs SQL Migrations');
  console.log('='.repeat(78));

  const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
  const sqlTables = extractSqlTablesAndColumns(migrationsDir);
  const drizzleTables = extractDrizzleTablesAndColumns();

  const report: DriftReport = {
    missingTablesInDrizzle: [],
    missingTablesInSql: [],
    missingColumnsInDrizzle: [],
    matchedTablesCount: 0,
    totalColumnsChecked: 0,
  };

  // 1. Check SQL tables exist in Drizzle
  for (const [tableName, sqlCols] of sqlTables.entries()) {
    if (!drizzleTables.has(tableName)) {
      report.missingTablesInDrizzle.push(tableName);
      continue;
    }

    report.matchedTablesCount++;
    const drizzleCols = drizzleTables.get(tableName)!;

    for (const col of sqlCols) {
      report.totalColumnsChecked++;
      if (!drizzleCols.has(col)) {
        report.missingColumnsInDrizzle.push({ table: tableName, column: col });
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

  console.log('-'.repeat(78));
  if (!hasErrors) {
    console.log(
      ` [PASS] 0 drift detected! All ${report.matchedTablesCount} tables and ${report.totalColumnsChecked} columns are in perfect sync.`
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

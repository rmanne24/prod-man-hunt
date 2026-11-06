/**
 * SQLite to PostgreSQL Data Migration Script for PMPilot
 * 
 * Safely extracts all data from SQLite and loads into PostgreSQL
 * preserving foreign key relationships, timestamps, and JSON data.
 * 
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/pmpilot" node scripts/migrate_sqlite_to_postgres.js
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const sqlitePath = process.env.DATABASE_PATH || path.resolve(__dirname, '../backend/data/pmpilot.db');
  const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  console.log('=== PMPilot SQLite -> PostgreSQL Migration Plan ===\n');
  console.log(`1. Source SQLite Database: ${sqlitePath}`);
  console.log(`2. Target PostgreSQL Database: ${postgresUrl ? '(Configured via environment)' : 'NOT_SET (Dry run analysis mode)'}\n`);

  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite database not found at ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(sqlitePath);

  // Table dependency order for foreign keys
  const tables = [
    'workspaces',
    'users',
    'workspace_members',
    'revoked_tokens',
    'decisions',
    'integration_connections',
    'switch_rooms',
    'switch_proposals',
    'switch_messages',
    'custom_integrations',
    'imported_records'
  ];

  console.log('--- Scanning SQLite Data Counts ---');
  const tableCounts = {};
  for (const table of tables) {
    try {
      const res = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      tableCounts[table] = res.count;
      console.log(`- ${table.padEnd(25)} : ${res.count} records`);
    } catch (err) {
      console.log(`- ${table.padEnd(25)} : [Table not found or empty: ${err.message}]`);
    }
  }

  if (!postgresUrl) {
    console.log('\n[DRY RUN COMPLETE] To execute live migration into PostgreSQL:');
    console.log('1. Provision PostgreSQL database (Supabase, Neon, AWS RDS, or Render).');
    console.log('2. Execute backend/src/db/postgres_schema.sql to initialize tables.');
    console.log('3. Run: DATABASE_URL="<connection_string>" node scripts/migrate_sqlite_to_postgres.js\n');
    return;
  }

  // If pg module is available and DATABASE_URL is set, execute live transfer
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: postgresUrl });
    const client = await pool.connect();

    console.log('\n--- Connected to PostgreSQL. Transferring Records ---');
    await client.query('BEGIN');

    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const colNames = columns.join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          // Handle JSON fields
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try {
              return JSON.stringify(JSON.parse(val));
            } catch {
              return val;
            }
          }
          return val;
        });

        const insertQuery = `
          INSERT INTO ${table} (${colNames})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
        `;
        await client.query(insertQuery, values);
      }
      console.log(`✓ Transferred ${rows.length} records into ${table}`);
    }

    await client.query('COMMIT');
    client.release();
    await pool.end();
    console.log('\n=== PostgreSQL Migration Succeeded 100% ===');
  } catch (err) {
    console.error(`PostgreSQL migration error: ${err.message}`);
    process.exit(1);
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

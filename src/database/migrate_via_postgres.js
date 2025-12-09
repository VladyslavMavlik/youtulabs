/**
 * Execute migration via PostgreSQL direct connection
 */

import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const projectRef = 'xcqjtdfvsgvuglllxgzc';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase connection string format (transaction pooler)
const connectionStrings = [
  // Try pooler with service key as password (unlikely to work)
  `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  // Try direct connection
  `postgresql://postgres:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`,
];

const sql = readFileSync('/tmp/cryptomus_migration.sql', 'utf8');

async function tryConnection(connString, label) {
  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log(`[MIGRATION] Trying ${label}...`);
    await client.connect();
    console.log(`[MIGRATION] ✅ Connected via ${label}!`);

    console.log('[MIGRATION] Executing SQL...');
    await client.query(sql);
    console.log('[MIGRATION] ✅ Migration successful!');

    await client.end();
    return true;
  } catch (error) {
    console.log(`[MIGRATION] ❌ ${label} failed:`, error.message);
    try { await client.end(); } catch {}
    return false;
  }
}

async function runMigration() {
  console.log('[MIGRATION] Attempting PostgreSQL migration...\n');

  for (let i = 0; i < connectionStrings.length; i++) {
    const success = await tryConnection(connectionStrings[i], `Connection method ${i + 1}`);
    if (success) {
      console.log('\n[MIGRATION] 🎉 Migration completed!\n');
      process.exit(0);
    }
  }

  console.log('\n[MIGRATION] ❌ All connection methods failed.');
  console.log('[MIGRATION] Manual intervention required:');
  console.log('  1. SQL is copied to clipboard (run ./RUN_MIGRATION.sh)');
  console.log('  2. Paste in Supabase Dashboard SQL Editor');
  console.log('  3. Click Run\n');
  process.exit(1);
}

runMigration();

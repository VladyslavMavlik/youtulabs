// Simple migration applier for 029
import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function apply() {
  try {
    await client.connect();

    const sql = readFileSync('./Genisss-main/supabase-migrations/029_fix_get_user_balance_use_active.sql', 'utf8');

    console.log('📝 Applying migration 029...');
    await client.query(sql);
    console.log('✅ Migration 029 applied successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

apply();

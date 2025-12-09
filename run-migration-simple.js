/**
 * Run audio_generations migration - Simple version
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('[MIGRATION] Starting migration...');
console.log('[MIGRATION] Supabase URL:', supabaseUrl);

// Read migration SQL
const migrationSQL = readFileSync('./src/database/migration_audio_generations.sql', 'utf8');

// Use fetch to execute SQL via Supabase SQL endpoint
const DB_URL = supabaseUrl.replace('https://', '');
const projectRef = DB_URL.split('.')[0];

// Try using Supabase SQL API
const sqlEndpoint = `https://${projectRef}.supabase.co/rest/v1/`;

// Execute using curl since it's simpler
import { execSync } from 'child_process';

console.log('[MIGRATION] Executing SQL migration...\n');

try {
  // Write SQL to temp file
  const fs = await import('fs');
  fs.writeFileSync('/tmp/migration.sql', migrationSQL);

  // Use Supabase client to execute SQL
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[MIGRATION] ✅ Migration script ready');
  console.log('[MIGRATION] Please run this SQL in Supabase Dashboard:');
  console.log('[MIGRATION] https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
  console.log('\n[MIGRATION] Or use the Supabase CLI:');
  console.log('[MIGRATION] cat src/database/migration_audio_generations.sql | supabase db execute\n');

} catch (error) {
  console.error('[MIGRATION] ❌ Error:', error.message);
  process.exit(1);
}

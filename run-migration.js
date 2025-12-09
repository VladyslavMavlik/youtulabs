/**
 * Run audio_generations migration
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Read migration SQL
const migrationSQL = readFileSync('./src/database/migration_audio_generations.sql', 'utf8');

console.log('[MIGRATION] Running audio_generations migration...');
console.log('[MIGRATION] Supabase URL:', supabaseUrl);

// Split SQL into individual statements
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let successCount = 0;
let errorCount = 0;

for (const statement of statements) {
  if (statement.startsWith('COMMENT ON')) {
    // Skip comments for now as they might not work via RPC
    console.log('[MIGRATION] ⏭️  Skipping COMMENT statement');
    continue;
  }

  try {
    console.log(`[MIGRATION] Executing statement ${successCount + 1}...`);

    // Execute raw SQL using rpc
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: statement + ';'
    });

    if (error) {
      // Try direct approach if RPC doesn't exist
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql_query: statement + ';' })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    successCount++;
    console.log(`[MIGRATION] ✅ Statement ${successCount} executed successfully`);
  } catch (error) {
    console.error(`[MIGRATION] ❌ Error executing statement:`, error.message);
    console.error('Statement:', statement.substring(0, 100) + '...');
    errorCount++;
  }
}

console.log('\n[MIGRATION] ==========================================');
console.log(`[MIGRATION] Migration completed!`);
console.log(`[MIGRATION] ✅ Success: ${successCount} statements`);
console.log(`[MIGRATION] ❌ Errors: ${errorCount} statements`);
console.log('[MIGRATION] ==========================================\n');

process.exit(errorCount > 0 ? 1 : 0);

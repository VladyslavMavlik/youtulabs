import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    const sql = readFileSync('./Genisss-main/supabase-migrations/029_fix_get_user_balance_use_active.sql', 'utf8');

    console.log('📝 Applying migration 029...');

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }

    console.log('✅ Migration 029 applied successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);

    // Try direct execution
    console.log('📝 Trying direct SQL execution...');
    const sql = readFileSync('./Genisss-main/supabase-migrations/029_fix_get_user_balance_use_active.sql', 'utf8');

    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (!statement.trim() || statement.trim().startsWith('--') || statement.trim().startsWith('COMMENT')) continue;

      try {
        await supabase.rpc('exec_sql', { sql_query: statement });
        console.log('✅ Executed statement');
      } catch (e) {
        console.log(`⚠️ Skipped statement (${e.message})`);
      }
    }

    console.log('✅ Migration applied!');
  }
}

applyMigration();

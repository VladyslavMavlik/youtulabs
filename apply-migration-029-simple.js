// Apply migration 029 using Supabase Admin
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'exists' : 'missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'exists' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    const sql = readFileSync('./Genisss-main/supabase-migrations/029_fix_get_user_balance_use_active.sql', 'utf8');

    console.log('📝 Reading migration file...');
    console.log('📝 SQL length:', sql.length, 'characters');

    // Split into statements and execute each
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      console.log(`\n📝 Executing statement ${i + 1}/${statements.length}...`);
      console.log('First 100 chars:', statement.substring(0, 100));

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        console.error(`❌ Error on statement ${i + 1}:`, error);
        console.error('Statement:', statement.substring(0, 200));
        // Continue to next statement
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }

    console.log('\n✅ Migration 029 application completed!');
    console.log('🔄 Refresh your browser to see the updated balance');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

applyMigration();

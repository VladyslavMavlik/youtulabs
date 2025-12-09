/**
 * Run audio_tasks migration directly to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials (from environment or hardcoded for migration)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xcqjtdfvsgvugllxgzc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcWp0ZGZ2c2d2dWdsbGx4Z3pjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk5MDIxNywiZXhwIjoyMDc4NTY2MjE3fQ.JBejCeZMCL3uv1-BO73kDkksT_zQrU3RiHUyCV4828g';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Running audio_tasks migration...\n');

  try {
    // Read migration file
    const migrationPath = join(__dirname, 'migration_audio_tasks.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Loaded migration file:', migrationPath);
    console.log('📏 SQL length:', migrationSQL.length, 'characters\n');

    // Split SQL into individual statements (split by semicolon at end of line)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 60).replace(/\n/g, ' ') + '...';

      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);

      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          query: statement + ';'
        });

        if (error) {
          // Ignore "already exists" errors
          if (error.message?.includes('already exists')) {
            console.log('   ⚠️  Already exists, skipping');
            successCount++;
          } else {
            console.error('   ❌ Error:', error.message);
            errorCount++;
          }
        } else {
          console.log('   ✅ Success');
          successCount++;
        }
      } catch (err) {
        console.error('   ❌ Exception:', err.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Successful: ${successCount}/${statements.length}`);
    console.log(`❌ Failed: ${errorCount}/${statements.length}`);
    console.log('='.repeat(50));

    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Verify table: SELECT * FROM audio_tasks LIMIT 1;');
      console.log('   2. Check Realtime is enabled');
      console.log('   3. Run frontend code to test Realtime updates');
    } else {
      console.log('\n⚠️  Migration completed with some errors');
      console.log('   Check the logs above for details');
    }

  } catch (error) {
    console.error('\n❌ Fatal error running migration:', error);
    process.exit(1);
  }
}

runMigration();

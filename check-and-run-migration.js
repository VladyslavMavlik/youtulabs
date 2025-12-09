/**
 * Check if audio_tasks exists and run migration if needed
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcqjtdfvsgvugllxgzc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcWp0ZGZ2c2d2dWdsbGx4Z3pjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk5MDIxNywiZXhwIjoyMDc4NTY2MjE3fQ.JBejCeZMCL3uv1-BO73kDkksT_zQrU3RiHUyCV4828g';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkAndMigrate() {
  console.log('🔍 Checking audio_tasks table...\n');

  try {
    // Try to select from audio_tasks
    const { data, error } = await supabase
      .from('audio_tasks')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      console.log('❌ Table does NOT exist\n');
      console.log('📝 Migration SQL is ready at: src/database/migration_audio_tasks.sql\n');
      console.log('⚡ QUICK SETUP - Copy and paste this into Supabase SQL Editor:\n');
      console.log('   https://supabase.com/dashboard/project/xcqjtdfvsgvugllxgzc/sql/new\n');
      console.log('='.repeat(70));

      // Read and print migration
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const migrationSQL = readFileSync(join(__dirname, 'src/database/migration_audio_tasks.sql'), 'utf-8');

      console.log(migrationSQL);
      console.log('='.repeat(70));

      return false;
    }

    if (error) {
      throw error;
    }

    console.log('✅ Table EXISTS!');
    console.log(`📊 Sample records: ${data?.length || 0}\n`);

    // Check if there are active tasks
    const { data: activeTasks } = await supabase
      .from('audio_tasks')
      .select('*')
      .in('status', ['waiting', 'processing'])
      .order('created_at', { ascending: false });

    if (activeTasks && activeTasks.length > 0) {
      console.log(`🔄 Active tasks: ${activeTasks.length}`);
      activeTasks.forEach((task, i) => {
        console.log(`   ${i + 1}. Task #${task.task_id} - ${task.status} (${task.character_count} chars)`);
      });
    } else {
      console.log('✅ No active tasks');
    }

    console.log('\n🎉 Ready for Realtime! Frontend can subscribe to updates.');

    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

checkAndMigrate();

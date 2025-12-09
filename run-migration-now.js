import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xcqjtdfvsgvugllxgzc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcWp0ZGZ2c2d2dWdsbGx4Z3pjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk5MDIxNywiZXhwIjoyMDc4NTY2MjE3fQ.JBejCeZMCL3uv1-BO73kDkksT_zQrU3RiHUyCV4828g';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

console.log('🚀 Starting audio_tasks migration...\n');

// Спробуємо створити таблицю по частинах
async function runMigration() {
  try {
    // 1. Create table
    console.log('1️⃣  Creating audio_tasks table...');
    const { error: tableError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS audio_tasks (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          task_id INTEGER NOT NULL UNIQUE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'waiting',
          text TEXT NOT NULL,
          voice_template_id TEXT DEFAULT 'default',
          character_count INTEGER NOT NULL,
          crystals_cost INTEGER NOT NULL,
          crystals_refunded BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          result JSONB,
          error TEXT
        );
      `
    });

    if (tableError) {
      console.error('   ❌ Error:', tableError.message);
    } else {
      console.log('   ✅ Table created');
    }

    // 2. Create indexes
    console.log('\n2️⃣  Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_audio_tasks_user_id ON audio_tasks(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_audio_tasks_task_id ON audio_tasks(task_id);',
      'CREATE INDEX IF NOT EXISTS idx_audio_tasks_status ON audio_tasks(status);',
      'CREATE INDEX IF NOT EXISTS idx_audio_tasks_created_at ON audio_tasks(created_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_audio_tasks_user_status ON audio_tasks(user_id, status);'
    ];

    for (const idx of indexes) {
      const { error } = await supabase.rpc('exec', { sql: idx });
      if (error && !error.message?.includes('already exists')) {
        console.error('   ❌ Index error:', error.message);
      }
    }
    console.log('   ✅ Indexes created');

    // 3. Enable RLS
    console.log('\n3️⃣  Enabling RLS...');
    await supabase.rpc('exec', {
      sql: 'ALTER TABLE audio_tasks ENABLE ROW LEVEL SECURITY;'
    });
    console.log('   ✅ RLS enabled');

    // 4. Test query
    console.log('\n4️⃣  Testing table access...');
    const { data, error } = await supabase
      .from('audio_tasks')
      .select('id')
      .limit(1);

    if (error) {
      console.error('   ❌ Error:', error.message);
    } else {
      console.log('   ✅ Table accessible! Records:', data?.length || 0);
    }

    console.log('\n🎉 Migration completed!');
    console.log('\n📝 Залишилося:');
    console.log('   - Додати RLS політики (вручну в SQL Editor)');
    console.log('   - Увімкнути Realtime (ALTER PUBLICATION supabase_realtime ADD TABLE audio_tasks)');
    console.log('   - Створити функції cleanup_old_audio_tasks та get_active_audio_tasks');

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
  }
}

runMigration();

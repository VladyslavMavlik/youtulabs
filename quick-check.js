import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xcqjtdfvsgvugllxgzc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcWp0ZGZ2c2d2dWdsbGx4Z3pjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk5MDIxNywiZXhwIjoyMDc4NTY2MjE3fQ.JBejCeZMCL3uv1-BO73kDkksT_zQrU3RiHUyCV4828g'
);

const { data, error } = await supabase.from('audio_tasks').select('*').limit(1);

if (error) {
  if (error.code === '42P01') {
    console.log('❌ Таблиця audio_tasks НЕ існує\n');
    console.log('📋 Скопіюй і виконай це в Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/xcqjtdfvsgvugllxgzc/sql/new\n');
    console.log('='.repeat(70));
    console.log(await import('fs').then(fs => fs.readFileSync('src/database/migration_audio_tasks.sql', 'utf8')));
  } else {
    console.log('❌ Помилка:', error.message);
  }
} else {
  console.log('✅ Таблиця audio_tasks вже ІСНУЄ!');
  console.log('📊 Записів:', data.length);
  console.log('\n🎉 Можемо продовжувати з Realtime інтеграцією!');
}

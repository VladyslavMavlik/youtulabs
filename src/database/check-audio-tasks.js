/**
 * Check if audio_tasks table exists in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTable() {
  console.log('🔍 Checking if audio_tasks table exists...\n');

  try {
    // Try to query the table
    const { data, error } = await supabase
      .from('audio_tasks')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') { // relation does not exist
        console.log('❌ Table audio_tasks does NOT exist');
        console.log('\n📝 Next steps:');
        console.log('   1. Run: node src/database/run-audio-tasks-migration.js');
        console.log('   OR');
        console.log('   2. Manually execute src/database/migration_audio_tasks.sql in Supabase SQL Editor');
        return false;
      }

      throw error;
    }

    console.log('✅ Table audio_tasks EXISTS');
    console.log(`📊 Current records: ${data?.length || 0}`);

    // Check Realtime
    const { data: realtimeData, error: realtimeError } = await supabase
      .rpc('exec_sql', {
        query: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'audio_tasks'`
      })
      .single();

    if (!realtimeError && realtimeData) {
      console.log('✅ Realtime is ENABLED for audio_tasks');
    } else {
      console.log('⚠️ Realtime might NOT be enabled');
      console.log('   Run this in SQL Editor:');
      console.log('   ALTER PUBLICATION supabase_realtime ADD TABLE audio_tasks;');
    }

    return true;
  } catch (error) {
    console.error('❌ Error checking table:', error.message);
    return false;
  }
}

checkTable();

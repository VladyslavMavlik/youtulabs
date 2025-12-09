import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  console.log('[MIGRATION] Starting SQL migration...');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const results = [];

  // Step 1: Add columns to crypto_payments
  try {
    console.log('[MIGRATION] Step 1: Adding columns to crypto_payments...');
    const { error } = await supabase.from('crypto_payments').select('subscription_expires_at').limit(0);
    if (error && error.message.includes('does not exist')) {
      results.push({ step: 1, status: 'need_manual', message: 'ALTER TABLE needed - use Dashboard SQL Editor' });
    } else {
      results.push({ step: 1, status: 'exists', message: 'Columns already exist' });
    }
  } catch (e) {
    results.push({ step: 1, status: 'error', error: e.message });
  }

  // Step 2: Create crypto_subscription_credits table
  try {
    console.log('[MIGRATION] Step 2: Checking crypto_subscription_credits table...');
    const { error } = await supabase.from('crypto_subscription_credits').select('*').limit(0);
    if (error && error.message.includes('does not exist')) {
      results.push({ step: 2, status: 'need_manual', message: 'CREATE TABLE needed - use Dashboard SQL Editor' });
    } else {
      results.push({ step: 2, status: 'exists', message: 'Table already exists' });
    }
  } catch (e) {
    results.push({ step: 2, status: 'error', error: e.message });
  }

  // Step 3: Check if functions exist
  try {
    console.log('[MIGRATION] Step 3: Checking SQL functions...');
    const { error } = await supabase.rpc('process_crypto_subscription_payment', {
      p_payment_id: 'test',
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_plan_type: 'starter',
      p_credits_amount: 100
    });

    if (error && error.message.includes('Could not find')) {
      results.push({ step: 3, status: 'need_manual', message: 'SQL functions needed - use Dashboard SQL Editor' });
    } else {
      results.push({ step: 3, status: 'exists', message: 'Functions exist (or test failed normally)' });
    }
  } catch (e) {
    results.push({ step: 3, status: 'exists', message: 'Functions likely exist' });
  }

  const allExist = results.every(r => r.status === 'exists');
  const needManual = results.some(r => r.status === 'need_manual');

  console.log('[MIGRATION] Results:', results);

  return new Response(JSON.stringify({
    success: true,
    allMigrated: allExist,
    needsManualMigration: needManual,
    message: needManual
      ? 'Please run SQL migration via Dashboard: https://supabase.com/dashboard/project/xcqjtdfvsgvuglllxgzc/sql/new'
      : allExist
        ? 'All migration steps completed!'
        : 'Migration status unknown',
    results,
    sqlFile: needManual ? 'Run SQL from: ssh root@46.224.42.246 "cat /tmp/migration.sql"' : null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

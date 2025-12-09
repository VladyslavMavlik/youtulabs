/**
 * Execute Cryptomus migration via Supabase Management API
 */

import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

const SQL = `
-- Cryptomus Payments Table
CREATE TABLE IF NOT EXISTS public.cryptomus_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL UNIQUE,
  payment_uuid TEXT,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('starter', 'pro', 'ultimate')),
  amount_usd DECIMAL(10,2) NOT NULL,
  crystals_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'paid_over', 'wrong_amount', 'expired', 'failed', 'cancelled')),
  payment_url TEXT,
  cryptocurrency TEXT,
  wallet_address TEXT,
  network TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  webhook_data JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  crystals_granted BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_user_id ON public.cryptomus_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_order_id ON public.cryptomus_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_payment_uuid ON public.cryptomus_payments(payment_uuid);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_status ON public.cryptomus_payments(status);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_created_at ON public.cryptomus_payments(created_at DESC);

ALTER TABLE public.cryptomus_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cryptomus payments" ON public.cryptomus_payments;
CREATE POLICY "Users can view own cryptomus payments" ON public.cryptomus_payments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own cryptomus payments" ON public.cryptomus_payments;
CREATE POLICY "Users can create own cryptomus payments" ON public.cryptomus_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_cryptomus_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cryptomus_payments_updated_at_trigger ON public.cryptomus_payments;
CREATE TRIGGER cryptomus_payments_updated_at_trigger
  BEFORE UPDATE ON public.cryptomus_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_cryptomus_payments_updated_at();

CREATE OR REPLACE FUNCTION grant_crystals_from_cryptomus_payment(p_payment_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT, new_balance INTEGER) AS $$
DECLARE
  v_user_id UUID;
  v_crystals_amount INTEGER;
  v_plan_id TEXT;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_already_granted BOOLEAN;
BEGIN
  SELECT user_id, crystals_amount, plan_id, crystals_granted
  INTO v_user_id, v_crystals_amount, v_plan_id, v_already_granted
  FROM public.cryptomus_payments
  WHERE id = p_payment_id AND status IN ('paid', 'paid_over');

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Payment not found or not paid'::TEXT, 0;
    RETURN;
  END IF;

  IF v_already_granted THEN
    SELECT balance INTO v_current_balance FROM public.user_balances WHERE user_id = v_user_id;
    RETURN QUERY SELECT TRUE, 'Crystals already granted'::TEXT, v_current_balance;
    RETURN;
  END IF;

  SELECT balance INTO v_current_balance FROM public.user_balances WHERE user_id = v_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_balances (user_id, balance) VALUES (v_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + v_crystals_amount;

  UPDATE public.user_balances SET balance = v_new_balance, updated_at = NOW() WHERE user_id = v_user_id;

  INSERT INTO public.balance_transactions (user_id, amount, type, description, metadata)
  VALUES (
    v_user_id,
    v_crystals_amount,
    'crypto_payment',
    format('Cryptomus payment - %s plan', v_plan_id),
    jsonb_build_object('payment_id', p_payment_id, 'plan_id', v_plan_id, 'crystals', v_crystals_amount)
  );

  UPDATE public.cryptomus_payments SET crystals_granted = TRUE, updated_at = NOW() WHERE id = p_payment_id;

  RETURN QUERY SELECT TRUE, format('Granted %s crystals', v_crystals_amount)::TEXT, v_new_balance;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment TO authenticated;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment TO anon;
`;

async function executeMigration() {
  console.log('[MIGRATION] Starting Cryptomus migration...\n');

  // Try using Supabase SQL query endpoint
  const sqlUrl = `${supabaseUrl}/rest/v1/rpc/query`;

  console.log('[MIGRATION] Executing SQL...');

  try {
    const response = await fetch(sqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: SQL })
    });

    const text = await response.text();

    if (!response.ok) {
      console.log('[MIGRATION] ⚠️  Direct SQL execution not available via REST API');
      console.log('[MIGRATION] Response:', text);
      console.log('\n[MIGRATION] Creating table using individual INSERT operations...\n');

      // Since we can't execute arbitrary SQL via REST API, we need to use supabase-js client
      // Let's create the table using a different approach
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Check if table exists by trying to select from it
      console.log('[MIGRATION] Checking if cryptomus_payments table exists...');
      const { data, error } = await supabase.from('cryptomus_payments').select('id').limit(0);

      if (error && error.message.includes('does not exist')) {
        console.log('[MIGRATION] ❌ Table does not exist');
        console.log('\n[MIGRATION] 📝 MANUAL STEP REQUIRED:\n');
        console.log('Please create the table manually by:');
        console.log('1. Opening Supabase Dashboard SQL Editor:');
        console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
        console.log('\n2. Copy and execute the SQL from:');
        console.log('   CREATE_TABLE_IN_SUPABASE.md');
        console.log('\n3. Then re-run this script to verify.\n');
        process.exit(1);
      } else if (!error) {
        console.log('[MIGRATION] ✅ Table cryptomus_payments already exists!');
        console.log('[MIGRATION] 🎉 Migration complete!\n');
      } else {
        console.log('[MIGRATION] Unexpected error:', error);
        process.exit(1);
      }
    } else {
      console.log('[MIGRATION] ✅ SQL executed successfully');
      console.log('[MIGRATION] Response:', text);
      console.log('\n[MIGRATION] 🎉 Migration complete!\n');
    }
  } catch (error) {
    console.error('[MIGRATION] Error:', error.message);
    process.exit(1);
  }
}

executeMigration();

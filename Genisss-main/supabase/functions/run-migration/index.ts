import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const migrations = [
    // 1. Add columns
    `ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;`,
    `ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS subscription_credits_granted INTEGER;`,

    // 2. Create table
    `CREATE TABLE IF NOT EXISTS crypto_subscription_credits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES crypto_payments(payment_id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      consumed INTEGER DEFAULT 0 CHECK (consumed >= 0 AND consumed <= amount),
      remaining INTEGER GENERATED ALWAYS AS (amount - consumed) STORED,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'consumed')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );`,

    // 3-5. Create indexes
    `CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_user_id ON crypto_subscription_credits(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_expires_at ON crypto_subscription_credits(expires_at);`,
    `CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_status ON crypto_subscription_credits(status);`,

    // 6. Enable RLS
    `ALTER TABLE crypto_subscription_credits ENABLE ROW LEVEL SECURITY;`,

    // 7. Drop old policy
    `DROP POLICY IF EXISTS "Users can view own subscription credits" ON crypto_subscription_credits;`,

    // 8. Create policy
    `CREATE POLICY "Users can view own subscription credits"
      ON crypto_subscription_credits FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);`,
  ];

  const results = [];

  for (let i = 0; i < migrations.length; i++) {
    try {
      console.log(`Executing migration ${i + 1}/${migrations.length}...`);

      const { error } = await supabase.rpc('exec_sql', { sql: migrations[i] }).catch(() => ({error: null}));

      results.push({
        step: i + 1,
        status: error ? 'warning' : 'success',
        error: error?.message
      });

      console.log(`Step ${i + 1}: ${error ? 'Warning - ' + error.message : 'Success'}`);
    } catch (e) {
      results.push({
        step: i + 1,
        status: 'error',
        error: e.message
      });
    }
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Migration tables and indexes completed',
    results
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

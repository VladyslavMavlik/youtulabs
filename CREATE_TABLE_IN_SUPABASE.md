# Створення таблиці cryptomus_payments в Supabase

## Інструкція:

1. Відкрий Supabase Dashboard SQL Editor:
   https://supabase.com/dashboard/project/xcqjtdfvsgvuglllxgzc/sql/new

2. Скопіюй і виконай SQL нижче:

```sql
-- Cryptomus Payments Table
CREATE TABLE IF NOT EXISTS public.cryptomus_payments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cryptomus identifiers
  order_id TEXT NOT NULL UNIQUE,
  payment_uuid TEXT,

  -- Plan details
  plan_id TEXT NOT NULL CHECK (plan_id IN ('starter', 'pro', 'ultimate')),
  amount_usd DECIMAL(10,2) NOT NULL,
  crystals_amount INTEGER NOT NULL,

  -- Payment status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'paid_over', 'wrong_amount', 'expired', 'failed', 'cancelled')),

  -- Cryptomus payment details
  payment_url TEXT,
  cryptocurrency TEXT,
  wallet_address TEXT,
  network TEXT,

  -- Timing
  expires_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,

  -- Additional data
  webhook_data JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Tracking
  crystals_granted BOOLEAN DEFAULT FALSE,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_user_id ON public.cryptomus_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_order_id ON public.cryptomus_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_payment_uuid ON public.cryptomus_payments(payment_uuid);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_status ON public.cryptomus_payments(status);
CREATE INDEX IF NOT EXISTS idx_cryptomus_payments_created_at ON public.cryptomus_payments(created_at DESC);

-- RLS
ALTER TABLE public.cryptomus_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cryptomus payments"
  ON public.cryptomus_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own cryptomus payments"
  ON public.cryptomus_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_cryptomus_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cryptomus_payments_updated_at_trigger
  BEFORE UPDATE ON public.cryptomus_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_cryptomus_payments_updated_at();

-- Grant crystals function
CREATE OR REPLACE FUNCTION grant_crystals_from_cryptomus_payment(p_payment_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  new_balance INTEGER
) AS $$
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

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cryptomus_payments;
```

3. Натисни "Run" або Ctrl+Enter

4. Якщо успішно - побачиш "Success. No rows returned"

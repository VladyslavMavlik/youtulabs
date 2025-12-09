-- =====================================================
-- CRYPTOMUS COMPLETE MIGRATION
-- =====================================================
-- Creates cryptomus_payments table and crypto_subscription_credits
-- with proper relationships and security

-- 1. Create cryptomus_payments table
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

DROP POLICY IF EXISTS "Users can view own cryptomus payments" ON public.cryptomus_payments;
CREATE POLICY "Users can view own cryptomus payments"
  ON public.cryptomus_payments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own cryptomus payments" ON public.cryptomus_payments;
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

DROP TRIGGER IF EXISTS cryptomus_payments_updated_at_trigger ON public.cryptomus_payments;
CREATE TRIGGER cryptomus_payments_updated_at_trigger
  BEFORE UPDATE ON public.cryptomus_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_cryptomus_payments_updated_at();

-- 2. Create cryptomus_subscription_credits table (for Cryptomus specifically)
CREATE TABLE IF NOT EXISTS public.cryptomus_subscription_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Reference to cryptomus_payments order_id (TEXT, not UUID)
  payment_id TEXT NOT NULL,

  plan_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  consumed INTEGER DEFAULT 0 CHECK (consumed >= 0 AND consumed <= amount),
  remaining INTEGER GENERATED ALWAYS AS (amount - consumed) STORED,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'consumed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cryptomus_sub_credits_user_id ON public.cryptomus_subscription_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_sub_credits_payment_id ON public.cryptomus_subscription_credits(payment_id);
CREATE INDEX IF NOT EXISTS idx_cryptomus_sub_credits_expires_at ON public.cryptomus_subscription_credits(expires_at);
CREATE INDEX IF NOT EXISTS idx_cryptomus_sub_credits_status ON public.cryptomus_subscription_credits(status);

ALTER TABLE public.cryptomus_subscription_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cryptomus subscription credits" ON public.cryptomus_subscription_credits;
CREATE POLICY "Users can view own cryptomus subscription credits"
  ON public.cryptomus_subscription_credits FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Grant credits function for Cryptomus
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
  v_order_id TEXT;
  v_already_granted BOOLEAN;
  v_payment_status TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_total_balance INTEGER;
BEGIN
  -- CRITICAL: Lock payment row to prevent race conditions
  SELECT
    user_id,
    crystals_amount,
    plan_id,
    order_id,
    crystals_granted,
    status
  INTO
    v_user_id,
    v_crystals_amount,
    v_plan_id,
    v_order_id,
    v_already_granted,
    v_payment_status
  FROM public.cryptomus_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Payment not found'::TEXT, 0;
    RETURN;
  END IF;

  -- CRITICAL: Only allow 'paid' status
  IF v_payment_status != 'paid' THEN
    RETURN QUERY SELECT
      FALSE,
      format('Invalid payment status: %s. Only "paid" status is allowed.', v_payment_status)::TEXT,
      0;
    RETURN;
  END IF;

  -- Check if already granted
  IF v_already_granted THEN
    SELECT COALESCE(SUM(remaining), 0) INTO v_total_balance
    FROM public.cryptomus_subscription_credits
    WHERE user_id = v_user_id AND status = 'active';

    RETURN QUERY SELECT
      TRUE,
      'Subscription credits already granted'::TEXT,
      v_total_balance;
    RETURN;
  END IF;

  -- Calculate expiration (30 days)
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Create subscription credits
  INSERT INTO public.cryptomus_subscription_credits (
    user_id,
    payment_id,
    plan_type,
    amount,
    consumed,
    remaining,
    expires_at,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_order_id,
    v_plan_id,
    v_crystals_amount,
    0,
    v_crystals_amount,
    v_expires_at,
    'active',
    NOW(),
    NOW()
  );

  -- Mark as granted
  UPDATE public.cryptomus_payments
  SET
    crystals_granted = TRUE,
    updated_at = NOW()
  WHERE id = p_payment_id;

  -- Calculate total balance
  SELECT COALESCE(SUM(remaining), 0) INTO v_total_balance
  FROM public.cryptomus_subscription_credits
  WHERE user_id = v_user_id AND status = 'active';

  RETURN QUERY SELECT
    TRUE,
    format('Granted %s subscription credits (expires in 30 days)', v_crystals_amount)::TEXT,
    v_total_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO anon;

COMMENT ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) IS
'Grants subscription credits from Cryptomus payment. Credits expire in 30 days.
SECURITY: Only accepts "paid" status. Uses row locking to prevent race conditions.';

-- Realtime (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.cryptomus_payments;

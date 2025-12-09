-- Crypto Payments Table for Cryptomus Integration
-- Stores all cryptocurrency payment transactions and their statuses
--
-- Flow:
-- 1. User selects plan (starter/pro/ultimate)
-- 2. Create payment record with status='pending'
-- 3. Call Cryptomus API to create invoice
-- 4. Update with payment_url and wallet_address
-- 5. User pays
-- 6. Webhook updates status to 'paid'
-- 7. Grant crystals to user
--
-- Plans:
-- - starter: $10 USD = 2000 crystals
-- - pro: $25 USD = 6000 crystals
-- - ultimate: $75 USD = 20000 crystals

-- Create crypto_payments table
CREATE TABLE IF NOT EXISTS public.crypto_payments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cryptomus identifiers
  order_id TEXT NOT NULL UNIQUE, -- Our unique order ID
  payment_uuid TEXT, -- Cryptomus payment UUID

  -- Plan details
  plan_id TEXT NOT NULL CHECK (plan_id IN ('starter', 'pro', 'ultimate')),
  amount_usd DECIMAL(10,2) NOT NULL,
  crystals_amount INTEGER NOT NULL,

  -- Payment status
  -- pending: Payment created, waiting for payment
  -- paid: Payment received successfully
  -- paid_over: Payment received with overpayment
  -- wrong_amount: Payment received with wrong amount
  -- expired: Payment invoice expired
  -- failed: Payment failed
  -- cancelled: User cancelled payment
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'paid_over', 'wrong_amount', 'expired', 'failed', 'cancelled')),

  -- Cryptomus payment details
  payment_url TEXT, -- URL to payment page
  cryptocurrency TEXT, -- Selected crypto (BTC, ETH, USDT, etc.)
  wallet_address TEXT, -- Crypto wallet address for payment
  network TEXT, -- Blockchain network (bitcoin, ethereum, tron, etc.)

  -- Timing
  expires_at TIMESTAMP WITH TIME ZONE, -- When invoice expires
  paid_at TIMESTAMP WITH TIME ZONE, -- When payment was confirmed

  -- Additional data
  webhook_data JSONB, -- Full webhook payload for debugging
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata

  -- Tracking
  crystals_granted BOOLEAN DEFAULT FALSE, -- Whether crystals were granted
  error_message TEXT, -- Error details if payment failed

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_crypto_payments_user_id ON public.crypto_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_order_id ON public.crypto_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_payment_uuid ON public.crypto_payments(payment_uuid);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_status ON public.crypto_payments(status);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_created_at ON public.crypto_payments(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own payments
CREATE POLICY "Users can view own crypto payments"
  ON public.crypto_payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own payments (handled by backend, but allow for testing)
CREATE POLICY "Users can create own crypto payments"
  ON public.crypto_payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role can update payments (webhooks)
-- This will be handled by backend with service role key

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_crypto_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER crypto_payments_updated_at_trigger
  BEFORE UPDATE ON public.crypto_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_crypto_payments_updated_at();

-- Function to grant crystals after successful payment
CREATE OR REPLACE FUNCTION grant_crystals_from_crypto_payment(p_payment_id UUID)
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
  -- Get payment details
  SELECT user_id, crystals_amount, plan_id, crystals_granted
  INTO v_user_id, v_crystals_amount, v_plan_id, v_already_granted
  FROM public.crypto_payments
  WHERE id = p_payment_id AND status = 'paid';

  -- Check if payment exists and is paid
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Payment not found or not paid'::TEXT, 0;
    RETURN;
  END IF;

  -- Check if crystals already granted (idempotency)
  IF v_already_granted THEN
    SELECT balance INTO v_current_balance
    FROM public.user_balances
    WHERE user_id = v_user_id;

    RETURN QUERY SELECT TRUE, 'Crystals already granted'::TEXT, v_current_balance;
    RETURN;
  END IF;

  -- Lock user balance row
  SELECT balance INTO v_current_balance
  FROM public.user_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- If user balance doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO public.user_balances (user_id, balance)
    VALUES (v_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    v_current_balance := 0;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance + v_crystals_amount;

  -- Update user balance
  UPDATE public.user_balances
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Create balance transaction record
  INSERT INTO public.balance_transactions (user_id, amount, type, description, metadata)
  VALUES (
    v_user_id,
    v_crystals_amount,
    'crypto_payment',
    format('Crypto payment - %s plan', v_plan_id),
    jsonb_build_object(
      'payment_id', p_payment_id,
      'plan_id', v_plan_id,
      'crystals', v_crystals_amount,
      'timestamp', NOW()
    )
  );

  -- Mark crystals as granted
  UPDATE public.crypto_payments
  SET crystals_granted = TRUE,
      updated_at = NOW()
  WHERE id = p_payment_id;

  -- Return success
  RETURN QUERY SELECT TRUE, format('Granted %s crystals', v_crystals_amount)::TEXT, v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION grant_crystals_from_crypto_payment TO authenticated;
GRANT EXECUTE ON FUNCTION grant_crystals_from_crypto_payment TO anon;

-- Enable realtime for crypto_payments (so frontend can listen to status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.crypto_payments;

-- Comments for documentation
COMMENT ON TABLE public.crypto_payments IS 'Cryptocurrency payments via Cryptomus API';
COMMENT ON COLUMN public.crypto_payments.order_id IS 'Unique order identifier for Cryptomus';
COMMENT ON COLUMN public.crypto_payments.payment_uuid IS 'Payment UUID from Cryptomus response';
COMMENT ON COLUMN public.crypto_payments.plan_id IS 'Subscription plan: starter/pro/ultimate';
COMMENT ON COLUMN public.crypto_payments.crystals_amount IS 'Amount of crystals to grant (2000/6000/20000)';
COMMENT ON COLUMN public.crypto_payments.status IS 'Payment status from Cryptomus webhook';
COMMENT ON COLUMN public.crypto_payments.crystals_granted IS 'Whether crystals were granted to user';

-- =====================================================
-- CRYPTOMUS SUBSCRIPTION PAYMENTS - FINAL MIGRATION
-- =====================================================
-- This migration creates the complete Cryptomus payment system
-- with 30-day expiring subscription credits

-- Function to grant subscription credits from Cryptomus payment
-- Creates crypto_subscription_credits with 30 days expiration
-- CRITICAL: Only accepts 'paid' status, rejects partial/wrong amounts
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
  -- FOR UPDATE ensures no other transaction can modify this row
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
  FOR UPDATE; -- ROW LOCK - prevents duplicate processing

  -- Check if payment exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Payment not found'::TEXT, 0;
    RETURN;
  END IF;

  -- CRITICAL: Only allow 'paid' status, reject partial/wrong amounts/failed
  IF v_payment_status != 'paid' THEN
    RETURN QUERY SELECT
      FALSE,
      format('Invalid payment status: %s. Only "paid" status is allowed.', v_payment_status)::TEXT,
      0;
    RETURN;
  END IF;

  -- Check if crystals already granted (idempotency protection)
  IF v_already_granted THEN
    -- Get current total balance
    SELECT COALESCE(SUM(remaining), 0) INTO v_total_balance
    FROM public.crypto_subscription_credits
    WHERE user_id = v_user_id AND status = 'active';

    RETURN QUERY SELECT
      TRUE,
      'Subscription credits already granted'::TEXT,
      v_total_balance;
    RETURN;
  END IF;

  -- Calculate expiration date (30 days from now)
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Create subscription credits record (expires in 30 days)
  INSERT INTO public.crypto_subscription_credits (
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
    0, -- consumed
    v_crystals_amount, -- remaining
    v_expires_at,
    'active',
    NOW(),
    NOW()
  );

  -- Mark crystals as granted in payment record
  UPDATE public.cryptomus_payments
  SET
    crystals_granted = TRUE,
    updated_at = NOW()
  WHERE id = p_payment_id;

  -- Calculate new total balance
  SELECT COALESCE(SUM(remaining), 0) INTO v_total_balance
  FROM public.crypto_subscription_credits
  WHERE user_id = v_user_id AND status = 'active';

  -- Log success
  RAISE NOTICE 'Subscription credits granted: user_id=%, plan=%, credits=%, expires=%, total_balance=%',
    v_user_id, v_plan_id, v_crystals_amount, v_expires_at, v_total_balance;

  -- Return success
  RETURN QUERY SELECT
    TRUE,
    format('Granted %s subscription credits (expires in 30 days)', v_crystals_amount)::TEXT,
    v_total_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) TO anon;

-- Add helpful comment
COMMENT ON FUNCTION grant_crystals_from_cryptomus_payment(UUID) IS
'Grants subscription credits from Cryptomus payment. Credits expire in 30 days.
SECURITY: Only accepts "paid" status - rejects partial payments, wrong amounts, and failed transactions.
Returns success status, message, and new total balance.';

-- =====================================================
-- VERIFICATION QUERIES (run these to test)
-- =====================================================

-- Check if function exists and signature is correct:
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'grant_crystals_from_cryptomus_payment';

-- Test function with fake payment ID (should return "Payment not found"):
-- SELECT * FROM grant_crystals_from_cryptomus_payment('00000000-0000-0000-0000-000000000000');

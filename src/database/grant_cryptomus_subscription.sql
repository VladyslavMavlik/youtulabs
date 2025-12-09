-- Function to grant subscription credits from Cryptomus payment
-- Creates crypto_subscription_credits with 30 days expiration
-- Only subscription credits expire, not regular credit purchases

CREATE OR REPLACE FUNCTION grant_crystals_from_cryptomus_payment(p_payment_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  credits_granted INTEGER,
  expires_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_user_id UUID;
  v_crystals_amount INTEGER;
  v_plan_id TEXT;
  v_order_id TEXT;
  v_already_granted BOOLEAN;
  v_payment_status TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get payment details
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
  WHERE id = p_payment_id;

  -- Check if payment exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Payment not found'::TEXT, 0, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- CRITICAL: Only allow 'paid' status, reject partial/wrong amounts
  IF v_payment_status != 'paid' THEN
    RETURN QUERY SELECT
      FALSE,
      format('Invalid payment status: %s. Only "paid" status is allowed.', v_payment_status)::TEXT,
      0,
      NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- Check if crystals already granted (idempotency)
  IF v_already_granted THEN
    -- Get existing subscription credits
    SELECT expires_at INTO v_expires_at
    FROM public.crypto_subscription_credits
    WHERE payment_id = v_order_id
    LIMIT 1;

    RETURN QUERY SELECT
      TRUE,
      'Subscription credits already granted'::TEXT,
      v_crystals_amount,
      v_expires_at;
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
    status
  ) VALUES (
    v_user_id,
    v_order_id,
    v_plan_id,
    v_crystals_amount,
    0,
    v_crystals_amount,
    v_expires_at,
    'active'
  );

  -- Mark crystals as granted in payment record
  UPDATE public.cryptomus_payments
  SET
    crystals_granted = TRUE,
    updated_at = NOW()
  WHERE id = p_payment_id;

  -- Log success
  RAISE NOTICE 'Subscription credits granted: user_id=%, plan=%, credits=%, expires=%',
    v_user_id, v_plan_id, v_crystals_amount, v_expires_at;

  -- Return success
  RETURN QUERY SELECT
    TRUE,
    format('Granted %s subscription credits (expires in 30 days)', v_crystals_amount)::TEXT,
    v_crystals_amount,
    v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment TO authenticated;
GRANT EXECUTE ON FUNCTION grant_crystals_from_cryptomus_payment TO service_role;

-- Comment
COMMENT ON FUNCTION grant_crystals_from_cryptomus_payment IS
'Grants subscription credits from Cryptomus payment. Credits expire in 30 days. Only accepts "paid" status.';

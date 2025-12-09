-- Fix: payment_success should only grant credits for RENEWALS, not initial payment
-- subscription_created handles initial credits

CREATE OR REPLACE FUNCTION process_lemonsqueezy_payment_success(
  p_event_id TEXT,
  p_subscription_id TEXT,
  p_raw_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
  v_balance_before INTEGER;
  v_balance_result JSONB;
  v_is_first_payment BOOLEAN;
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get subscription details
  SELECT * INTO v_sub
  FROM lemonsqueezy_subscriptions
  WHERE subscription_id = p_subscription_id;

  IF NOT FOUND THEN
    -- Subscription not found - this might be the first payment arriving before subscription_created
    -- Just acknowledge and let subscription_created handle it
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'Subscription not found yet, subscription_created will handle credits',
      'subscription_id', p_subscription_id
    );
  END IF;

  -- Check if this is the first payment (subscription just created)
  -- If total_credits_granted equals credits_per_period, it's the first payment - already granted by subscription_created
  v_is_first_payment := (v_sub.total_credits_granted = v_sub.credits_per_period);

  IF v_is_first_payment THEN
    -- First payment - credits already granted by subscription_created, skip
    -- Mark webhook as processed
    UPDATE lemonsqueezy_webhook_events
    SET processed = true, processed_at = NOW()
    WHERE event_id = p_event_id;

    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'First payment - credits already granted by subscription_created',
      'subscription_id', p_subscription_id
    );
  END IF;

  -- Only process if subscription is active (this is a renewal)
  IF v_sub.status NOT IN ('active', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not active',
      'status', v_sub.status
    );
  END IF;

  -- Get current balance
  v_balance_before := COALESCE(get_user_active_balance(v_sub.user_id), 0);

  -- Use add_balance_atomic for renewal credits
  v_balance_result := add_balance_atomic(
    v_sub.user_id,
    v_sub.credits_per_period,
    'subscription',
    'LemonSqueezy ' || v_sub.plan_type || ' renewal - ' || v_sub.credits_per_period || ' crystals',
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'plan_type', v_sub.plan_type,
      'is_renewal', true
    )
  );

  -- Check if add_balance succeeded
  IF NOT (v_balance_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to add renewal credits',
      'details', v_balance_result
    );
  END IF;

  -- Update subscription tracking
  UPDATE lemonsqueezy_subscriptions
  SET
    last_credits_granted_at = NOW(),
    total_credits_granted = total_credits_granted + credits_per_period,
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = true, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'credits_granted', v_sub.credits_per_period,
    'balance_before', v_balance_before,
    'balance_after', (v_balance_result->>'newBalance')::INTEGER,
    'is_renewal', true
  );
END;
$$;

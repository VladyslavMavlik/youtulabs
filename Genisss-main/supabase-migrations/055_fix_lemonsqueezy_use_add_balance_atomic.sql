-- Fix LemonSqueezy functions to use add_balance_atomic instead of update_user_balance
-- add_balance_atomic properly handles user_credits table

-- First, update get_lemonsqueezy_plan_info with test mode IDs
CREATE OR REPLACE FUNCTION get_lemonsqueezy_plan_info(p_variant_id TEXT)
RETURNS TABLE(plan_type TEXT, credits INTEGER, price_usd DECIMAL)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 'starter'::TEXT
      WHEN '720649' THEN 'pro'::TEXT
      WHEN '720658' THEN 'ultimate'::TEXT
      -- Test Mode
      WHEN '1134259' THEN 'starter'::TEXT
      WHEN '1134267' THEN 'pro'::TEXT
      WHEN '1134281' THEN 'ultimate'::TEXT
      ELSE 'unknown'::TEXT
    END,
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 2000
      WHEN '720649' THEN 6000
      WHEN '720658' THEN 20000
      -- Test Mode
      WHEN '1134259' THEN 2000
      WHEN '1134267' THEN 6000
      WHEN '1134281' THEN 20000
      ELSE 0
    END,
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 8.00::DECIMAL
      WHEN '720649' THEN 19.99::DECIMAL
      WHEN '720658' THEN 49.99::DECIMAL
      -- Test Mode
      WHEN '1134259' THEN 8.00::DECIMAL
      WHEN '1134267' THEN 19.99::DECIMAL
      WHEN '1134281' THEN 49.99::DECIMAL
      ELSE 0.00::DECIMAL
    END;
END;
$$;

-- Fix process_lemonsqueezy_subscription_created to use add_balance_atomic
CREATE OR REPLACE FUNCTION process_lemonsqueezy_subscription_created(
  p_event_id TEXT,
  p_subscription_id TEXT,
  p_user_id UUID,
  p_variant_id TEXT,
  p_order_id TEXT DEFAULT NULL,
  p_customer_id TEXT DEFAULT NULL,
  p_product_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_renews_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_card_brand TEXT DEFAULT NULL,
  p_card_last_four TEXT DEFAULT NULL,
  p_raw_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_type TEXT;
  v_credits INTEGER;
  v_price_usd DECIMAL;
  v_sub_id UUID;
  v_balance_before INTEGER;
  v_balance_result JSONB;
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get plan info from variant_id
  SELECT pi.plan_type, pi.credits, pi.price_usd
  INTO v_plan_type, v_credits, v_price_usd
  FROM get_lemonsqueezy_plan_info(p_variant_id) pi;

  IF v_plan_type = 'unknown' OR v_credits = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unknown variant_id',
      'variant_id', p_variant_id
    );
  END IF;

  -- Create subscription record
  INSERT INTO lemonsqueezy_subscriptions (
    subscription_id,
    order_id,
    customer_id,
    product_id,
    variant_id,
    user_id,
    plan_type,
    price_usd,
    status,
    renews_at,
    ends_at,
    current_period_start,
    current_period_end,
    credits_per_period,
    last_credits_granted_at,
    total_credits_granted,
    card_brand,
    card_last_four,
    lemonsqueezy_data
  )
  VALUES (
    p_subscription_id,
    p_order_id,
    p_customer_id,
    p_product_id,
    p_variant_id,
    p_user_id,
    v_plan_type,
    v_price_usd,
    p_status,
    p_renews_at,
    p_ends_at,
    p_current_period_start,
    p_current_period_end,
    v_credits,
    NOW(),
    v_credits,
    p_card_brand,
    p_card_last_four,
    p_raw_data
  )
  ON CONFLICT (subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    renews_at = EXCLUDED.renews_at,
    ends_at = EXCLUDED.ends_at,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    lemonsqueezy_data = EXCLUDED.lemonsqueezy_data,
    updated_at = NOW()
  RETURNING id INTO v_sub_id;

  -- Get current balance before update
  v_balance_before := COALESCE(get_user_active_balance(p_user_id), 0);

  -- Use add_balance_atomic function to add credits properly
  v_balance_result := add_balance_atomic(
    p_user_id,
    v_credits,
    'subscription',
    'LemonSqueezy ' || v_plan_type || ' subscription - ' || v_credits || ' crystals',
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'plan_type', v_plan_type,
      'variant_id', p_variant_id,
      'price_usd', v_price_usd
    )
  );

  -- Check if add_balance succeeded
  IF NOT (v_balance_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to add credits',
      'details', v_balance_result
    );
  END IF;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = true, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'plan_type', v_plan_type,
    'credits_granted', v_credits,
    'balance_before', v_balance_before,
    'balance_after', (v_balance_result->>'newBalance')::INTEGER
  );
END;
$$;

-- Fix process_lemonsqueezy_payment_success for renewals
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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found',
      'subscription_id', p_subscription_id
    );
  END IF;

  -- Only process if subscription is active
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

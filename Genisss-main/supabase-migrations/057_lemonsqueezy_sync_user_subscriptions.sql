-- Sync LemonSqueezy subscriptions to user_subscriptions table for frontend display
-- Frontend reads from user_subscriptions, so we need to keep it in sync

-- Drop ALL existing versions of these functions to avoid conflicts
DO $$
DECLARE
  func_oid oid;
BEGIN
  -- Drop all versions of process_lemonsqueezy_subscription_updated
  FOR func_oid IN
    SELECT oid FROM pg_proc WHERE proname = 'process_lemonsqueezy_subscription_updated'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_oid::regprocedure || ' CASCADE';
  END LOOP;

  -- Drop all versions of process_lemonsqueezy_subscription_created
  FOR func_oid IN
    SELECT oid FROM pg_proc WHERE proname = 'process_lemonsqueezy_subscription_created'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- Update process_lemonsqueezy_subscription_created to also update user_subscriptions
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

  -- Create subscription record in lemonsqueezy_subscriptions
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

  -- *** SYNC TO user_subscriptions FOR FRONTEND ***
  INSERT INTO user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (
    p_user_id,
    v_plan_type,
    CASE WHEN p_status = 'active' THEN 'active' ELSE 'paused' END,
    COALESCE(p_current_period_start, NOW()),
    p_current_period_end
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at,
    updated_at = NOW();

  -- Log to subscription_history
  INSERT INTO subscription_history (user_id, plan_id, action, metadata)
  VALUES (
    p_user_id,
    v_plan_type,
    'created',
    jsonb_build_object(
      'source', 'lemonsqueezy',
      'subscription_id', p_subscription_id,
      'variant_id', p_variant_id
    )
  );

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
    'balance_after', (v_balance_result->>'newBalance')::INTEGER,
    'synced_to_user_subscriptions', true
  );
END;
$$;

-- Update process_lemonsqueezy_subscription_updated to sync status changes
CREATE OR REPLACE FUNCTION process_lemonsqueezy_subscription_updated(
  p_event_id TEXT,
  p_subscription_id TEXT,
  p_status TEXT,
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
  v_sub RECORD;
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get existing subscription
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

  -- Update lemonsqueezy_subscriptions
  UPDATE lemonsqueezy_subscriptions
  SET
    status = p_status,
    renews_at = COALESCE(p_renews_at, renews_at),
    ends_at = COALESCE(p_ends_at, ends_at),
    current_period_start = COALESCE(p_current_period_start, current_period_start),
    current_period_end = COALESCE(p_current_period_end, current_period_end),
    card_brand = COALESCE(p_card_brand, card_brand),
    card_last_four = COALESCE(p_card_last_four, card_last_four),
    lemonsqueezy_data = p_raw_data,
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- *** SYNC STATUS TO user_subscriptions ***
  UPDATE user_subscriptions
  SET
    status = CASE
      WHEN p_status = 'active' THEN 'active'
      WHEN p_status = 'cancelled' THEN 'cancelled'
      WHEN p_status = 'expired' THEN 'expired'
      WHEN p_status = 'paused' THEN 'paused'
      ELSE 'active'
    END,
    expires_at = COALESCE(p_current_period_end, expires_at),
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = true, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'new_status', p_status,
    'synced_to_user_subscriptions', true
  );
END;
$$;

-- Also sync existing LemonSqueezy subscriptions to user_subscriptions (one-time migration)
-- Use DISTINCT ON to get only the most recent subscription per user
INSERT INTO user_subscriptions (user_id, plan_id, status, started_at, expires_at)
SELECT
  ls.user_id,
  ls.plan_type,
  CASE WHEN ls.status = 'active' THEN 'active' ELSE 'paused' END,
  COALESCE(ls.current_period_start, ls.created_at),
  ls.current_period_end
FROM (
  SELECT DISTINCT ON (user_id) *
  FROM lemonsqueezy_subscriptions
  WHERE status IN ('active', 'past_due')
  ORDER BY user_id, created_at DESC
) ls
ON CONFLICT (user_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();

COMMENT ON FUNCTION process_lemonsqueezy_subscription_created IS 'Process subscription_created webhook and sync to user_subscriptions';
COMMENT ON FUNCTION process_lemonsqueezy_subscription_updated IS 'Process subscription_updated webhook and sync status to user_subscriptions';

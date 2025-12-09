-- ============================================================================
-- LemonSqueezy Payment System for Subscriptions
-- ============================================================================
-- Features:
-- 1. Recurring subscriptions (monthly) with auto-renewal
-- 2. Webhook idempotency protection
-- 3. Subscription status tracking (active, cancelled, expired, past_due)
-- 4. Crystal credits granted on subscription creation/renewal
-- 5. Integration with existing user_balances and user_subscriptions
-- ============================================================================

-- Drop existing tables if needed (for clean re-run)
DROP TABLE IF EXISTS lemonsqueezy_webhook_events CASCADE;
DROP TABLE IF EXISTS lemonsqueezy_subscriptions CASCADE;

-- ============================================================================
-- Table: LemonSqueezy Subscriptions
-- ============================================================================
CREATE TABLE lemonsqueezy_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- LemonSqueezy identifiers
  subscription_id TEXT NOT NULL UNIQUE, -- LemonSqueezy subscription ID
  order_id TEXT,                        -- LemonSqueezy order ID
  customer_id TEXT,                     -- LemonSqueezy customer ID
  product_id TEXT,                      -- LemonSqueezy product ID
  variant_id TEXT NOT NULL,             -- LemonSqueezy variant ID (plan identifier)

  -- User association
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plan info (derived from variant_id)
  plan_type TEXT NOT NULL CHECK (plan_type IN ('starter', 'pro', 'ultimate')),

  -- Financial info
  price_usd DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Subscription status from LemonSqueezy
  -- on_trial, active, paused, past_due, unpaid, cancelled, expired
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'on_trial',
    'active',
    'paused',
    'past_due',
    'unpaid',
    'cancelled',
    'expired'
  )),

  -- Dates
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,  -- When subscription renews
  renews_at TIMESTAMP WITH TIME ZONE,           -- Next renewal date
  ends_at TIMESTAMP WITH TIME ZONE,             -- When cancelled, final date
  cancelled_at TIMESTAMP WITH TIME ZONE,

  -- Trial info (if applicable)
  trial_ends_at TIMESTAMP WITH TIME ZONE,

  -- Pause info
  pause_mode TEXT,  -- 'void' or 'free'
  resumes_at TIMESTAMP WITH TIME ZONE,

  -- Credits tracking
  credits_per_period INTEGER NOT NULL,          -- How many crystals per billing period
  last_credits_granted_at TIMESTAMP WITH TIME ZONE,
  total_credits_granted INTEGER DEFAULT 0,

  -- Card info (masked)
  card_brand TEXT,
  card_last_four TEXT,

  -- Raw LemonSqueezy data
  lemonsqueezy_data JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ls_subs_user_id ON lemonsqueezy_subscriptions(user_id);
CREATE INDEX idx_ls_subs_subscription_id ON lemonsqueezy_subscriptions(subscription_id);
CREATE INDEX idx_ls_subs_variant_id ON lemonsqueezy_subscriptions(variant_id);
CREATE INDEX idx_ls_subs_status ON lemonsqueezy_subscriptions(status);
CREATE INDEX idx_ls_subs_renews_at ON lemonsqueezy_subscriptions(renews_at);

-- RLS
ALTER TABLE lemonsqueezy_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own lemonsqueezy subscriptions" ON lemonsqueezy_subscriptions;
CREATE POLICY "Users can view own lemonsqueezy subscriptions"
  ON lemonsqueezy_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- Table: LemonSqueezy Webhook Events (for idempotency)
-- ============================================================================
CREATE TABLE lemonsqueezy_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_id TEXT NOT NULL UNIQUE,  -- From X-Event-ID header or generated
  event_name TEXT NOT NULL,       -- subscription_created, subscription_updated, etc.

  -- Associated subscription
  subscription_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  -- Raw payload for debugging
  payload JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ls_webhooks_event_id ON lemonsqueezy_webhook_events(event_id);
CREATE INDEX idx_ls_webhooks_subscription_id ON lemonsqueezy_webhook_events(subscription_id);
CREATE INDEX idx_ls_webhooks_processed ON lemonsqueezy_webhook_events(processed);
CREATE INDEX idx_ls_webhooks_created_at ON lemonsqueezy_webhook_events(created_at DESC);

-- RLS (webhooks are internal, no user access)
ALTER TABLE lemonsqueezy_webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper: Map variant_id to plan_type and credits
-- ============================================================================
CREATE OR REPLACE FUNCTION get_lemonsqueezy_plan_info(p_variant_id TEXT)
RETURNS TABLE(plan_type TEXT, credits INTEGER, price_usd DECIMAL)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Variant IDs from LemonSqueezy:
  -- Starter Plan: 720643 -> 2000 crystals, $8
  -- Pro Plan: 720649 -> 6000 crystals, $19.99
  -- Ultimate Plan: 720658 -> 20000 crystals, $49.99

  RETURN QUERY
  SELECT
    CASE p_variant_id
      WHEN '720643' THEN 'starter'::TEXT
      WHEN '720649' THEN 'pro'::TEXT
      WHEN '720658' THEN 'ultimate'::TEXT
      ELSE 'unknown'::TEXT
    END,
    CASE p_variant_id
      WHEN '720643' THEN 2000
      WHEN '720649' THEN 6000
      WHEN '720658' THEN 20000
      ELSE 0
    END,
    CASE p_variant_id
      WHEN '720643' THEN 8.00::DECIMAL
      WHEN '720649' THEN 19.99::DECIMAL
      WHEN '720658' THEN 49.99::DECIMAL
      ELSE 0.00::DECIMAL
    END;
END;
$$;

-- ============================================================================
-- Function: Check webhook idempotency
-- ============================================================================
CREATE OR REPLACE FUNCTION check_lemonsqueezy_webhook_idempotency(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Returns TRUE if this event has already been processed
  RETURN EXISTS (
    SELECT 1 FROM lemonsqueezy_webhook_events
    WHERE event_id = p_event_id AND processed = TRUE
  );
END;
$$;

-- ============================================================================
-- Function: Record webhook event (before processing)
-- ============================================================================
CREATE OR REPLACE FUNCTION record_lemonsqueezy_webhook(
  p_event_id TEXT,
  p_event_name TEXT,
  p_subscription_id TEXT,
  p_user_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_id UUID;
BEGIN
  INSERT INTO lemonsqueezy_webhook_events (
    event_id,
    event_name,
    subscription_id,
    user_id,
    payload
  )
  VALUES (
    p_event_id,
    p_event_name,
    p_subscription_id,
    p_user_id,
    p_payload
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_webhook_id;

  RETURN v_webhook_id;
END;
$$;

-- ============================================================================
-- Function: Process subscription_created event
-- ============================================================================
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
  v_balance_after INTEGER;
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
    card_brand = EXCLUDED.card_brand,
    card_last_four = EXCLUDED.card_last_four,
    lemonsqueezy_data = EXCLUDED.lemonsqueezy_data,
    updated_at = NOW()
  RETURNING id INTO v_sub_id;

  -- Get current balance
  SELECT COALESCE(balance, 0) INTO v_balance_before
  FROM user_balances WHERE user_id = p_user_id;

  IF v_balance_before IS NULL THEN
    v_balance_before := 0;
  END IF;

  -- Add credits to user balance
  INSERT INTO user_balances (user_id, balance)
  VALUES (p_user_id, v_credits)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = user_balances.balance + v_credits,
    updated_at = NOW();

  v_balance_after := v_balance_before + v_credits;

  -- Record transaction
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  )
  VALUES (
    p_user_id,
    v_credits,
    'subscription',
    format('LemonSqueezy subscription: %s plan', v_plan_type),
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'variant_id', p_variant_id,
      'plan_type', v_plan_type,
      'payment_method', 'lemonsqueezy',
      'event_id', p_event_id
    )
  );

  -- Update user_subscriptions table
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    expires_at
  )
  VALUES (
    p_user_id,
    v_plan_type,
    'active',
    COALESCE(p_current_period_start, NOW()),
    COALESCE(p_renews_at, p_current_period_end, NOW() + INTERVAL '30 days')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = v_plan_type,
    status = 'active',
    started_at = COALESCE(p_current_period_start, NOW()),
    expires_at = COALESCE(p_renews_at, p_current_period_end, NOW() + INTERVAL '30 days'),
    updated_at = NOW();

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', p_user_id,
    'plan_type', v_plan_type,
    'credits_granted', v_credits,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
END;
$$;

-- ============================================================================
-- Function: Process subscription_updated event (renewal, status change)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_lemonsqueezy_subscription_updated(
  p_event_id TEXT,
  p_subscription_id TEXT,
  p_status TEXT,
  p_renews_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_pause_mode TEXT DEFAULT NULL,
  p_resumes_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_raw_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
  v_user_sub_status TEXT;
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

  -- Update subscription
  UPDATE lemonsqueezy_subscriptions
  SET
    status = p_status,
    renews_at = COALESCE(p_renews_at, renews_at),
    ends_at = COALESCE(p_ends_at, ends_at),
    current_period_start = COALESCE(p_current_period_start, current_period_start),
    current_period_end = COALESCE(p_current_period_end, current_period_end),
    cancelled_at = COALESCE(p_cancelled_at, cancelled_at),
    pause_mode = COALESCE(p_pause_mode, pause_mode),
    resumes_at = COALESCE(p_resumes_at, resumes_at),
    lemonsqueezy_data = p_raw_data,
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Map LemonSqueezy status to user_subscriptions status
  v_user_sub_status := CASE p_status
    WHEN 'active' THEN 'active'
    WHEN 'on_trial' THEN 'active'
    WHEN 'paused' THEN 'paused'
    WHEN 'past_due' THEN 'active'  -- Still active but payment failed
    WHEN 'unpaid' THEN 'expired'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'expired' THEN 'expired'
    ELSE 'active'
  END;

  -- Update user_subscriptions
  UPDATE user_subscriptions
  SET
    status = v_user_sub_status,
    expires_at = COALESCE(p_ends_at, p_renews_at, p_current_period_end, expires_at),
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', v_sub.user_id,
    'old_status', v_sub.status,
    'new_status', p_status
  );
END;
$$;

-- ============================================================================
-- Function: Process subscription_payment_success (renewal payment)
-- ============================================================================
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
  v_balance_after INTEGER;
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get subscription
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

  -- Get current balance
  SELECT COALESCE(balance, 0) INTO v_balance_before
  FROM user_balances WHERE user_id = v_sub.user_id;

  IF v_balance_before IS NULL THEN
    v_balance_before := 0;
  END IF;

  -- Add credits for renewal
  UPDATE user_balances
  SET
    balance = balance + v_sub.credits_per_period,
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  v_balance_after := v_balance_before + v_sub.credits_per_period;

  -- Update subscription tracking
  UPDATE lemonsqueezy_subscriptions
  SET
    last_credits_granted_at = NOW(),
    total_credits_granted = total_credits_granted + credits_per_period,
    status = 'active',
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Record transaction
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  )
  VALUES (
    v_sub.user_id,
    v_sub.credits_per_period,
    'subscription',
    format('LemonSqueezy renewal: %s plan', v_sub.plan_type),
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'plan_type', v_sub.plan_type,
      'payment_method', 'lemonsqueezy',
      'event_id', p_event_id,
      'is_renewal', true
    )
  );

  -- Update user_subscriptions expiry
  UPDATE user_subscriptions
  SET
    status = 'active',
    expires_at = NOW() + INTERVAL '30 days',
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', v_sub.user_id,
    'credits_granted', v_sub.credits_per_period,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'is_renewal', true
  );
END;
$$;

-- ============================================================================
-- Function: Process subscription_payment_failed
-- ============================================================================
CREATE OR REPLACE FUNCTION process_lemonsqueezy_payment_failed(
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
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get subscription
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

  -- Update subscription status to past_due
  UPDATE lemonsqueezy_subscriptions
  SET
    status = 'past_due',
    lemonsqueezy_data = lemonsqueezy_data || jsonb_build_object('last_payment_failed_at', NOW()),
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', v_sub.user_id,
    'status', 'past_due',
    'note', 'Payment failed, subscription marked as past_due'
  );
END;
$$;

-- ============================================================================
-- Function: Process subscription_cancelled
-- ============================================================================
CREATE OR REPLACE FUNCTION process_lemonsqueezy_subscription_cancelled(
  p_event_id TEXT,
  p_subscription_id TEXT,
  p_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
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

  -- Get subscription
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

  -- Update subscription
  UPDATE lemonsqueezy_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    ends_at = COALESCE(p_ends_at, current_period_end, NOW()),
    lemonsqueezy_data = p_raw_data,
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Update user_subscriptions
  -- Note: Don't immediately expire - user keeps access until ends_at
  UPDATE user_subscriptions
  SET
    status = 'cancelled',
    expires_at = COALESCE(p_ends_at, v_sub.current_period_end, NOW()),
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', v_sub.user_id,
    'status', 'cancelled',
    'ends_at', COALESCE(p_ends_at, v_sub.current_period_end),
    'note', 'Subscription cancelled, access continues until ends_at'
  );
END;
$$;

-- ============================================================================
-- Function: Process subscription_expired
-- ============================================================================
CREATE OR REPLACE FUNCTION process_lemonsqueezy_subscription_expired(
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
BEGIN
  -- Check idempotency
  IF check_lemonsqueezy_webhook_idempotency(p_event_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event already processed',
      'event_id', p_event_id
    );
  END IF;

  -- Get subscription
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

  -- Update subscription
  UPDATE lemonsqueezy_subscriptions
  SET
    status = 'expired',
    ends_at = NOW(),
    lemonsqueezy_data = p_raw_data,
    updated_at = NOW()
  WHERE subscription_id = p_subscription_id;

  -- Update user_subscriptions
  UPDATE user_subscriptions
  SET
    status = 'expired',
    expires_at = NOW(),
    updated_at = NOW()
  WHERE user_id = v_sub.user_id;

  -- Mark webhook as processed
  UPDATE lemonsqueezy_webhook_events
  SET processed = TRUE, processed_at = NOW()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'user_id', v_sub.user_id,
    'status', 'expired'
  );
END;
$$;

-- ============================================================================
-- Function: Get user's LemonSqueezy subscription status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_lemonsqueezy_subscription(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM lemonsqueezy_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'on_trial', 'past_due', 'paused')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_subscription', false,
      'user_id', p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'subscription_id', v_sub.subscription_id,
    'plan_type', v_sub.plan_type,
    'status', v_sub.status,
    'price_usd', v_sub.price_usd,
    'credits_per_period', v_sub.credits_per_period,
    'renews_at', v_sub.renews_at,
    'ends_at', v_sub.ends_at,
    'card_brand', v_sub.card_brand,
    'card_last_four', v_sub.card_last_four,
    'created_at', v_sub.created_at
  );
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE lemonsqueezy_subscriptions IS 'LemonSqueezy subscription records';
COMMENT ON TABLE lemonsqueezy_webhook_events IS 'Webhook events for idempotency and audit';
COMMENT ON FUNCTION get_lemonsqueezy_plan_info IS 'Map variant_id to plan type and credits';
COMMENT ON FUNCTION process_lemonsqueezy_subscription_created IS 'Process new subscription webhook';
COMMENT ON FUNCTION process_lemonsqueezy_subscription_updated IS 'Process subscription update webhook';
COMMENT ON FUNCTION process_lemonsqueezy_payment_success IS 'Process renewal payment webhook';
COMMENT ON FUNCTION process_lemonsqueezy_payment_failed IS 'Process failed payment webhook';
COMMENT ON FUNCTION process_lemonsqueezy_subscription_cancelled IS 'Process cancellation webhook';
COMMENT ON FUNCTION process_lemonsqueezy_subscription_expired IS 'Process expiration webhook';
COMMENT ON FUNCTION get_user_lemonsqueezy_subscription IS 'Get user subscription status';

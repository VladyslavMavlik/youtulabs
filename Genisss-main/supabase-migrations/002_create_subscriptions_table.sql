-- User Subscriptions Table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('starter', 'pro', 'ultimate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription History for audit trail
CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'upgraded', 'downgraded', 'renewed', 'cancelled', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_created_at ON subscription_history(created_at DESC);

-- Row Level Security
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own subscription" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscription history" ON subscription_history;

-- Users can only view their own subscription
CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can only view their own subscription history
CREATE POLICY "Users can view own subscription history"
  ON subscription_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to get user subscription
CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID)
RETURNS TABLE(
  plan_id TEXT,
  status TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.plan_id,
    us.status,
    us.started_at,
    us.expires_at
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;
END;
$$;

-- Function to update user subscription (admin only)
CREATE OR REPLACE FUNCTION update_user_subscription(
  p_user_id UUID,
  p_plan_id TEXT,
  p_status TEXT DEFAULT 'active',
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE(plan_id TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_plan_id TEXT;
  v_action TEXT;
BEGIN
  -- Get current plan if exists
  SELECT us.plan_id INTO v_old_plan_id
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;

  -- Determine action type
  IF v_old_plan_id IS NULL THEN
    v_action := 'created';
  ELSIF v_old_plan_id != p_plan_id THEN
    v_action := 'upgraded';
  ELSE
    v_action := 'renewed';
  END IF;

  -- Insert or update subscription
  INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at)
  VALUES (p_user_id, p_plan_id, p_status, p_expires_at)
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_plan_id,
    status = p_status,
    expires_at = p_expires_at,
    updated_at = NOW();

  -- Log to history
  INSERT INTO subscription_history (user_id, plan_id, action, metadata)
  VALUES (p_user_id, p_plan_id, v_action, jsonb_build_object('old_plan', v_old_plan_id));

  -- Update user metadata
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object('subscription_plan', p_plan_id)
  WHERE id = p_user_id;

  RETURN QUERY SELECT p_plan_id, p_status;
END;
$$;

-- Function to cancel user subscription
CREATE OR REPLACE FUNCTION cancel_user_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_subscriptions
  SET status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log cancellation
  INSERT INTO subscription_history (user_id, plan_id, action)
  SELECT user_id, plan_id, 'cancelled'
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- View for active subscriptions with user info
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT
  us.user_id,
  u.email,
  u.raw_user_meta_data->>'name' as user_name,
  us.plan_id,
  us.status,
  us.started_at,
  us.expires_at,
  ub.balance as crystal_balance
FROM user_subscriptions us
JOIN auth.users u ON us.user_id = u.id
LEFT JOIN user_balances ub ON us.user_id = ub.user_id
WHERE us.status = 'active';

COMMENT ON TABLE user_subscriptions IS 'Stores user subscription plans';
COMMENT ON TABLE subscription_history IS 'Audit log of all subscription changes';
COMMENT ON FUNCTION get_user_subscription IS 'Get user current subscription';
COMMENT ON FUNCTION update_user_subscription IS 'Update or create user subscription (admin function)';
COMMENT ON FUNCTION cancel_user_subscription IS 'Cancel user subscription';

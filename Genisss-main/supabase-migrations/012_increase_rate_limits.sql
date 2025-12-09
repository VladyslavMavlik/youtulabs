-- Increase rate limits to be more user-friendly
-- While still protecting against abuse

-- Update get_user_balance with higher limit
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Check rate limit: max 300 calls per minute (5 per second)
  PERFORM check_rate_limit('get_user_balance', 300, 1);

  SELECT balance INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id;

  -- If no balance exists, create one with initial 100 gems
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, 100)
    RETURNING balance INTO v_balance;

    -- Log initial balance
    INSERT INTO balance_transactions (user_id, amount, type, description, balance_before, balance_after)
    VALUES (p_user_id, 100, 'initial', 'Welcome bonus', 0, 100);
  END IF;

  RETURN v_balance;
END;
$$;

-- Update admin_set_user_balance with higher limit
CREATE OR REPLACE FUNCTION admin_set_user_balance(
  p_user_id UUID,
  p_new_balance INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance INTEGER;
BEGIN
  -- Check admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Rate limit for admins: max 500 calls per minute
  PERFORM check_rate_limit('admin_set_user_balance', 500, 1);

  -- Get current balance
  SELECT balance INTO v_old_balance
  FROM user_balances
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_old_balance := 0;
  END IF;

  -- Update or insert balance
  INSERT INTO user_balances (user_id, balance, updated_at)
  VALUES (p_user_id, p_new_balance, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = p_new_balance,
    updated_at = NOW();

  -- Log transaction
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after
  )
  VALUES (
    p_user_id,
    p_new_balance - v_old_balance,
    'bonus',
    'Balance adjusted by admin: ' || auth.uid()::text,
    v_old_balance,
    p_new_balance
  );

  RETURN TRUE;
END;
$$;

-- Update get_all_users_with_subscriptions with rate limit
CREATE OR REPLACE FUNCTION get_all_users_with_subscriptions()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  user_name TEXT,
  plan_id TEXT,
  status TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  crystal_balance INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Rate limit: max 200 calls per minute for admin panel
  PERFORM check_rate_limit('get_all_users_with_subscriptions', 200, 1);

  RETURN QUERY
  SELECT
    u.id as user_id,
    u.email::TEXT,
    (u.raw_user_meta_data->>'name')::TEXT as user_name,
    us.plan_id::TEXT,
    us.status::TEXT,
    us.started_at,
    us.expires_at,
    COALESCE(ub.balance, 0)::INTEGER as crystal_balance,
    u.created_at
  FROM auth.users u
  LEFT JOIN user_subscriptions us ON u.id = us.user_id
  LEFT JOIN user_balances ub ON u.id = ub.user_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Update update_user_subscription with rate limit
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
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Rate limit: max 500 calls per minute
  PERFORM check_rate_limit('update_user_subscription', 500, 1);

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
  VALUES (p_user_id, p_plan_id, v_action, jsonb_build_object('old_plan', v_old_plan_id, 'admin_id', auth.uid()));

  -- Update user metadata
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object('subscription_plan', p_plan_id)
  WHERE id = p_user_id;

  RETURN QUERY SELECT p_plan_id, p_status;
END;
$$;

COMMENT ON FUNCTION get_user_balance IS 'Get user balance with rate limiting (max 300/min = 5/sec)';
COMMENT ON FUNCTION admin_set_user_balance IS 'Set user balance with rate limiting (max 500/min)';
COMMENT ON FUNCTION get_all_users_with_subscriptions IS 'Get all users with rate limiting (max 200/min)';
COMMENT ON FUNCTION update_user_subscription IS 'Update subscription with rate limiting (max 500/min)';

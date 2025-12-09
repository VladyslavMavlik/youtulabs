-- FIX: Remove search_path restriction that breaks auth.uid()
-- The search_path = public was preventing access to auth schema functions

-- Fixed is_admin() function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  -- Get current user ID from auth context
  v_user_id := auth.uid();

  -- If no authenticated user, return false
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get role from database (not from JWT token)
  SELECT raw_user_meta_data->>'role' INTO v_role
  FROM auth.users
  WHERE id = v_user_id;

  -- Return true only if role is 'admin'
  RETURN COALESCE(v_role = 'admin', false);
END;
$$;

-- Fixed get_all_users_with_subscriptions function
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

  RETURN QUERY
  SELECT
    u.id as user_id,
    u.email,
    u.raw_user_meta_data->>'name' as user_name,
    us.plan_id,
    us.status,
    us.started_at,
    us.expires_at,
    COALESCE(ub.balance, 0) as crystal_balance,
    u.created_at
  FROM auth.users u
  LEFT JOIN user_subscriptions us ON u.id = us.user_id
  LEFT JOIN user_balances ub ON u.id = ub.user_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Fixed update_user_subscription function
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

-- Fixed admin_set_user_balance function
CREATE OR REPLACE FUNCTION admin_set_user_balance(
  p_user_id UUID,
  p_new_balance INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Update balance
  INSERT INTO user_balances (user_id, balance, updated_at)
  VALUES (p_user_id, p_new_balance, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = p_new_balance,
    updated_at = NOW();

  -- Log transaction
  INSERT INTO balance_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, p_new_balance, 'admin_adjustment', 'Balance set by admin: ' || auth.uid()::text);

  RETURN TRUE;
END;
$$;

-- Fixed cancel_user_subscription function
CREATE OR REPLACE FUNCTION cancel_user_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  UPDATE user_subscriptions
  SET status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log cancellation
  INSERT INTO subscription_history (user_id, plan_id, action, metadata)
  SELECT user_id, plan_id, 'cancelled', jsonb_build_object('admin_id', auth.uid())
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION is_admin IS 'Check if current user has admin role (checks database, not JWT)';
COMMENT ON FUNCTION get_all_users_with_subscriptions IS 'Get all users with subscriptions (admin only)';
COMMENT ON FUNCTION update_user_subscription IS 'Update user subscription (admin only)';
COMMENT ON FUNCTION admin_set_user_balance IS 'Set user balance (admin only)';
COMMENT ON FUNCTION cancel_user_subscription IS 'Cancel user subscription (admin only)';

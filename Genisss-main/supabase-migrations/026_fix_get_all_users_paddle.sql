-- Fix get_all_users_with_subscriptions to read from paddle_subscriptions instead of user_subscriptions
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
    u.email::TEXT,
    (u.raw_user_meta_data->>'name')::TEXT as user_name,
    ps.plan_type::TEXT as plan_id,  -- Read from paddle_subscriptions.plan_type
    ps.status::TEXT,
    ps.created_at as started_at,
    ps.current_period_end as expires_at,
    COALESCE(get_user_active_balance(u.id), 0)::INTEGER as crystal_balance,  -- Use active balance function instead of user_balances
    u.created_at
  FROM auth.users u
  LEFT JOIN paddle_subscriptions ps ON u.id = ps.user_id
  ORDER BY u.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_all_users_with_subscriptions IS 'Get all users with their Paddle subscriptions for admin panel';

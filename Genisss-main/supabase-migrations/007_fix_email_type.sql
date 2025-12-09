-- FIX: Email column type mismatch (VARCHAR(255) vs TEXT)
-- Cast email to TEXT to match function signature

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
    u.email::TEXT,  -- Cast to TEXT
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

COMMENT ON FUNCTION get_all_users_with_subscriptions IS 'Get all users with subscriptions (admin only - fixed type casting)';

-- Fix get_user_subscription to read from paddle_subscriptions instead of user_subscriptions
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
    ps.plan_type as plan_id,  -- map plan_type to plan_id for backwards compatibility
    ps.status,
    ps.created_at as started_at,
    ps.current_period_end as expires_at
  FROM paddle_subscriptions ps
  WHERE ps.user_id = p_user_id
  AND ps.status IN ('active', 'trialing', 'past_due')  -- only return active subscriptions
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_user_subscription IS 'Get active subscription for a user from paddle_subscriptions table';

-- Update get_user_subscription to include cancel_at field
-- This allows frontend to display subscription cancellation date

-- Drop existing function first
DROP FUNCTION IF EXISTS get_user_subscription(UUID);

CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID)
RETURNS TABLE (
  plan_id TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First try to get from paddle_subscriptions (more detailed)
  RETURN QUERY
  SELECT
    ps.plan_type::TEXT as plan_id,
    ps.status::TEXT,
    ps.current_period_start as started_at,
    ps.current_period_end as expires_at,
    ps.cancel_at
  FROM paddle_subscriptions ps
  WHERE ps.user_id = p_user_id
  LIMIT 1;

  -- If no paddle subscription, check user_subscriptions
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      us.plan_id::TEXT,
      us.status::TEXT,
      us.started_at,
      us.expires_at,
      NULL::TIMESTAMPTZ as cancel_at
    FROM user_subscriptions us
    WHERE us.user_id = p_user_id
    LIMIT 1;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION get_user_subscription IS 'Get user subscription with cancellation date';

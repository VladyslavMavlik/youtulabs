-- Add admin role to user metadata
-- Admins will have { role: 'admin' } in their raw_user_meta_data

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt()->>'user_metadata')::jsonb->>'role' = 'admin',
      false
    )
  );
END;
$$;

-- Admin policies for user_subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert subscriptions"
  ON user_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update subscriptions"
  ON user_subscriptions FOR UPDATE
  TO authenticated
  USING (is_admin());

-- Admin policies for user_balances
CREATE POLICY "Admins can view all balances"
  ON user_balances FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update balances"
  ON user_balances FOR UPDATE
  TO authenticated
  USING (is_admin());

-- Admin policies for subscription_history
CREATE POLICY "Admins can view all subscription history"
  ON subscription_history FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admin policies for balance_transactions
CREATE POLICY "Admins can view all transactions"
  ON balance_transactions FOR SELECT
  TO authenticated
  USING (is_admin());

-- Function to get all users with subscriptions (admin only)
CREATE OR REPLACE FUNCTION get_all_users_admin()
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

COMMENT ON FUNCTION is_admin IS 'Check if current user has admin role';
COMMENT ON FUNCTION get_all_users_admin IS 'Get all users with subscriptions and balances (admin only)';

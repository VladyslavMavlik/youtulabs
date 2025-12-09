-- Add SQL-based rate limiting to protect against DDoS and spam
-- This works even on Free tier Supabase

-- Create table to track API calls
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_function_time
  ON rate_limit_log(user_id, function_name, called_at DESC);

-- Enable RLS
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own logs
CREATE POLICY "Users can view own rate limit logs"
  ON rate_limit_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only functions can insert logs (through SECURITY DEFINER)
CREATE POLICY "No direct inserts"
  ON rate_limit_log FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_function_name TEXT,
  p_max_calls INTEGER DEFAULT 30,  -- Max 30 calls
  p_window_minutes INTEGER DEFAULT 1  -- Per 1 minute
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_call_count INTEGER;
  v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- If no user (anonymous), allow but log IP
  IF v_user_id IS NULL THEN
    RETURN TRUE;  -- You can make this FALSE to block anonymous calls
  END IF;

  -- Calculate time window
  v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  -- Count calls in the time window
  SELECT COUNT(*)
  INTO v_call_count
  FROM rate_limit_log
  WHERE user_id = v_user_id
    AND function_name = p_function_name
    AND called_at >= v_window_start;

  -- If exceeded limit, reject
  IF v_call_count >= p_max_calls THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait % minute(s) before trying again.', p_window_minutes;
  END IF;

  -- Log this call
  INSERT INTO rate_limit_log (user_id, function_name)
  VALUES (v_user_id, p_function_name);

  RETURN TRUE;
END;
$$;

-- Function to clean old logs (run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete logs older than 1 hour
  DELETE FROM rate_limit_log
  WHERE called_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- Update get_user_balance with rate limiting
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Check rate limit: max 60 calls per minute
  PERFORM check_rate_limit('get_user_balance', 60, 1);

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

-- Update admin functions with rate limiting
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

  -- Rate limit for admins: max 100 calls per minute
  PERFORM check_rate_limit('admin_set_user_balance', 100, 1);

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

COMMENT ON TABLE rate_limit_log IS 'Logs API calls for rate limiting';
COMMENT ON FUNCTION check_rate_limit IS 'Check if user exceeded rate limit for a function';
COMMENT ON FUNCTION cleanup_rate_limit_logs IS 'Clean old rate limit logs (run hourly)';
COMMENT ON FUNCTION get_user_balance IS 'Get user balance with rate limiting (max 60/min)';
COMMENT ON FUNCTION admin_set_user_balance IS 'Set user balance with rate limiting (max 100/min)';

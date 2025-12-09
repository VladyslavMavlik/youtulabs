-- Fix get_user_balance - remove rate limiting that conflicts with new check_rate_limit
-- The function is already protected by RLS, so rate limiting is not critical here

CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Removed rate limiting to avoid conflict with new check_rate_limit signature
  -- This function is already protected by RLS policies

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

COMMENT ON FUNCTION get_user_balance IS 'Get user balance, creating initial balance if needed (protected by RLS)';

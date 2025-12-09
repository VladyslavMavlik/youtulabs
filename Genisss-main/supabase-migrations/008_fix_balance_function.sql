-- FIX: admin_set_user_balance function - column is 'type' not 'transaction_type'

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
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Get current balance
  SELECT balance INTO v_old_balance
  FROM user_balances
  WHERE user_id = p_user_id;

  -- If no balance exists, set old balance to 0
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

  -- Log transaction (column is 'type', not 'transaction_type')
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

COMMENT ON FUNCTION admin_set_user_balance IS 'Set user balance (admin only - logs transaction with balance_before and balance_after)';

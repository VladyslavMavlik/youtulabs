-- Atomic balance deduction function with SELECT FOR UPDATE lock
-- This prevents race conditions when multiple requests try to deduct balance simultaneously
--
-- Usage in code:
-- SELECT * FROM deduct_user_balance('user-id-here', 50, 'generation', 'Story generation (5 min, thriller)');

CREATE OR REPLACE FUNCTION deduct_user_balance(
  p_user_id UUID,
  p_cost INTEGER,
  p_type TEXT,
  p_description TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the row for this user to prevent concurrent modifications
  -- This is the critical part that prevents race conditions
  SELECT balance INTO v_current_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;  -- <-- This locks the row until transaction completes

  -- Check if user exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'User not found';
    RETURN;
  END IF;

  -- Check if sufficient balance
  IF v_current_balance < p_cost THEN
    RETURN QUERY SELECT FALSE, v_current_balance, 'Insufficient balance';
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_cost;

  -- Update balance
  UPDATE user_balances
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create transaction record
  INSERT INTO balance_transactions (user_id, amount, type, description, metadata)
  VALUES (
    p_user_id,
    -p_cost,
    p_type,
    p_description,
    jsonb_build_object(
      'cost', p_cost,
      'timestamp', NOW()
    )
  );

  -- Return success with new balance
  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION deduct_user_balance TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_user_balance TO anon;

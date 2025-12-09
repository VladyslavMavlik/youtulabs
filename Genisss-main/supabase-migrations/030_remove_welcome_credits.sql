-- Remove welcome credits for new users
-- Users should start with 0 credits and need to purchase or subscribe

-- Update the trigger function to NOT give initial credits
CREATE OR REPLACE FUNCTION create_balance_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create balance record with 0 credits (no welcome bonus)
  INSERT INTO user_balances (user_id, balance)
  VALUES (NEW.id, 0);

  -- NO transaction log for initial balance since it's 0
  -- Users must purchase credits or subscribe to get any

  RETURN NEW;
END;
$$;

-- Update get_user_balance to create with 0 credits if not exists
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id;

  -- If no balance exists, create one with 0 credits (no welcome bonus)
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, 0)
    RETURNING balance INTO v_balance;

    -- NO welcome bonus transaction
  END IF;

  RETURN v_balance;
END;
$$;

-- Update update_user_balance to NOT give welcome bonus
CREATE OR REPLACE FUNCTION update_user_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT balance INTO v_old_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If user doesn't have a balance record, create one with 0 balance
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, 0)
    RETURNING balance INTO v_old_balance;

    -- NO initial balance transaction
  END IF;

  -- Calculate new balance
  v_new_balance := v_old_balance + p_amount;

  -- Check if balance would go negative
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_old_balance, ABS(p_amount);
  END IF;

  -- Update balance
  UPDATE user_balances
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO balance_transactions (user_id, amount, type, description, balance_before, balance_after, metadata)
  VALUES (p_user_id, p_amount, p_type, p_description, v_old_balance, v_new_balance, p_metadata)
  RETURNING id INTO v_transaction_id;

  -- Return new balance and transaction ID
  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;

-- Update the default balance for new records to 0
ALTER TABLE user_balances ALTER COLUMN balance SET DEFAULT 0;

COMMENT ON FUNCTION create_balance_for_new_user IS 'Create user balance with 0 credits (no welcome bonus)';
COMMENT ON FUNCTION get_user_balance IS 'Get user balance, creating with 0 credits if needed (no welcome bonus)';
COMMENT ON FUNCTION update_user_balance IS 'Safely update user balance with transaction logging';

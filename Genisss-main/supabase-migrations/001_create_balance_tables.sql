-- User Balances Table
CREATE TABLE IF NOT EXISTS user_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100 CHECK (balance >= 0), -- Start with 100 gems
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Balance Transactions Table for audit trail
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Positive for additions, negative for deductions
  type TEXT NOT NULL CHECK (type IN ('purchase', 'generation', 'refund', 'bonus', 'initial')),
  description TEXT,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at DESC);

-- Row Level Security
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own balance" ON user_balances;
DROP POLICY IF EXISTS "Users can view own transactions" ON balance_transactions;

-- Users can only view their own balance
CREATE POLICY "Users can view own balance"
  ON user_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can only view their own transactions
CREATE POLICY "Users can view own transactions"
  ON balance_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update balance safely with transaction logging
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

  -- If user doesn't have a balance record, create one with initial balance
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, 100)
    RETURNING balance INTO v_old_balance;

    -- Log initial balance transaction
    INSERT INTO balance_transactions (user_id, amount, type, description, balance_before, balance_after, metadata)
    VALUES (p_user_id, 100, 'initial', 'Initial balance', 0, 100, '{}');
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

-- Function to get or create user balance
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

-- Trigger to automatically create balance for new users
CREATE OR REPLACE FUNCTION create_balance_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_balances (user_id, balance)
  VALUES (NEW.id, 100);

  INSERT INTO balance_transactions (user_id, amount, type, description, balance_before, balance_after)
  VALUES (NEW.id, 100, 'initial', 'Welcome bonus', 0, 100);

  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_balance_for_new_user();

COMMENT ON TABLE user_balances IS 'Stores user gem balances';
COMMENT ON TABLE balance_transactions IS 'Audit log of all balance changes';
COMMENT ON FUNCTION update_user_balance IS 'Safely update user balance with transaction logging';
COMMENT ON FUNCTION get_user_balance IS 'Get user balance, creating initial balance if needed';

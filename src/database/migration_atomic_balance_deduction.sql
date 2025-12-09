-- Migration: Atomic Balance Deduction with Race Condition Protection
-- Created: 2025-01-22
-- Purpose: Fix critical race condition vulnerability in balance deduction

-- ==============================================================================
-- ATOMIC BALANCE DEDUCTION FUNCTION
-- ==============================================================================
-- This function uses row-level locking (FOR UPDATE) to prevent race conditions
-- where multiple concurrent requests could deduct balance simultaneously
-- ==============================================================================

CREATE OR REPLACE FUNCTION deduct_balance_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- CRITICAL: Lock the user's balance row for the duration of this transaction
  -- This prevents other transactions from reading/writing until we're done
  -- FOR UPDATE ensures no race conditions between check and deduct
  SELECT balance INTO v_current_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If no balance record exists, create it with initial balance of 100
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, 100)
    RETURNING balance INTO v_current_balance;
  END IF;

  -- Check if user has sufficient balance
  IF v_current_balance < p_amount THEN
    -- Return error immediately without modifying anything
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current', v_current_balance,
      'required', p_amount
    );
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Deduct balance atomically
  UPDATE user_balances
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create transaction record (CRITICAL - if this fails, whole transaction rolls back)
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    -p_amount,           -- Negative for deduction
    'generation',
    p_description,
    v_current_balance,
    v_new_balance,
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_new_balance,
    'transactionId', v_transaction_id,
    'balanceBefore', v_current_balance,
    'balanceAfter', v_new_balance
  );

EXCEPTION
  WHEN OTHERS THEN
    -- If anything fails, the entire transaction is automatically rolled back
    -- Balance and transaction log remain unchanged
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'errorCode', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ATOMIC REFUND FUNCTION (FOR ADMIN/BACKEND USE)
-- ==============================================================================
-- This function refunds balance when story generation fails
-- Includes balance_before/balance_after tracking for audit trail
-- ==============================================================================

CREATE OR REPLACE FUNCTION refund_balance_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the user's balance row
  SELECT balance INTO v_current_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create balance record if doesn't exist (should never happen for refunds)
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, p_amount)
    RETURNING balance INTO v_new_balance;
  ELSE
    -- Add refund amount to current balance
    v_new_balance := v_current_balance + p_amount;

    UPDATE user_balances
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- Create refund transaction record
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,           -- Positive for refund
    'refund',
    p_reason,
    v_current_balance,
    v_new_balance,
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_new_balance,
    'transactionId', v_transaction_id,
    'balanceBefore', v_current_balance,
    'balanceAfter', v_new_balance
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'errorCode', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ADMIN FUNCTION: ADD BALANCE (FOR PAYMENTS, ADMIN CREDITS, ETC.)
-- ==============================================================================
-- This function adds balance (for purchases, admin grants, etc.)
-- Separate from refund to maintain clear audit trail
-- ==============================================================================

CREATE OR REPLACE FUNCTION add_balance_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,            -- 'purchase', 'admin_grant', 'promo', etc.
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_valid_types TEXT[] := ARRAY['purchase', 'admin_grant', 'promo', 'bonus', 'subscription'];
BEGIN
  -- Validate transaction type
  IF NOT (p_type = ANY(v_valid_types)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid transaction type',
      'validTypes', v_valid_types
    );
  END IF;

  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount must be positive'
    );
  END IF;

  -- Lock the user's balance row
  SELECT balance INTO v_current_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create balance record with the added amount
    INSERT INTO user_balances (user_id, balance)
    VALUES (p_user_id, p_amount)
    RETURNING balance INTO v_new_balance;
  ELSE
    -- Add amount to current balance
    v_new_balance := v_current_balance + p_amount;

    UPDATE user_balances
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- Create transaction record
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,           -- Positive for addition
    p_type,
    p_description,
    COALESCE(v_current_balance, 0),
    v_new_balance,
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_new_balance,
    'transactionId', v_transaction_id,
    'balanceBefore', COALESCE(v_current_balance, 0),
    'balanceAfter', v_new_balance
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'errorCode', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- GRANT PERMISSIONS
-- ==============================================================================

-- Grant execute permissions to authenticated users for deduction
GRANT EXECUTE ON FUNCTION deduct_balance_atomic(UUID, INTEGER, TEXT, JSONB) TO authenticated;

-- Grant execute permissions to service role for refunds and additions
GRANT EXECUTE ON FUNCTION refund_balance_atomic(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION add_balance_atomic(UUID, INTEGER, TEXT, TEXT, JSONB) TO service_role;

-- ==============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================================================

COMMENT ON FUNCTION deduct_balance_atomic IS
'Atomically deducts balance with race condition protection using row-level locking.
Used for story generation payments. Returns success/error with balance details.';

COMMENT ON FUNCTION refund_balance_atomic IS
'Atomically refunds balance when story generation fails.
Used by backend worker only. Includes full audit trail.';

COMMENT ON FUNCTION add_balance_atomic IS
'Atomically adds balance for purchases, admin grants, promos, etc.
Validates transaction type and amount. Full audit trail.';

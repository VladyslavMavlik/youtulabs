-- ============================================================================
-- Migration 031: Fix Atomic Balance Functions for Paddle Credit System
-- ============================================================================
-- Problem: Old atomic functions try to use FOR UPDATE on user_balances VIEW
-- Solution: Update functions to work with user_credits table and consume_credits
-- ============================================================================

-- Drop old functions first to avoid parameter conflicts
DROP FUNCTION IF EXISTS deduct_balance_atomic(UUID, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS refund_balance_atomic(UUID, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS add_balance_atomic(UUID, INTEGER, TEXT, TEXT, JSONB);

-- ============================================================================
-- UPDATED: deduct_balance_atomic - Now uses consume_credits
-- ============================================================================
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
  -- Get current active balance (from VIEW)
  v_current_balance := get_user_active_balance(p_user_id);

  -- Check if user has sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current', v_current_balance,
      'required', p_amount
    );
  END IF;

  -- Consume credits using FIFO logic (locks user_credits rows with FOR UPDATE)
  BEGIN
    PERFORM consume_credits(p_user_id, p_amount, p_metadata);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'errorCode', SQLSTATE
      );
  END;

  -- Get new balance after deduction
  v_new_balance := get_user_active_balance(p_user_id);

  -- Create transaction record for audit trail
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
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'errorCode', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATED: refund_balance_atomic - Adds credits as bonus with 30 day expiry
-- ============================================================================
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
  v_credit_id UUID;
BEGIN
  -- Get current balance
  v_current_balance := get_user_active_balance(p_user_id);

  -- Add refund as new credit package (30 day expiry)
  INSERT INTO user_credits (
    user_id,
    amount,
    source,
    source_id,
    expires_at,
    metadata
  )
  VALUES (
    p_user_id,
    p_amount,
    'bonus',                  -- Source is 'bonus' for refunds
    NULL,                     -- No source_id for refunds
    NOW() + INTERVAL '30 days',
    p_metadata || jsonb_build_object(
      'refund_reason', p_reason,
      'refund_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  -- Get new balance
  v_new_balance := get_user_active_balance(p_user_id);

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
    p_metadata || jsonb_build_object('credit_id', v_credit_id)
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_new_balance,
    'transactionId', v_transaction_id,
    'balanceBefore', v_current_balance,
    'balanceAfter', v_new_balance,
    'creditId', v_credit_id
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

-- ============================================================================
-- UPDATED: add_balance_atomic - Adds credits as bonus with 30 day expiry
-- ============================================================================
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
  v_credit_id UUID;
  v_valid_types TEXT[] := ARRAY['purchase', 'admin_grant', 'promo', 'bonus', 'subscription'];
  v_credit_source TEXT;
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

  -- Get current balance
  v_current_balance := get_user_active_balance(p_user_id);

  -- Map transaction type to credit source
  v_credit_source := CASE
    WHEN p_type = 'admin_grant' THEN 'bonus'
    WHEN p_type = 'promo' THEN 'bonus'
    WHEN p_type = 'subscription' THEN 'subscription'
    ELSE p_type  -- 'purchase' or 'bonus'
  END;

  -- Add credits as new package (30 day expiry)
  INSERT INTO user_credits (
    user_id,
    amount,
    source,
    source_id,
    expires_at,
    metadata
  )
  VALUES (
    p_user_id,
    p_amount,
    v_credit_source,
    NULL,                     -- No source_id for manual additions
    NOW() + INTERVAL '30 days',
    p_metadata || jsonb_build_object(
      'grant_type', p_type,
      'grant_date', NOW(),
      'description', p_description
    )
  )
  RETURNING id INTO v_credit_id;

  -- Get new balance
  v_new_balance := get_user_active_balance(p_user_id);

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
    v_current_balance,
    v_new_balance,
    p_metadata || jsonb_build_object('credit_id', v_credit_id)
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_new_balance,
    'transactionId', v_transaction_id,
    'balanceBefore', v_current_balance,
    'balanceAfter', v_new_balance,
    'creditId', v_credit_id
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

-- ============================================================================
-- COMPATIBILITY: Update user_balances VIEW to match user_active_credits
-- ============================================================================
DROP VIEW IF EXISTS user_balances CASCADE;
CREATE OR REPLACE VIEW user_balances AS
SELECT
  user_id,
  total_credits AS balance,
  total_credits AS active_balance,
  0 AS reserved_balance,
  NOW() AS updated_at
FROM user_active_credits;

-- Grant SELECT on view to authenticated users
GRANT SELECT ON user_balances TO authenticated;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION deduct_balance_atomic(UUID, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_balance_atomic(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION add_balance_atomic(UUID, INTEGER, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION deduct_balance_atomic IS
'Atomically deducts balance using FIFO credit consumption from user_credits table.
Compatible with Paddle payments system. Uses consume_credits() internally.';

COMMENT ON FUNCTION refund_balance_atomic IS
'Atomically refunds balance by creating new credit package with 30 day expiry.
Compatible with Paddle payments system. Used by backend worker only.';

COMMENT ON FUNCTION add_balance_atomic IS
'Atomically adds balance by creating new credit package with 30 day expiry.
Compatible with Paddle payments system. Used for admin grants, promos, etc.';

COMMENT ON VIEW user_balances IS
'Compatibility view that maps to user_active_credits.
Provides balance, active_balance, reserved_balance for backward compatibility.';

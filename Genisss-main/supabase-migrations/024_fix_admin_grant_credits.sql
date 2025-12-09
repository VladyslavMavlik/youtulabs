-- Fix admin_grant_credits function to handle NULL balance
CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_source TEXT DEFAULT 'bonus',
  p_reason TEXT DEFAULT 'Manual admin grant',
  p_expires_in_days INTEGER DEFAULT 30,
  p_admin_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  -- Валідація
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;

  IF p_source NOT IN ('purchase', 'subscription', 'bonus', 'initial') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source;
  END IF;

  -- Перевіряємо чи користувач існує
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Розраховуємо expiration
  v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;

  -- Отримуємо поточний баланс (COALESCE для обробки NULL)
  v_balance_before := COALESCE(get_user_active_balance(p_user_id), 0);

  -- Створюємо кредити
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
    p_source,
    'admin_grant_' || gen_random_uuid()::TEXT,
    v_expires_at,
    jsonb_build_object(
      'reason', p_reason,
      'granted_by_admin', p_admin_id,
      'granted_date', NOW(),
      'expires_in_days', p_expires_in_days
    )
  )
  RETURNING id INTO v_credit_id;

  -- Отримуємо новий баланс
  v_balance_after := COALESCE(get_user_active_balance(p_user_id), 0);

  -- Логуємо в balance_transactions
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  )
  VALUES (
    p_user_id,
    p_amount,
    'bonus',
    p_reason,
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'admin_grant', true,
      'admin_id', p_admin_id,
      'credit_id', v_credit_id
    )
  );

  RAISE NOTICE 'Admin granted % credits to user %. New balance: %',
    p_amount, p_user_id, v_balance_after;

  RETURN v_credit_id;
END;
$$;

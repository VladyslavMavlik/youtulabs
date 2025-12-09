-- ============================================================================
-- Виправлення адмін функцій для роботи з новою системою балансів
-- ============================================================================
-- Проблема: Адмін функції використовують застарілі або неіснуючі функції
-- Рішення: Оновити всі адмін функції для роботи з user_credits
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Отримати активний баланс користувача
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_active_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Рахуємо з user_credits (активні, не прострочені)
  SELECT COALESCE(SUM(remaining), 0) INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
    AND expires_at > NOW()
    AND remaining > 0;

  RETURN v_balance;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Адмін встановлення балансу (ОНОВЛЕНА)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_set_balance(
  p_user_id UUID,
  p_new_balance INTEGER,
  p_reason TEXT DEFAULT 'Manual balance adjustment by admin',
  p_admin_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_difference INTEGER;
BEGIN
  -- Перевіряємо чи користувач існує
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Отримуємо поточний баланс
  v_balance_before := get_user_active_balance(p_user_id);
  v_difference := p_new_balance - v_balance_before;

  RAISE NOTICE 'Admin setting balance for user %. Current: %, Target: %, Difference: %',
    p_user_id, v_balance_before, p_new_balance, v_difference;

  -- Якщо баланс вже точний - нічого не робимо
  IF v_difference = 0 THEN
    RAISE NOTICE 'Balance already matches target, no changes needed';
    RETURN NULL;
  END IF;

  -- Якщо потрібно додати кредити
  IF v_difference > 0 THEN
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
      v_difference,
      'bonus',
      'admin_balance_' || gen_random_uuid()::TEXT,
      NOW() + INTERVAL '365 days',
      jsonb_build_object(
        'reason', p_reason,
        'admin_id', p_admin_id,
        'balance_adjustment', true,
        'old_balance', v_balance_before,
        'new_balance', p_new_balance,
        'adjusted_date', NOW()
      )
    )
    RETURNING id INTO v_credit_id;
  ELSE
    -- Якщо потрібно зняти кредити - використовуємо FIFO
    IF NOT consume_credits_fifo(
      p_user_id,
      ABS(v_difference),
      p_reason,
      jsonb_build_object(
        'admin_balance_adjustment', true,
        'reason', p_reason,
        'admin_id', p_admin_id,
        'old_balance', v_balance_before,
        'new_balance', p_new_balance
      )
    ) THEN
      RAISE EXCEPTION 'Insufficient balance to set to %. Current: %, Required: %',
        p_new_balance, v_balance_before, ABS(v_difference);
    END IF;
  END IF;

  -- Отримуємо новий баланс для підтвердження
  v_balance_after := get_user_active_balance(p_user_id);

  -- Синхронізуємо kv_store
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_balance_after::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_balance_after::TEXT::JSONB;

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
    v_difference,
    'adjustment',
    p_reason,
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'admin_adjustment', true,
      'admin_id', p_admin_id,
      'target_balance', p_new_balance,
      'actual_after', v_balance_after,
      'credit_id', v_credit_id
    )
  );

  RAISE NOTICE 'Admin set balance for user % from % to % (actual: %)',
    p_user_id, v_balance_before, p_new_balance, v_balance_after;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Адмін додавання кредитів (ОНОВЛЕНА)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_source TEXT DEFAULT 'bonus',
  p_reason TEXT DEFAULT 'Admin grant',
  p_expires_in_days INTEGER DEFAULT 30,
  p_admin_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Перевіряємо чи користувач існує
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Додаємо кредити в user_credits
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
    NOW() + (p_expires_in_days || ' days')::INTERVAL,
    jsonb_build_object(
      'reason', p_reason,
      'admin_id', p_admin_id,
      'granted_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  -- Отримуємо новий баланс
  v_new_balance := get_user_active_balance(p_user_id);

  -- Синхронізуємо kv_store
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- Логуємо
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
    'admin_grant',
    p_reason,
    v_new_balance - p_amount,
    v_new_balance,
    jsonb_build_object(
      'admin_id', p_admin_id,
      'credit_id', v_credit_id,
      'source', p_source,
      'expires_in_days', p_expires_in_days
    )
  );

  RAISE NOTICE 'Admin granted % credits to user %. New balance: %',
    p_amount, p_user_id, v_new_balance;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Адмін віднімання кредитів (ОНОВЛЕНА)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Admin deduction'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_success BOOLEAN;
BEGIN
  -- Перевіряємо чи користувач існує
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Віднімаємо через FIFO
  v_success := consume_credits_fifo(
    p_user_id,
    p_amount,
    p_reason,
    jsonb_build_object('admin_deduction', true)
  );

  IF NOT v_success THEN
    RAISE EXCEPTION 'Insufficient balance. User % has less than % credits',
      p_user_id, p_amount;
  END IF;

  RAISE NOTICE 'Admin deducted % credits from user %', p_amount, p_user_id;

  RETURN v_success;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Синхронізація підписочних кредитів (НОВА)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_sync_subscription_credits(
  p_user_id UUID,
  p_new_plan TEXT,
  p_reason TEXT DEFAULT 'Admin subscription adjustment'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_credits_amount INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_new_balance INTEGER;
BEGIN
  -- Визначаємо кількість кредитів за планом
  v_credits_amount := CASE p_new_plan
    WHEN 'starter' THEN 2000
    WHEN 'pro' THEN 6000
    WHEN 'ultimate' THEN 20000
    ELSE 0
  END;

  IF v_credits_amount = 0 THEN
    RAISE EXCEPTION 'Invalid plan: %', p_new_plan;
  END IF;

  v_expires_at := NOW() + INTERVAL '30 days';

  -- Додаємо кредити в user_credits
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
    v_credits_amount,
    'subscription',
    'admin_sub_' || gen_random_uuid()::TEXT,
    v_expires_at,
    jsonb_build_object(
      'plan_type', p_new_plan,
      'reason', p_reason,
      'admin_granted', true,
      'granted_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  -- Створюємо/оновлюємо підписку
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    expires_at
  )
  VALUES (
    p_user_id,
    p_new_plan,
    'active',
    NOW(),
    v_expires_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_new_plan,
    status = 'active',
    expires_at = v_expires_at,
    updated_at = NOW();

  -- Отримуємо новий баланс
  v_new_balance := get_user_active_balance(p_user_id);

  -- Синхронізуємо kv_store
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- Логуємо
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
    v_credits_amount,
    'subscription',
    p_reason,
    v_new_balance - v_credits_amount,
    v_new_balance,
    jsonb_build_object(
      'plan_type', p_new_plan,
      'credit_id', v_credit_id,
      'admin_granted', true,
      'expires_at', v_expires_at
    )
  );

  RAISE NOTICE 'Admin granted % plan (% credits) to user %. New balance: %',
    p_new_plan, v_credits_amount, p_user_id, v_new_balance;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Отримати детальну інформацію про кредити (НОВА)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_user_credit_details(p_user_id UUID)
RETURNS TABLE(
  credit_id UUID,
  amount INTEGER,
  consumed INTEGER,
  remaining INTEGER,
  source TEXT,
  source_id TEXT,
  granted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_expired BOOLEAN,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.id as credit_id,
    uc.amount,
    uc.consumed,
    uc.remaining,
    uc.source,
    uc.source_id,
    uc.granted_at,
    uc.expires_at,
    (uc.expires_at <= NOW()) as is_expired,
    uc.metadata
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  ORDER BY uc.expires_at ASC, uc.granted_at DESC;
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION get_user_active_balance IS 'Отримати активний баланс користувача з user_credits';
COMMENT ON FUNCTION admin_set_balance IS 'Адмін: Встановити точний баланс користувача';
COMMENT ON FUNCTION admin_grant_credits IS 'Адмін: Додати кредити користувачу';
COMMENT ON FUNCTION admin_deduct_credits IS 'Адмін: Відняти кредити у користувача';
COMMENT ON FUNCTION admin_sync_subscription_credits IS 'Адмін: Синхронізувати підписочні кредити';
COMMENT ON FUNCTION admin_get_user_credit_details IS 'Адмін: Отримати детальну інформацію про кредити користувача';

-- ============================================================================
-- Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_user_active_balance TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_balance TO service_role;
GRANT EXECUTE ON FUNCTION admin_grant_credits TO service_role;
GRANT EXECUTE ON FUNCTION admin_deduct_credits TO service_role;
GRANT EXECUTE ON FUNCTION admin_sync_subscription_credits TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_user_credit_details TO service_role;

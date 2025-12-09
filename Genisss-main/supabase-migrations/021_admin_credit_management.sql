-- ============================================================================
-- Admin Credit Management - Ручне керування кредитами адміністратором
-- ============================================================================
-- Використовується коли:
-- 1. Адмін вручну змінює підписку користувача в Dashboard
-- 2. Потрібно нарахувати компенсаційні кредити
-- 3. Потрібно виправити помилки в балансі
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Admin - ручне нарахування кредитів
-- ============================================================================
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

  -- Отримуємо поточний баланс
  v_balance_before := get_user_active_balance(p_user_id);

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
  v_balance_after := get_user_active_balance(p_user_id);

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

-- ============================================================================
-- ФУНКЦІЯ: Admin - синхронізація підписки (коли вручну змінюють план)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_sync_subscription_credits(
  p_user_id UUID,
  p_new_plan TEXT,
  p_reason TEXT DEFAULT 'Manual plan change by admin'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_monthly_credits INTEGER;
BEGIN
  -- Визначаємо кількість кредитів по плану
  CASE p_new_plan
    WHEN 'starter' THEN v_monthly_credits := 500;
    WHEN 'pro' THEN v_monthly_credits := 2000;
    WHEN 'ultimate' THEN v_monthly_credits := 10000;
    ELSE RAISE EXCEPTION 'Unknown plan type: %', p_new_plan;
  END CASE;

  -- Нараховуємо кредити
  SELECT admin_grant_credits(
    p_user_id,
    v_monthly_credits,
    'subscription',
    p_reason,
    30,
    NULL
  ) INTO v_credit_id;

  -- Оновлюємо підписку якщо існує
  UPDATE paddle_subscriptions
  SET
    plan_type = p_new_plan,
    monthly_credits = v_monthly_credits,
    last_credits_granted_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Якщо підписки немає - створюємо запис
  IF NOT FOUND THEN
    INSERT INTO paddle_subscriptions (
      user_id,
      paddle_subscription_id,
      paddle_customer_id,
      price_id,
      plan_type,
      status,
      monthly_credits,
      last_credits_granted_at,
      metadata
    )
    VALUES (
      p_user_id,
      'admin_manual_' || gen_random_uuid()::TEXT,
      NULL,
      'admin_manual',
      p_new_plan,
      'active',
      v_monthly_credits,
      NOW(),
      jsonb_build_object('manual_admin_grant', true, 'reason', p_reason)
    );
  END IF;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Admin - видалити кредити (коррекція помилок)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Manual admin deduction'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduction amount must be positive: %', p_amount;
  END IF;

  v_balance_before := get_user_active_balance(p_user_id);

  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Requested: %',
      v_balance_before, p_amount;
  END IF;

  -- Використовуємо існуючу функцію consume_credits
  PERFORM consume_credits(
    p_user_id,
    p_amount,
    jsonb_build_object(
      'admin_deduction', true,
      'reason', p_reason
    )
  );

  v_balance_after := get_user_active_balance(p_user_id);

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
    -p_amount,
    'deduction',
    p_reason,
    v_balance_before,
    v_balance_after,
    jsonb_build_object('admin_deduction', true)
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Admin - отримати повну інформацію про кредити користувача
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
    uc.id,
    uc.amount,
    uc.consumed,
    uc.remaining,
    uc.source,
    uc.source_id,
    uc.granted_at,
    uc.expires_at,
    uc.expires_at < NOW() as is_expired,
    uc.metadata
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  ORDER BY uc.expires_at ASC, uc.created_at ASC;
END;
$$;

-- Comments
COMMENT ON FUNCTION admin_grant_credits IS 'Admin: Ручне нарахування кредитів користувачу';
COMMENT ON FUNCTION admin_sync_subscription_credits IS 'Admin: Синхронізація кредитів при зміні плану';
COMMENT ON FUNCTION admin_deduct_credits IS 'Admin: Видалення кредитів (корекція помилок)';
COMMENT ON FUNCTION admin_get_user_credit_details IS 'Admin: Детальна інформація про всі кредити користувача';

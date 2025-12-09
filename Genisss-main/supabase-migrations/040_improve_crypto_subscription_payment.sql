-- ============================================================================
-- Покращення функції process_crypto_subscription_payment
-- ============================================================================
-- Зміни:
-- 1. Додає кредити в kv_store (основний баланс користувача)
-- 2. Покращена обробка помилок
-- 3. Atomic операції
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Обробка криптовалютної підписки (ПОКРАЩЕНА)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_crypto_subscription_payment(
  p_payment_id TEXT,
  p_user_id UUID,
  p_plan_type TEXT,
  p_credits_amount INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Перевіряємо чи платіж вже оброблений (idempotency)
  IF EXISTS (
    SELECT 1 FROM crypto_payments
    WHERE payment_id = p_payment_id AND processed = TRUE
  ) THEN
    -- Повертаємо існуючий credit_id замість помилки
    SELECT id INTO v_credit_id
    FROM crypto_subscription_credits
    WHERE payment_id = p_payment_id
    LIMIT 1;

    RAISE NOTICE 'Payment already processed: %, returning existing credit_id: %',
      p_payment_id, v_credit_id;

    RETURN v_credit_id;
  END IF;

  -- Встановлюємо термін дії: 30 днів від зараз
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Створюємо запис підписочних кредитів (що згорають)
  INSERT INTO crypto_subscription_credits (
    user_id,
    payment_id,
    plan_type,
    amount,
    expires_at
  )
  VALUES (
    p_user_id,
    p_payment_id,
    p_plan_type,
    p_credits_amount,
    v_expires_at
  )
  RETURNING id INTO v_credit_id;

  -- Оновлюємо crypto_payments
  UPDATE crypto_payments
  SET
    subscription_expires_at = v_expires_at,
    subscription_credits_granted = p_credits_amount,
    processed = TRUE,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE payment_id = p_payment_id;

  -- Створюємо/оновлюємо підписку в user_subscriptions
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    expires_at
  )
  VALUES (
    p_user_id,
    p_plan_type,
    'active',
    NOW(),
    v_expires_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_plan_type,
    status = 'active',
    expires_at = v_expires_at,
    updated_at = NOW();

  -- ========================================================================
  -- ВАЖЛИВО: Додаємо кредити в kv_store (основний баланс користувача)
  -- ========================================================================
  -- Отримуємо поточний баланс з kv_store
  SELECT COALESCE(value::INTEGER, 0) INTO v_current_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance';

  -- Якщо запису немає - встановлюємо 0
  IF NOT FOUND THEN
    v_current_balance := 0;
  END IF;

  -- Розраховуємо новий баланс
  v_new_balance := v_current_balance + p_credits_amount;

  -- Оновлюємо баланс в kv_store
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- Логування в balance_transactions для аудиту
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
    p_credits_amount,
    'subscription',
    format('Crypto subscription: %s plan', p_plan_type),
    v_current_balance,
    v_new_balance,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'plan_type', p_plan_type,
      'expires_at', v_expires_at,
      'payment_method', 'crypto',
      'credit_id', v_credit_id
    )
  );

  RAISE NOTICE 'Crypto subscription processed: user=%, plan=%, credits=%, balance: % → %',
    p_user_id, p_plan_type, p_credits_amount, v_current_balance, v_new_balance;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Отримати баланс користувача з kv_store
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_balance_from_kv(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(value::INTEGER, 0) INTO v_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance';

  -- Якщо не знайдено - повертаємо 0
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  RETURN v_balance;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Отримати детальний баланс (з розбивкою по типах)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_detailed_balance(p_user_id UUID)
RETURNS TABLE(
  total_balance INTEGER,
  subscription_credits INTEGER,
  permanent_credits INTEGER,
  active_subscriptions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_balance INTEGER;
  v_subscription_credits INTEGER;
BEGIN
  -- Загальний баланс з kv_store
  v_total_balance := get_user_balance_from_kv(p_user_id);

  -- Підписочні кредити (активні, не прострочені)
  SELECT COALESCE(SUM(remaining), 0) INTO v_subscription_credits
  FROM crypto_subscription_credits
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW()
    AND remaining > 0;

  RETURN QUERY
  SELECT
    v_total_balance as total_balance,
    v_subscription_credits as subscription_credits,
    v_total_balance - v_subscription_credits as permanent_credits,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'plan_type', plan_type,
          'amount', amount,
          'remaining', remaining,
          'expires_at', expires_at
        )
      )
      FROM crypto_subscription_credits
      WHERE user_id = p_user_id
        AND status = 'active'
        AND expires_at > NOW()
        AND remaining > 0
    ) as active_subscriptions;
END;
$$;

-- Comments
COMMENT ON FUNCTION process_crypto_subscription_payment IS 'Обробка криптовалютної підписки з додаванням кредитів в kv_store';
COMMENT ON FUNCTION get_user_balance_from_kv IS 'Отримати баланс користувача з kv_store';
COMMENT ON FUNCTION get_user_detailed_balance IS 'Отримати детальний баланс з розбивкою по типах кредитів';

-- Grants
GRANT EXECUTE ON FUNCTION get_user_balance_from_kv TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_detailed_balance TO authenticated;

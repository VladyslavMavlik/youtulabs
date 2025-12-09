-- ============================================================================
-- Виправлення функції process_crypto_subscription_payment
-- ============================================================================
-- Проблема: Функція намагається писати в неіснуючі колонки user_subscriptions
-- Рішення: Використовувати тільки існуючі колонки таблиці
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
  v_new_balance INTEGER;
BEGIN
  -- Перевіряємо чи платіж вже оброблений (idempotency)
  IF EXISTS (
    SELECT 1 FROM crypto_payments
    WHERE payment_id = p_payment_id AND processed = TRUE
  ) THEN
    -- Повертаємо існуючий credit_id
    SELECT id INTO v_credit_id
    FROM user_credits
    WHERE source = 'crypto' AND source_id = p_payment_id
    LIMIT 1;

    -- Якщо не знайдено в user_credits, шукаємо в старій таблиці
    IF v_credit_id IS NULL THEN
      SELECT id INTO v_credit_id
      FROM crypto_subscription_credits
      WHERE payment_id = p_payment_id
      LIMIT 1;
    END IF;

    RAISE NOTICE 'Payment already processed: %, returning existing credit_id: %',
      p_payment_id, v_credit_id;

    RETURN v_credit_id;
  END IF;

  -- Встановлюємо термін дії: 30 днів від зараз
  v_expires_at := NOW() + INTERVAL '30 days';

  -- ========================================================================
  -- ГОЛОВНЕ: Додаємо кредити в user_credits (єдина система!)
  -- ========================================================================
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
    p_credits_amount,
    'crypto',
    p_payment_id,
    v_expires_at,
    jsonb_build_object(
      'plan_type', p_plan_type,
      'payment_method', 'crypto',
      'payment_id', p_payment_id
    )
  )
  RETURNING id INTO v_credit_id;

  -- Також додаємо в crypto_subscription_credits для backwards compatibility
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
  ON CONFLICT DO NOTHING;

  -- Оновлюємо crypto_payments
  UPDATE crypto_payments
  SET
    subscription_expires_at = v_expires_at,
    subscription_credits_granted = p_credits_amount,
    processed = TRUE,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE payment_id = p_payment_id;

  -- ========================================================================
  -- Створюємо/оновлюємо підписку в user_subscriptions
  -- ТІЛЬКИ ІСНУЮЧІ КОЛОНКИ! (без platform, current_period_start/end)
  -- ========================================================================
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
    started_at = CASE
      WHEN user_subscriptions.plan_id != p_plan_type THEN NOW()
      ELSE user_subscriptions.started_at
    END,
    expires_at = v_expires_at,
    updated_at = NOW();

  -- ========================================================================
  -- Синхронізація з kv_store (backwards compatibility)
  -- ========================================================================
  SELECT COALESCE(SUM(remaining), 0) INTO v_new_balance
  FROM user_credits
  WHERE user_id = p_user_id
    AND expires_at > NOW()
    AND remaining > 0;

  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- Логування в balance_transactions
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
    v_new_balance - p_credits_amount,
    v_new_balance,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'plan_type', p_plan_type,
      'expires_at', v_expires_at,
      'payment_method', 'crypto',
      'credit_id', v_credit_id
    )
  );

  RAISE NOTICE 'Crypto subscription processed: user=%, plan=%, credits=%, new_balance=%',
    p_user_id, p_plan_type, p_credits_amount, v_new_balance;

  RETURN v_credit_id;
END;
$$;

COMMENT ON FUNCTION process_crypto_subscription_payment IS
'Обробка криптовалютної підписки з додаванням в user_credits (єдина система з Paddle)';

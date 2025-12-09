-- ============================================================================
-- Інтеграція crypto payments в єдину систему балансів
-- ============================================================================
-- РІШЕННЯ: Використовуємо існуючу таблицю user_credits (як Paddle),
--           замість паралельної системи kv_store + crypto_subscription_credits
-- ============================================================================
-- Переваги:
-- 1. Єдина система балансів (Paddle + Crypto)
-- 2. VIEW user_balances автоматично рахує баланс
-- 3. FIFO вже реалізоване в існуючих функціях
-- 4. Безпека і надійність через перевірені функції
-- ============================================================================

-- ============================================================================
-- КРОК 1: Розширити source types в user_credits
-- ============================================================================
-- Додаємо 'crypto' до дозволених типів джерел кредитів
-- ============================================================================
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_source_check;
ALTER TABLE user_credits
ADD CONSTRAINT user_credits_source_check
CHECK (source IN ('purchase', 'subscription', 'bonus', 'initial', 'crypto'));

COMMENT ON CONSTRAINT user_credits_source_check ON user_credits IS
'Дозволені джерела кредитів: purchase, subscription (Paddle), crypto, bonus, initial';

-- ============================================================================
-- КРОК 2: Покращена функція обробки crypto підписки
-- ============================================================================
-- Додає кредити в user_credits (єдина система з Paddle)
-- Синхронізує з kv_store для backwards compatibility
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
    'crypto',                         -- ⭐ CRYPTO SOURCE
    p_payment_id,                     -- source_id = payment_id
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
  ON CONFLICT DO NOTHING;  -- Може вже існувати

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
    platform,
    status,
    current_period_start,
    current_period_end,
    started_at,
    expires_at
  )
  VALUES (
    p_user_id,
    p_plan_type,
    'crypto',
    'active',
    NOW(),
    v_expires_at,
    NOW(),
    v_expires_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_plan_type,
    platform = 'crypto',
    status = 'active',
    current_period_start = NOW(),
    current_period_end = v_expires_at,
    expires_at = v_expires_at,
    updated_at = NOW();

  -- ========================================================================
  -- Синхронізація з kv_store (backwards compatibility)
  -- ========================================================================
  -- Рахуємо баланс з user_credits (джерело істини)
  SELECT COALESCE(SUM(remaining), 0) INTO v_new_balance
  FROM user_credits
  WHERE user_id = p_user_id
    AND expires_at > NOW()
    AND remaining > 0;

  -- Оновлюємо kv_store
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

-- ============================================================================
-- КРОК 3: Міграція існуючих crypto кредитів в user_credits
-- ============================================================================
-- Переносимо всі активні crypto_subscription_credits в user_credits
-- ============================================================================
DO $$
DECLARE
  v_crypto_credit RECORD;
  v_migrated_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting migration of crypto credits to user_credits...';

  FOR v_crypto_credit IN
    SELECT *
    FROM crypto_subscription_credits
    WHERE status = 'active'
      AND expires_at > NOW()
      AND remaining > 0
    ORDER BY created_at ASC
  LOOP
    -- Перевіряємо чи вже мігровано
    IF EXISTS (
      SELECT 1 FROM user_credits
      WHERE source = 'crypto'
        AND source_id = v_crypto_credit.payment_id
        AND user_id = v_crypto_credit.user_id
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      RAISE NOTICE 'Skipped (already exists): payment_id=%', v_crypto_credit.payment_id;
      CONTINUE;
    END IF;

    -- Додаємо в user_credits
    INSERT INTO user_credits (
      user_id,
      amount,
      source,
      source_id,
      expires_at,
      consumed,
      granted_at,
      metadata
    )
    VALUES (
      v_crypto_credit.user_id,
      v_crypto_credit.amount,
      'crypto',
      v_crypto_credit.payment_id,
      v_crypto_credit.expires_at,
      v_crypto_credit.consumed,
      v_crypto_credit.created_at,
      jsonb_build_object(
        'plan_type', v_crypto_credit.plan_type,
        'payment_method', 'crypto',
        'payment_id', v_crypto_credit.payment_id,
        'migrated_from', 'crypto_subscription_credits'
      )
    );

    v_migrated_count := v_migrated_count + 1;
    RAISE NOTICE 'Migrated: user=%, amount=%, remaining=%, expires=%',
      v_crypto_credit.user_id,
      v_crypto_credit.amount,
      v_crypto_credit.remaining,
      v_crypto_credit.expires_at;
  END LOOP;

  RAISE NOTICE 'Migration complete: % credits migrated, % skipped',
    v_migrated_count, v_skipped_count;
END;
$$;

-- ============================================================================
-- КРОК 4: Синхронізація балансів в kv_store
-- ============================================================================
-- Оновлюємо kv_store балансами з user_credits (джерело істини)
-- ============================================================================
DO $$
DECLARE
  v_user RECORD;
  v_synced_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting kv_store balance synchronization...';

  FOR v_user IN
    SELECT
      user_id,
      COALESCE(SUM(remaining), 0) as total_balance
    FROM user_credits
    WHERE expires_at > NOW()
      AND remaining > 0
    GROUP BY user_id
  LOOP
    -- Оновлюємо kv_store
    INSERT INTO kv_store_7f10f791 (key, value)
    VALUES ('user:' || v_user.user_id || ':balance', v_user.total_balance::TEXT::JSONB)
    ON CONFLICT (key)
    DO UPDATE SET value = v_user.total_balance::TEXT::JSONB;

    v_synced_count := v_synced_count + 1;

    IF v_synced_count <= 5 THEN
      RAISE NOTICE 'Synced user %: balance=%', v_user.user_id, v_user.total_balance;
    END IF;
  END LOOP;

  RAISE NOTICE 'Balance synchronization complete: % users synced', v_synced_count;
END;
$$;

-- ============================================================================
-- КРОК 5: Оновити функцію згорання кредитів
-- ============================================================================
-- Використовуємо user_credits як джерело істини
-- ============================================================================
DROP FUNCTION IF EXISTS expire_crypto_subscriptions();

CREATE FUNCTION expire_crypto_subscriptions()
RETURNS TABLE(
  user_id UUID,
  expired_credits INTEGER,
  balance_after INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_expired_count INTEGER := 0;
BEGIN
  -- Маркуємо прострочені кредити в user_credits
  -- (consumed автоматично стане = amount через FIFO)
  -- Згорання відбувається автоматично через VIEW user_active_credits
  -- який фільтрує по expires_at > NOW()

  -- Оновлюємо crypto_subscription_credits для backwards compatibility
  UPDATE crypto_subscription_credits
  SET
    status = 'expired',
    updated_at = NOW()
  WHERE status = 'active'
    AND expires_at <= NOW();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Синхронізуємо баланси в kv_store
  FOR v_user IN
    SELECT
      uc.user_id,
      COALESCE(SUM(uc.remaining), 0) as new_balance
    FROM user_credits uc
    WHERE uc.expires_at > NOW()
      AND uc.remaining > 0
    GROUP BY uc.user_id
  LOOP
    -- Оновлюємо kv_store
    INSERT INTO kv_store_7f10f791 (key, value)
    VALUES ('user:' || v_user.user_id || ':balance', v_user.new_balance::TEXT::JSONB)
    ON CONFLICT (key)
    DO UPDATE SET value = v_user.new_balance::TEXT::JSONB;
  END LOOP;

  RAISE NOTICE 'Expired % crypto subscription records', v_expired_count;

  -- Повертаємо список користувачів з оновленими балансами
  RETURN QUERY
  SELECT
    uc.user_id,
    0 as expired_credits,  -- Тепер згорання автоматичне через VIEW
    COALESCE(SUM(uc.remaining), 0)::INTEGER as balance_after
  FROM user_credits uc
  WHERE uc.expires_at > NOW()
    AND uc.remaining > 0
  GROUP BY uc.user_id;
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION process_crypto_subscription_payment IS
'Обробка криптовалютної підписки з додаванням в user_credits (єдина система з Paddle)';

COMMENT ON FUNCTION expire_crypto_subscriptions IS
'Згорання прострочених crypto підписок (автоматично через VIEW)';

-- ============================================================================
-- ГОТОВО!
-- ============================================================================
-- Тепер crypto та Paddle використовують ЄДИНУ систему балансів:
-- - user_credits (базова таблиця)
-- - user_active_credits (VIEW з SUM)
-- - user_balances (VIEW для фронтенду)
--
-- Переваги:
-- ✅ Єдине джерело істини
-- ✅ VIEW автоматично рахує баланс
-- ✅ FIFO через існуючі функції
-- ✅ Backwards compatibility з kv_store
-- ============================================================================

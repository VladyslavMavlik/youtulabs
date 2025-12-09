-- ============================================================================
-- Синхронізація user_balances з crypto payments
-- ============================================================================
-- Проблема: process_crypto_subscription_payment оновлює тільки kv_store,
--           але фронтенд читає з user_balances
-- Рішення: Оновити функції щоб вони писали в ОБИ таблиці одночасно
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Покращена обробка криптовалютної підписки
-- ============================================================================
-- Тепер оновлює ТА kv_store ТА user_balances одночасно
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
    'crypto',                    -- ⭐ ДОДАНО platform
    'active',
    NOW(),                        -- ⭐ ДОДАНО current_period_start
    v_expires_at,                 -- ⭐ ДОДАНО current_period_end
    NOW(),
    v_expires_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_plan_type,
    platform = 'crypto',          -- ⭐ ДОДАНО platform
    status = 'active',
    current_period_start = NOW(), -- ⭐ ДОДАНО current_period_start
    current_period_end = v_expires_at, -- ⭐ ДОДАНО current_period_end
    expires_at = v_expires_at,
    updated_at = NOW();

  -- ========================================================================
  -- ОНОВЛЕННЯ 1: kv_store (основний баланс - для системи)
  -- ========================================================================
  SELECT COALESCE(value::INTEGER, 0) INTO v_current_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance';

  IF NOT FOUND THEN
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_credits_amount;

  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- ========================================================================
  -- ОНОВЛЕННЯ 2: user_balances (для фронтенду) ⭐ НОВИЙ КОД
  -- ========================================================================
  INSERT INTO user_balances (user_id, balance)
  VALUES (p_user_id, v_new_balance)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();

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
-- ФУНКЦІЯ: Покращене FIFO списання
-- ============================================================================
-- Тепер оновлює ТА kv_store ТА user_balances одночасно
-- ============================================================================
CREATE OR REPLACE FUNCTION consume_credits_fifo(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit consumption',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_remaining_to_consume INTEGER;
  v_subscription_credit RECORD;
  v_consumed_from_sub INTEGER;
  v_total_consumed_from_subs INTEGER := 0;
  v_consumed_from_permanent INTEGER;
BEGIN
  -- Lock баланс в kv_store (FOR UPDATE)
  SELECT COALESCE(value::INTEGER, 0) INTO v_current_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance'
  FOR UPDATE;

  -- Якщо не знайдено - отримуємо з user_balances
  IF NOT FOUND THEN
    SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM user_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_current_balance := 0;
    END IF;
  END IF;

  -- Перевіряємо чи достатньо балансу
  IF v_current_balance < p_amount THEN
    RAISE NOTICE 'Insufficient balance: user=%, required=%, available=%',
      p_user_id, p_amount, v_current_balance;
    RETURN FALSE;
  END IF;

  v_remaining_to_consume := p_amount;

  -- ========================================================================
  -- КРОК 1: FIFO списання з підписочних кредитів (oldest first!)
  -- ========================================================================
  FOR v_subscription_credit IN
    SELECT *
    FROM crypto_subscription_credits
    WHERE user_id = p_user_id
      AND status = 'active'
      AND expires_at > NOW()
      AND remaining > 0
    ORDER BY expires_at ASC  -- ⭐ OLDEST FIRST = FIFO
    FOR UPDATE
  LOOP
    -- Скільки можемо взяти з цієї підписки
    v_consumed_from_sub := LEAST(v_subscription_credit.remaining, v_remaining_to_consume);

    -- Оновлюємо запис підписки
    UPDATE crypto_subscription_credits
    SET
      consumed = consumed + v_consumed_from_sub,
      remaining = remaining - v_consumed_from_sub,
      status = CASE
        WHEN (remaining - v_consumed_from_sub) <= 0 THEN 'consumed'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = v_subscription_credit.id;

    v_total_consumed_from_subs := v_total_consumed_from_subs + v_consumed_from_sub;
    v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_sub;

    RAISE NOTICE 'Consumed % from subscription % (expires: %)',
      v_consumed_from_sub, v_subscription_credit.id, v_subscription_credit.expires_at;

    -- Якщо вже списали все - виходимо
    IF v_remaining_to_consume <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Якщо залишилось щось списати - це permanent credits
  v_consumed_from_permanent := v_remaining_to_consume;

  -- Розраховуємо новий баланс
  v_new_balance := v_current_balance - p_amount;

  -- ========================================================================
  -- КРОК 2: Оновлюємо kv_store
  -- ========================================================================
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- ========================================================================
  -- КРОК 3: Оновлюємо user_balances ⭐ НОВИЙ КОД
  -- ========================================================================
  INSERT INTO user_balances (user_id, balance)
  VALUES (p_user_id, v_new_balance)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();

  -- ========================================================================
  -- КРОК 4: Логування транзакції
  -- ========================================================================
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
    -p_amount,  -- Від'ємне значення
    'consumption',
    p_description,
    v_current_balance,
    v_new_balance,
    jsonb_build_object(
      'consumed_from_subscriptions', v_total_consumed_from_subs,
      'consumed_from_permanent', v_consumed_from_permanent,
      'original_metadata', p_metadata
    )
  );

  RAISE NOTICE 'Credits consumed: user=%, amount=%, balance: % → % (subs: %, permanent: %)',
    p_user_id, p_amount, v_current_balance, v_new_balance,
    v_total_consumed_from_subs, v_consumed_from_permanent;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Синхронізація балансів (одноразово)
-- ============================================================================
-- Синхронізує всі баланси з kv_store до user_balances
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_user_balances_from_kv()
RETURNS TABLE(
  user_id UUID,
  old_balance INTEGER,
  new_balance INTEGER,
  synced BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH kv_balances AS (
    SELECT
      REPLACE(REPLACE(key, 'user:', ''), ':balance', '')::UUID as uid,
      (value)::INTEGER as kv_balance
    FROM kv_store_7f10f791
    WHERE key LIKE 'user:%:balance'
  )
  UPDATE user_balances ub
  SET
    balance = kb.kv_balance,
    updated_at = NOW()
  FROM kv_balances kb
  WHERE ub.user_id = kb.uid
    AND ub.balance != kb.kv_balance  -- Тільки якщо різні
  RETURNING
    ub.user_id,
    ub.balance as old_balance,
    kb.kv_balance as new_balance,
    TRUE as synced;
END;
$$;

-- ============================================================================
-- Виконуємо синхронізацію ЗАРАЗ (одноразово)
-- ============================================================================
DO $$
DECLARE
  v_sync_result RECORD;
  v_synced_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting balance synchronization...';

  FOR v_sync_result IN
    SELECT * FROM sync_user_balances_from_kv()
  LOOP
    v_synced_count := v_synced_count + 1;
    RAISE NOTICE 'Synced user %: % → %',
      v_sync_result.user_id,
      v_sync_result.old_balance,
      v_sync_result.new_balance;
  END LOOP;

  RAISE NOTICE 'Balance synchronization complete: % users updated', v_synced_count;
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION process_crypto_subscription_payment IS 'Обробка криптовалютної підписки з синхронізацією kv_store та user_balances';
COMMENT ON FUNCTION consume_credits_fifo IS 'FIFO списання кредитів з синхронізацією kv_store та user_balances';
COMMENT ON FUNCTION sync_user_balances_from_kv IS 'Синхронізація балансів з kv_store до user_balances';

-- ============================================================================
-- Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION sync_user_balances_from_kv TO service_role;

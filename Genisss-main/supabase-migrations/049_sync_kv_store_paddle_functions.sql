-- ============================================================================
-- Додаємо синхронізацію kv_store в Paddle функції
-- ============================================================================
-- Проблема: grant_subscription_credits та process_credit_purchase не синхронізують kv_store
-- Рішення: Додати синхронізацію в кінці функцій
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Обробка покупки кредитів (ОНОВЛЕНА з синхронізацією kv_store)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_credit_purchase(
  p_paddle_transaction_id TEXT,
  p_user_id UUID,
  p_credits INTEGER,
  p_bonus INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_total_credits INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_new_balance INTEGER;
BEGIN
  -- Перевіряємо чи транзакція вже оброблена
  IF EXISTS (SELECT 1 FROM user_credits WHERE source_id = p_paddle_transaction_id) THEN
    RAISE EXCEPTION 'Transaction already processed: %', p_paddle_transaction_id;
  END IF;

  v_total_credits := p_credits + p_bonus;
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Створюємо запис кредитів
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
    v_total_credits,
    'purchase',
    p_paddle_transaction_id,
    v_expires_at,
    p_metadata || jsonb_build_object(
      'base_credits', p_credits,
      'bonus_credits', p_bonus,
      'purchase_date', NOW()
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

  -- Логуємо в balance_transactions для сумісності
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
    v_total_credits,
    'purchase',
    format('Purchased %s credits (+%s bonus)', p_credits, p_bonus),
    v_new_balance - v_total_credits,
    v_new_balance,
    p_metadata
  );

  RAISE NOTICE 'Paddle purchase processed: user=%, credits=%, new_balance=%',
    p_user_id, v_total_credits, v_new_balance;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Обробка підписки - нарахування кредитів (ОНОВЛЕНА з синхронізацією kv_store)
-- ============================================================================
CREATE OR REPLACE FUNCTION grant_subscription_credits(
  p_paddle_subscription_id TEXT,
  p_user_id UUID,
  p_plan_type TEXT,
  p_period_start TIMESTAMP WITH TIME ZONE,
  p_period_end TIMESTAMP WITH TIME ZONE,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_credits_amount INTEGER;
  v_source_id TEXT;
  v_new_balance INTEGER;
BEGIN
  -- Визначаємо кількість кредитів за планом
  v_credits_amount := CASE p_plan_type
    WHEN 'starter' THEN 2000
    WHEN 'pro' THEN 6000
    WHEN 'ultimate' THEN 20000
    ELSE 0
  END;

  IF v_credits_amount = 0 THEN
    RAISE EXCEPTION 'Invalid subscription plan: %', p_plan_type;
  END IF;

  -- Генеруємо унікальний source_id для періоду
  v_source_id := p_paddle_subscription_id || '_' || EXTRACT(EPOCH FROM p_period_start)::TEXT;

  -- Перевіряємо чи кредити за цей період вже нараховані
  IF EXISTS (SELECT 1 FROM user_credits WHERE source_id = v_source_id) THEN
    RAISE NOTICE 'Credits already granted for period: %', v_source_id;
    RETURN NULL;
  END IF;

  -- Створюємо запис кредитів
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
    v_source_id,
    p_period_end,
    p_metadata || jsonb_build_object(
      'plan_type', p_plan_type,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'paddle_subscription_id', p_paddle_subscription_id
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
    v_credits_amount,
    'subscription',
    format('Subscription credits: %s plan', p_plan_type),
    v_new_balance - v_credits_amount,
    v_new_balance,
    p_metadata
  );

  RAISE NOTICE 'Paddle subscription credits granted: user=%, plan=%, credits=%, new_balance=%',
    p_user_id, p_plan_type, v_credits_amount, v_new_balance;

  RETURN v_credit_id;
END;
$$;

COMMENT ON FUNCTION process_credit_purchase IS
'Обробка покупки кредитів через Paddle з синхронізацією kv_store';

COMMENT ON FUNCTION grant_subscription_credits IS
'Нарахування підписочних кредитів через Paddle з синхронізацією kv_store';

-- ============================================================================
-- FIFO система списання кредитів
-- ============================================================================
-- Логіка:
-- 1. Спочатку списуються підписочні кредити (що згорають) - старіші першими
-- 2. Потім списуються вічні кредити (якщо підписочних не вистачає)
-- 3. Atomic операції з lock'ами
-- ============================================================================

-- ============================================================================
-- ФУНКЦІЯ: Списати кредити з FIFO пріоритетом
-- ============================================================================
-- Повертає: TRUE якщо успішно, FALSE якщо недостатньо кредитів
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
BEGIN
  -- Перевіряємо що amount > 0
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;

  -- Отримуємо поточний баланс з kv_store (з блокуванням)
  SELECT COALESCE(value::INTEGER, 0) INTO v_current_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance'
  FOR UPDATE;

  -- Якщо запису немає - створюємо з балансом 0
  IF NOT FOUND THEN
    INSERT INTO kv_store_7f10f791 (key, value)
    VALUES ('user:' || p_user_id || ':balance', '0'::JSONB);
    v_current_balance := 0;
  END IF;

  -- Перевіряємо чи достатньо кредитів
  IF v_current_balance < p_amount THEN
    RAISE NOTICE 'Insufficient balance: user=%, balance=%, required=%',
      p_user_id, v_current_balance, p_amount;
    RETURN FALSE;
  END IF;

  v_remaining_to_consume := p_amount;

  -- ========================================================================
  -- КРОК 1: Списуємо з підписочних кредитів (FIFO - старіші першими)
  -- ========================================================================
  FOR v_subscription_credit IN
    SELECT *
    FROM crypto_subscription_credits
    WHERE user_id = p_user_id
      AND status = 'active'
      AND expires_at > NOW()
      AND remaining > 0
    ORDER BY expires_at ASC -- FIFO: старіші згорають першими
    FOR UPDATE
  LOOP
    -- Скільки можемо списати з цього підписочного кредиту
    v_consumed_from_sub := LEAST(v_subscription_credit.remaining, v_remaining_to_consume);

    -- Оновлюємо запис
    UPDATE crypto_subscription_credits
    SET
      consumed = consumed + v_consumed_from_sub,
      status = CASE
        WHEN (consumed + v_consumed_from_sub) >= amount THEN 'consumed'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = v_subscription_credit.id;

    v_total_consumed_from_subs := v_total_consumed_from_subs + v_consumed_from_sub;
    v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_sub;

    RAISE NOTICE 'Consumed % credits from subscription credit %',
      v_consumed_from_sub, v_subscription_credit.id;

    -- Якщо все списали - виходимо
    IF v_remaining_to_consume <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- ========================================================================
  -- КРОК 2: Віднімаємо загальну суму з kv_store (основний баланс)
  -- ========================================================================
  v_new_balance := v_current_balance - p_amount;

  UPDATE kv_store_7f10f791
  SET value = v_new_balance::TEXT::JSONB
  WHERE key = 'user:' || p_user_id || ':balance';

  -- ========================================================================
  -- КРОК 3: Логування транзакції
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
    -p_amount, -- Негативна сума (списання)
    'consumption',
    p_description,
    v_current_balance,
    v_new_balance,
    jsonb_build_object(
      'consumed_from_subscriptions', v_total_consumed_from_subs,
      'consumed_from_permanent', p_amount - v_total_consumed_from_subs,
      'metadata', p_metadata
    )
  );

  RAISE NOTICE 'Credits consumed: user=%, total=%, from_subs=%, from_permanent=%, balance: % → %',
    p_user_id, p_amount, v_total_consumed_from_subs,
    p_amount - v_total_consumed_from_subs,
    v_current_balance, v_new_balance;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Спробувати списати кредити (не викидає помилку)
-- ============================================================================
CREATE OR REPLACE FUNCTION try_consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit consumption',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_success BOOLEAN;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  v_balance_before := get_user_balance_from_kv(p_user_id);

  v_success := consume_credits_fifo(
    p_user_id,
    p_amount,
    p_description,
    p_metadata
  );

  v_balance_after := get_user_balance_from_kv(p_user_id);

  RETURN jsonb_build_object(
    'success', v_success,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'amount_consumed', CASE WHEN v_success THEN p_amount ELSE 0 END
  );
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Додати кредити (для адмінів або покупок)
-- ============================================================================
CREATE OR REPLACE FUNCTION add_permanent_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credits added',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;

  -- Отримуємо поточний баланс
  SELECT COALESCE(value::INTEGER, 0) INTO v_current_balance
  FROM kv_store_7f10f791
  WHERE key = 'user:' || p_user_id || ':balance'
  FOR UPDATE;

  IF NOT FOUND THEN
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Оновлюємо баланс
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- Логування
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
    'credit_purchase',
    p_description,
    v_current_balance,
    v_new_balance,
    p_metadata
  );

  RAISE NOTICE 'Permanent credits added: user=%, amount=%, balance: % → %',
    p_user_id, p_amount, v_current_balance, v_new_balance;

  RETURN v_new_balance;
END;
$$;

-- ============================================================================
-- ТРИГЕР: Автоматично маркувати crypto_subscription_credits як consumed
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_mark_subscription_consumed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consumed >= NEW.amount AND NEW.status = 'active' THEN
    NEW.status := 'consumed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crypto_subscription_credits_auto_consumed ON crypto_subscription_credits;
CREATE TRIGGER crypto_subscription_credits_auto_consumed
  BEFORE UPDATE ON crypto_subscription_credits
  FOR EACH ROW
  EXECUTE FUNCTION auto_mark_subscription_consumed();

-- Comments
COMMENT ON FUNCTION consume_credits_fifo IS 'Списати кредити з FIFO пріоритетом (спочатку підписочні, потім вічні)';
COMMENT ON FUNCTION try_consume_credits IS 'Спробувати списати кредити (повертає результат без помилки)';
COMMENT ON FUNCTION add_permanent_credits IS 'Додати вічні кредити (не згорають)';

-- Grants
GRANT EXECUTE ON FUNCTION consume_credits_fifo TO authenticated;
GRANT EXECUTE ON FUNCTION try_consume_credits TO authenticated;
GRANT EXECUTE ON FUNCTION add_permanent_credits TO service_role;

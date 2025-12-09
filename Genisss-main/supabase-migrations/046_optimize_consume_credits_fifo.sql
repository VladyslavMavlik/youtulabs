-- ============================================================================
-- Оптимізація consume_credits_fifo для швидкого списання великих сум
-- ============================================================================
-- Проблема: FOR LOOP дуже повільний при списанні великої кількості кредитів
-- Рішення: Використовувати CTE та batch UPDATE замість циклу
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
    SELECT COALESCE(SUM(remaining), 0) INTO v_current_balance
    FROM user_credits
    WHERE user_id = p_user_id
      AND expires_at > NOW()
      AND remaining > 0
    FOR UPDATE;

    IF v_current_balance = 0 THEN
      RAISE NOTICE 'Insufficient balance: user=%, required=%, available=0',
        p_user_id, p_amount;
      RETURN FALSE;
    END IF;
  END IF;

  -- Перевіряємо чи достатньо балансу
  IF v_current_balance < p_amount THEN
    RAISE NOTICE 'Insufficient balance: user=%, required=%, available=%',
      p_user_id, p_amount, v_current_balance;
    RETURN FALSE;
  END IF;

  -- ========================================================================
  -- ОПТИМІЗАЦІЯ: Batch UPDATE замість FOR LOOP
  -- ========================================================================
  -- Використовуємо CTE для розрахунку скільки списати з кожного кредиту
  WITH credits_to_consume AS (
    SELECT
      id,
      remaining,
      expires_at,
      -- Розраховуємо running sum для FIFO
      SUM(remaining) OVER (ORDER BY expires_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_total,
      -- Розраховуємо скільки треба списати з цього кредиту
      CASE
        WHEN SUM(remaining) OVER (ORDER BY expires_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) <= p_amount
          THEN remaining  -- Списуємо весь кредит
        WHEN SUM(remaining) OVER (ORDER BY expires_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) < p_amount
          THEN p_amount - COALESCE(SUM(remaining) OVER (ORDER BY expires_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)  -- Списуємо частину
        ELSE 0  -- Не треба списувати з цього кредиту
      END as to_consume
    FROM user_credits
    WHERE user_id = p_user_id
      AND expires_at > NOW()
      AND remaining > 0
    ORDER BY expires_at ASC
  ),
  updated_credits AS (
    UPDATE user_credits uc
    SET
      consumed = uc.consumed + ctc.to_consume
    FROM credits_to_consume ctc
    WHERE uc.id = ctc.id
      AND ctc.to_consume > 0
    RETURNING ctc.to_consume
  )
  SELECT COALESCE(SUM(to_consume), 0) INTO v_total_consumed_from_subs
  FROM updated_credits;

  -- Якщо залишилось щось списати - це permanent credits
  v_consumed_from_permanent := p_amount - v_total_consumed_from_subs;

  -- Розраховуємо новий баланс
  v_new_balance := v_current_balance - p_amount;

  -- ========================================================================
  -- Оновлюємо kv_store
  -- ========================================================================
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || p_user_id || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  -- ========================================================================
  -- Логування транзакції
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

COMMENT ON FUNCTION consume_credits_fifo IS
'FIFO списання кредитів з синхронізацією kv_store та user_balances (оптимізована версія з batch update)';

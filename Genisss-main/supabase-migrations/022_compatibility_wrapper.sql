-- ============================================================================
-- Compatibility Wrapper - Сумісність нової системи кредитів зі старою
-- ============================================================================
-- Забезпечує роботу старого коду з новою системою user_credits
-- Старий код використовує: deduct_balance_atomic(), refund_balance_atomic()
-- Новий код використовує: consume_credits(), grant_subscription_credits()
-- ============================================================================

-- ============================================================================
-- WRAPPER: deduct_balance_atomic - адаптер для consume_credits
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_balance_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Story generation',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Отримуємо поточний баланс
  v_balance_before := get_user_active_balance(p_user_id);

  -- Перевіряємо чи достатньо кредитів
  IF v_balance_before < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'required', p_amount,
      'current', v_balance_before
    );
  END IF;

  -- Витрачаємо кредити через нову систему
  BEGIN
    PERFORM consume_credits(p_user_id, p_amount, p_metadata);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;

  -- Отримуємо новий баланс
  v_balance_after := get_user_active_balance(p_user_id);

  -- Логуємо транзакцію (для сумісності)
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
    p_description,
    v_balance_before,
    v_balance_after,
    p_metadata || jsonb_build_object('via_wrapper', true)
  )
  RETURNING id INTO v_transaction_id;

  -- Повертаємо результат в старому форматі
  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_balance_after,
    'balanceBefore', v_balance_before,
    'balanceAfter', v_balance_after,
    'transactionId', v_transaction_id
  );
END;
$$;

-- ============================================================================
-- WRAPPER: refund_balance_atomic - адаптер для admin_grant_credits
-- ============================================================================
CREATE OR REPLACE FUNCTION refund_balance_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Refund',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_credit_id UUID;
  v_transaction_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Refund amount must be positive'
    );
  END IF;

  -- Отримуємо поточний баланс
  v_balance_before := get_user_active_balance(p_user_id);

  -- Нараховуємо кредити через admin функцію
  BEGIN
    SELECT admin_grant_credits(
      p_user_id,
      p_amount,
      'bonus',
      p_reason,
      30,
      NULL
    ) INTO v_credit_id;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;

  -- Отримуємо новий баланс
  v_balance_after := get_user_active_balance(p_user_id);

  -- Логуємо транзакцію (для сумісності)
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
    'refund',
    p_reason,
    v_balance_before,
    v_balance_after,
    p_metadata || jsonb_build_object('via_wrapper', true, 'credit_id', v_credit_id)
  )
  RETURNING id INTO v_transaction_id;

  -- Повертаємо результат в старому форматі
  RETURN jsonb_build_object(
    'success', true,
    'newBalance', v_balance_after,
    'balanceBefore', v_balance_before,
    'balanceAfter', v_balance_after,
    'transactionId', v_transaction_id,
    'creditId', v_credit_id
  );
END;
$$;

-- ============================================================================
-- VIEW: Сумісність для old balance view
-- ============================================================================
-- Якщо старий код використовує SELECT balance FROM user_balances
CREATE OR REPLACE VIEW user_balances AS
SELECT
  user_id,
  total_credits as balance,
  total_credits as active_balance,
  0 as reserved_balance,
  NOW() as updated_at
FROM user_active_credits;

-- ============================================================================
-- FUNCTION: get_balance - wrapper для старого коду
-- ============================================================================
CREATE OR REPLACE FUNCTION get_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN get_user_active_balance(p_user_id);
END;
$$;

-- Comments
COMMENT ON FUNCTION deduct_balance_atomic IS 'Wrapper: Сумісність старого коду з новою системою user_credits';
COMMENT ON FUNCTION refund_balance_atomic IS 'Wrapper: Сумісність старого коду з новою системою user_credits';
COMMENT ON VIEW user_balances IS 'Wrapper: View для сумісності з старим кодом';
COMMENT ON FUNCTION get_balance IS 'Wrapper: Отримати баланс (сумісність зі старим кодом)';

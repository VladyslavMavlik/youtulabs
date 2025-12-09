-- ============================================================================
-- Admin Set Balance - Встановити точний баланс користувача
-- ============================================================================
-- Дозволяє адміну встановити точний баланс (включно з від'ємним)
-- Використовується для виправлення помилок або manual override
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
  v_balance_before := COALESCE(get_user_active_balance(p_user_id), 0);
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
      NOW() + INTERVAL '365 days',  -- 1 рік експірація для balance adjustment
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
    -- Якщо потрібно зняти кредити - знімаємо ABS(difference)
    PERFORM consume_credits(
      p_user_id,
      ABS(v_difference),
      jsonb_build_object(
        'admin_balance_adjustment', true,
        'reason', p_reason,
        'admin_id', p_admin_id,
        'old_balance', v_balance_before,
        'new_balance', p_new_balance
      )
    );
  END IF;

  -- Отримуємо новий баланс для підтвердження
  v_balance_after := COALESCE(get_user_active_balance(p_user_id), 0);

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

COMMENT ON FUNCTION admin_set_balance IS 'Admin: Встановити точний баланс користувача (може бути від''ємним через consume_credits)';

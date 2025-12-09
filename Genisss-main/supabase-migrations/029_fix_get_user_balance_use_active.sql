-- ============================================================================
-- Fix get_user_balance - Use get_user_active_balance instead of VIEW
-- ============================================================================
-- Проблема: get_user_balance() читає зі старого VIEW user_balances
-- Рішення: Викликати get_user_active_balance() для отримання РЕАЛЬНОГО балансу
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_has_initial BOOLEAN;
BEGIN
  -- Використовуємо ПРАВИЛЬНУ функцію для отримання балансу
  v_balance := COALESCE(get_user_active_balance(p_user_id), 0);

  -- Якщо баланс = 0, перевіряємо чи користувач вже отримав welcome bonus
  IF v_balance = 0 THEN
    -- Перевіряємо чи є initial кредити
    SELECT EXISTS(
      SELECT 1 FROM user_credits
      WHERE user_id = p_user_id
      AND source = 'initial'
    ) INTO v_has_initial;

    -- Якщо немає initial кредитів - даємо welcome bonus
    IF NOT v_has_initial THEN
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
        100,
        'initial',
        'welcome_bonus',
        NOW() + INTERVAL '365 days',
        jsonb_build_object('reason', 'Welcome bonus', 'auto_granted', true)
      );

      -- Логуємо транзакцію
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
        100,
        'initial',
        'Welcome bonus',
        0,
        100,
        jsonb_build_object('auto_granted', true)
      );

      v_balance := 100;
    END IF;
  END IF;

  RETURN v_balance;
END;
$$;

COMMENT ON FUNCTION get_user_balance IS 'Get user REAL active balance from user_credits (not VIEW)';

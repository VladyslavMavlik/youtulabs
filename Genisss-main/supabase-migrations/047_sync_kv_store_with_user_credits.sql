-- ============================================================================
-- Синхронізація kv_store з user_credits
-- ============================================================================
-- Проблема: kv_store та user_credits мають різні баланси
-- Рішення: Оновити kv_store для всіх користувачів на основі user_credits
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_active_balance INTEGER;
BEGIN
  RAISE NOTICE 'Starting sync of kv_store with user_credits...';

  -- Для кожного користувача який має кредити
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM user_credits
  LOOP
    -- Рахуємо активний баланс
    SELECT COALESCE(SUM(remaining), 0) INTO v_active_balance
    FROM user_credits
    WHERE user_id = v_user.user_id
      AND expires_at > NOW()
      AND remaining > 0;

    -- Оновлюємо kv_store
    INSERT INTO kv_store_7f10f791 (key, value)
    VALUES ('user:' || v_user.user_id || ':balance', v_active_balance::TEXT::JSONB)
    ON CONFLICT (key)
    DO UPDATE SET value = v_active_balance::TEXT::JSONB;

    RAISE NOTICE 'Synced balance for user %: % credits', v_user.user_id, v_active_balance;
  END LOOP;

  RAISE NOTICE 'Sync completed successfully!';
END;
$$;

-- ============================================================================
-- Тригер для автоматичної синхронізації при зміні user_credits
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_kv_store_on_credit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Рахуємо новий баланс для користувача
  SELECT COALESCE(SUM(remaining), 0) INTO v_new_balance
  FROM user_credits
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND expires_at > NOW()
    AND remaining > 0;

  -- Оновлюємо kv_store
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES ('user:' || COALESCE(NEW.user_id, OLD.user_id) || ':balance', v_new_balance::TEXT::JSONB)
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Видаляємо старий тригер якщо існує
DROP TRIGGER IF EXISTS sync_kv_store_after_credit_change ON user_credits;

-- Створюємо новий тригер
CREATE TRIGGER sync_kv_store_after_credit_change
AFTER INSERT OR UPDATE OR DELETE ON user_credits
FOR EACH ROW
EXECUTE FUNCTION sync_kv_store_on_credit_change();

COMMENT ON FUNCTION sync_kv_store_on_credit_change IS
'Автоматично синхронізує kv_store при зміні user_credits';

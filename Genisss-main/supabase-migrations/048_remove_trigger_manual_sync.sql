-- ============================================================================
-- Видаляємо тригер автосинхронізації - він зависає
-- ============================================================================

DROP TRIGGER IF EXISTS sync_kv_store_after_credit_change ON user_credits;
DROP FUNCTION IF EXISTS sync_kv_store_on_credit_change();

COMMENT ON TABLE user_credits IS
'Кредити користувачів. kv_store синхронізується вручну в функціях admin_grant_credits, admin_deduct_credits, admin_set_balance';

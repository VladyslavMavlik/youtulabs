-- ============================================================================
-- Виправлення constraint balance_transactions_type_check
-- ============================================================================
-- Додаємо 'consumption' до дозволених типів транзакцій
-- ============================================================================

-- Видаляємо старий constraint
ALTER TABLE balance_transactions DROP CONSTRAINT IF EXISTS balance_transactions_type_check;

-- Додаємо новий constraint з розширеним списком типів (включаючи всі існуючі)
ALTER TABLE balance_transactions
ADD CONSTRAINT balance_transactions_type_check
CHECK (type IN (
  -- Існуючі типи (з БД)
  'initial',            -- Початковий баланс
  'bonus',              -- Бонус
  'generation',         -- Генерація (legacy)
  'refund',             -- Повернення коштів
  'adjustment',         -- Коригування
  'purchase',           -- Paddle покупка
  'deduction',          -- Віднімання (legacy)
  'subscription',       -- Підписка (Paddle або Crypto)

  -- Нові типи для crypto системи
  'admin_grant',        -- Адмін додав кредити
  'admin_deduct',       -- Адмін відняв кредити
  'credit_purchase',    -- Окрема покупка кредитів
  'consumption',        -- Списання кредитів (FIFO)
  'story_generation',   -- Генерація історії
  'expiration'          -- Згорання підписочних кредитів
));

COMMENT ON CONSTRAINT balance_transactions_type_check ON balance_transactions IS 'Дозволені типи транзакцій включаючи consumption та expiration';

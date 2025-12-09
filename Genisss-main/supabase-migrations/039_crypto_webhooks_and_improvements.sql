-- ============================================================================
-- Crypto Webhooks System - Надійна обробка NOWPayments вебхуків
-- ============================================================================
-- Покращення:
-- 1. Таблиця crypto_webhooks - audit trail всіх вхідних вебхуків
-- 2. Захист від дублювання вебхуків (idempotency)
-- 3. Покращена обробка статусів
-- ============================================================================

-- ============================================================================
-- ТАБЛИЦЯ: crypto_webhooks (audit всіх вхідних вебхуків)
-- ============================================================================
CREATE TABLE IF NOT EXISTS crypto_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ідентифікація
  payment_id TEXT NOT NULL, -- NOWPayments payment_id
  order_id TEXT, -- Наш внутрішній order_id

  -- Webhook дані
  event_type TEXT NOT NULL DEFAULT 'payment_status', -- Тип події (NOWPayments відправляє тільки payment_status)
  payment_status TEXT NOT NULL, -- waiting, confirming, finished, failed, expired...

  -- Безпека
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE, -- Чи підпис HMAC SHA512 валідний
  signature TEXT, -- x-nowpayments-sig header

  -- Обробка
  processed BOOLEAN NOT NULL DEFAULT FALSE, -- Чи оброблено webhook
  processed_at TIMESTAMP WITH TIME ZONE, -- Коли оброблено
  processing_error TEXT, -- Помилка обробки (якщо є)

  -- Повні дані
  raw_data JSONB NOT NULL, -- Повний payload від NOWPayments

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_payment_id ON crypto_webhooks(payment_id);
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_order_id ON crypto_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_status ON crypto_webhooks(payment_status);
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_processed ON crypto_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_created_at ON crypto_webhooks(created_at DESC);

-- Composite index для пошуку дублікатів
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_dedup
  ON crypto_webhooks(payment_id, payment_status, created_at);

-- RLS
ALTER TABLE crypto_webhooks ENABLE ROW LEVEL SECURITY;

-- Тільки service role може читати вебхуки
DROP POLICY IF EXISTS "Service role can manage webhooks" ON crypto_webhooks;
CREATE POLICY "Service role can manage webhooks"
  ON crypto_webhooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_crypto_webhooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crypto_webhooks_updated_at_trigger ON crypto_webhooks;
CREATE TRIGGER crypto_webhooks_updated_at_trigger
  BEFORE UPDATE ON crypto_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_crypto_webhooks_updated_at();

-- ============================================================================
-- ФУНКЦІЯ: Ідемпотентна обробка вебхука від NOWPayments
-- ============================================================================
-- Викликається з backend webhook handler
-- Повертає: webhook_id якщо успішно, NULL якщо дублікат
-- ============================================================================
CREATE OR REPLACE FUNCTION process_nowpayments_webhook(
  p_payment_id TEXT,
  p_order_id TEXT,
  p_payment_status TEXT,
  p_signature TEXT,
  p_signature_verified BOOLEAN,
  p_raw_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_id UUID;
  v_existing_webhook_id UUID;
  v_payment_exists BOOLEAN;
BEGIN
  -- Перевірка: чи існує вже такий webhook (захист від дублів)
  -- Дублікат = той самий payment_id + payment_status + прийшов протягом 5 хвилин
  SELECT id INTO v_existing_webhook_id
  FROM crypto_webhooks
  WHERE payment_id = p_payment_id
    AND payment_status = p_payment_status
    AND created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Якщо знайшли дублікат - не обробляємо
  IF v_existing_webhook_id IS NOT NULL THEN
    RAISE NOTICE 'Duplicate webhook detected for payment_id=%, status=%, webhook_id=%',
      p_payment_id, p_payment_status, v_existing_webhook_id;
    RETURN v_existing_webhook_id; -- Повертаємо ID існуючого
  END IF;

  -- Створюємо новий запис вебхука
  INSERT INTO crypto_webhooks (
    payment_id,
    order_id,
    payment_status,
    signature,
    signature_verified,
    raw_data,
    processed
  )
  VALUES (
    p_payment_id,
    p_order_id,
    p_payment_status,
    p_signature,
    p_signature_verified,
    p_raw_data,
    FALSE -- Поки не оброблено
  )
  RETURNING id INTO v_webhook_id;

  -- Перевірка: чи існує платіж в crypto_payments
  SELECT EXISTS(
    SELECT 1 FROM crypto_payments WHERE payment_id = p_payment_id
  ) INTO v_payment_exists;

  IF NOT v_payment_exists THEN
    UPDATE crypto_webhooks
    SET
      processing_error = 'Payment not found in crypto_payments',
      updated_at = NOW()
    WHERE id = v_webhook_id;

    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  -- Оновлюємо статус платежу в crypto_payments
  UPDATE crypto_payments
  SET
    status = p_payment_status,
    nowpayments_data = p_raw_data,
    updated_at = NOW()
  WHERE payment_id = p_payment_id;

  -- Маркуємо вебхук як оброблений
  UPDATE crypto_webhooks
  SET
    processed = TRUE,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_webhook_id;

  RETURN v_webhook_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Отримати статистику вебхуків для моніторингу
-- ============================================================================
CREATE OR REPLACE FUNCTION get_webhook_stats()
RETURNS TABLE(
  total_webhooks BIGINT,
  processed_webhooks BIGINT,
  failed_webhooks BIGINT,
  duplicate_webhooks BIGINT,
  last_webhook_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_webhooks,
    COUNT(*) FILTER (WHERE processed = TRUE)::BIGINT as processed_webhooks,
    COUNT(*) FILTER (WHERE processing_error IS NOT NULL)::BIGINT as failed_webhooks,
    (
      SELECT COUNT(*)::BIGINT
      FROM (
        SELECT payment_id, payment_status, DATE_TRUNC('minute', created_at) as minute
        FROM crypto_webhooks
        GROUP BY payment_id, payment_status, minute
        HAVING COUNT(*) > 1
      ) duplicates
    ) as duplicate_webhooks,
    MAX(created_at) as last_webhook_at
  FROM crypto_webhooks;
END;
$$;

-- ============================================================================
-- ПОКРАЩЕННЯ: Додати поле webhook_count в crypto_payments
-- ============================================================================
-- Для відстеження скільки разів приходив вебхук для цього платежу
ALTER TABLE crypto_payments
ADD COLUMN IF NOT EXISTS webhook_count INTEGER DEFAULT 0;

-- Тригер для автоматичного підрахунку вебхуків
CREATE OR REPLACE FUNCTION increment_payment_webhook_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crypto_payments
  SET webhook_count = webhook_count + 1
  WHERE payment_id = NEW.payment_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crypto_webhooks_increment_count ON crypto_webhooks;
CREATE TRIGGER crypto_webhooks_increment_count
  AFTER INSERT ON crypto_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION increment_payment_webhook_count();

-- ============================================================================
-- ПОКРАЩЕННЯ: Функція для очищення старих вебхуків (для cron)
-- ============================================================================
-- Видаляє вебхуки старші ніж 90 днів для економії місця
CREATE OR REPLACE FUNCTION cleanup_old_webhooks(p_days_old INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM crypto_webhooks
  WHERE created_at < NOW() - (p_days_old || ' days')::INTERVAL
    AND processed = TRUE; -- Видаляємо тільки оброблені

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old webhooks', v_deleted_count;

  RETURN v_deleted_count;
END;
$$;

-- Comments
COMMENT ON TABLE crypto_webhooks IS 'Audit trail всіх вхідних вебхуків від NOWPayments';
COMMENT ON FUNCTION process_nowpayments_webhook IS 'Ідемпотентна обробка вебхука з захистом від дублювання';
COMMENT ON FUNCTION get_webhook_stats IS 'Статистика вебхуків для моніторингу';
COMMENT ON FUNCTION cleanup_old_webhooks IS 'Очищення старих вебхуків (викликати з cron)';

-- Grants
GRANT EXECUTE ON FUNCTION process_nowpayments_webhook TO service_role;
GRANT EXECUTE ON FUNCTION get_webhook_stats TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_webhooks TO service_role;

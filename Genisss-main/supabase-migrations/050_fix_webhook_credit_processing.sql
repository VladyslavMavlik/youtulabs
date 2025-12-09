-- ============================================================================
-- Виправлення process_nowpayments_webhook - додати нарахування кредитів
-- ============================================================================
-- Проблема: Webhook оновлює статус але НЕ нараховує кредити
-- Рішення: При статусі 'finished' викликати process_crypto_subscription_payment
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
  v_payment RECORD;
  v_already_processed BOOLEAN;
  v_credit_id UUID;
BEGIN
  RAISE NOTICE '[WEBHOOK] Processing: payment_id=%, status=%', p_payment_id, p_payment_status;

  -- ========================================================================
  -- STEP 1: Перевірка дублікатів
  -- ========================================================================
  SELECT id INTO v_existing_webhook_id
  FROM crypto_webhooks
  WHERE payment_id = p_payment_id
    AND payment_status = p_payment_status
    AND created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_webhook_id IS NOT NULL THEN
    RAISE NOTICE '[WEBHOOK] Duplicate detected: webhook_id=%', v_existing_webhook_id;
    RETURN v_existing_webhook_id;
  END IF;

  -- ========================================================================
  -- STEP 2: Створюємо запис вебхука
  -- ========================================================================
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
    FALSE
  )
  RETURNING id INTO v_webhook_id;

  RAISE NOTICE '[WEBHOOK] Created webhook record: id=%', v_webhook_id;

  -- ========================================================================
  -- STEP 3: Перевіряємо чи існує платіж
  -- ========================================================================
  SELECT * INTO v_payment
  FROM crypto_payments
  WHERE payment_id = p_payment_id;

  IF NOT FOUND THEN
    UPDATE crypto_webhooks
    SET
      processing_error = 'Payment not found in crypto_payments',
      updated_at = NOW()
    WHERE id = v_webhook_id;

    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  RAISE NOTICE '[WEBHOOK] Payment found: order_id=%, user_id=%, plan_type=%',
    v_payment.order_id, v_payment.user_id, v_payment.plan_type;

  -- ========================================================================
  -- STEP 4: Оновлюємо статус платежу
  -- ========================================================================
  UPDATE crypto_payments
  SET
    status = p_payment_status,
    nowpayments_data = p_raw_data,
    updated_at = NOW()
  WHERE payment_id = p_payment_id;

  RAISE NOTICE '[WEBHOOK] Updated payment status to: %', p_payment_status;

  -- ========================================================================
  -- STEP 5: Якщо статус = finished → нараховуємо кредити
  -- ========================================================================
  IF p_payment_status = 'finished' THEN
    -- Перевіряємо чи вже нараховані кредити
    SELECT processed INTO v_already_processed
    FROM crypto_payments
    WHERE payment_id = p_payment_id;

    IF v_already_processed THEN
      RAISE NOTICE '[WEBHOOK] Credits already processed for payment: %', p_payment_id;

      UPDATE crypto_webhooks
      SET
        processed = TRUE,
        processed_at = NOW(),
        processing_error = 'Credits already granted',
        updated_at = NOW()
      WHERE id = v_webhook_id;

      RETURN v_webhook_id;
    END IF;

    -- Нараховуємо кредити через process_crypto_subscription_payment
    BEGIN
      RAISE NOTICE '[WEBHOOK] Granting credits for payment: %', p_payment_id;

      SELECT process_crypto_subscription_payment(
        p_payment_id := p_payment_id,
        p_user_id := v_payment.user_id,
        p_plan_type := v_payment.plan_type,
        p_credits_amount := v_payment.crystals_amount::INTEGER,
        p_amount_usd := v_payment.amount_usd,
        p_crypto_currency := v_payment.crypto_currency,
        p_crypto_amount := COALESCE((p_raw_data->>'pay_amount')::NUMERIC, v_payment.crypto_amount),
        p_payment_address := COALESCE(p_raw_data->>'pay_address'::TEXT, v_payment.payment_address),
        p_metadata := jsonb_build_object(
          'order_id', v_payment.order_id,
          'nowpayments_data', p_raw_data
        )
      ) INTO v_credit_id;

      RAISE NOTICE '[WEBHOOK] ✅ Credits granted successfully: credit_id=%', v_credit_id;

      -- Маркуємо як processed в crypto_payments
      UPDATE crypto_payments
      SET processed = TRUE, updated_at = NOW()
      WHERE payment_id = p_payment_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[WEBHOOK] ❌ Failed to grant credits: %', SQLERRM;

      UPDATE crypto_webhooks
      SET
        processing_error = 'Failed to grant credits: ' || SQLERRM,
        updated_at = NOW()
      WHERE id = v_webhook_id;

      -- НЕ маркуємо як processed щоб можна було повторити
      RAISE;
    END;

  ELSIF p_payment_status IN ('failed', 'expired', 'refunded') THEN
    RAISE NOTICE '[WEBHOOK] Payment failed/expired/refunded - no credits granted';

    UPDATE crypto_payments
    SET processed = TRUE, updated_at = NOW()
    WHERE payment_id = p_payment_id;

  ELSE
    -- waiting, confirming, sending, partially_paid, etc.
    RAISE NOTICE '[WEBHOOK] Payment status % - waiting for completion', p_payment_status;
  END IF;

  -- ========================================================================
  -- STEP 6: Маркуємо вебхук як оброблений
  -- ========================================================================
  UPDATE crypto_webhooks
  SET
    processed = TRUE,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_webhook_id;

  RAISE NOTICE '[WEBHOOK] ✅ Webhook processed successfully: id=%', v_webhook_id;

  RETURN v_webhook_id;
END;
$$;

COMMENT ON FUNCTION process_nowpayments_webhook IS
'Обробка NOWPayments webhook з автоматичним нарахуванням кредитів при статусі finished';

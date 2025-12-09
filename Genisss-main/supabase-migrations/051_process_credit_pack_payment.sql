-- ============================================================================
-- Функція для обробки покупки окремих пакетів кредитів (ВІЧНИХ)
-- ============================================================================
-- Відмінність від підписок: expires_at = NOW() + 100 years (практично вічно)
-- Використовується для one-time purchases credit packs
-- ============================================================================

CREATE OR REPLACE FUNCTION process_credit_pack_payment(
  p_payment_id TEXT,
  p_user_id UUID,
  p_pack_id TEXT,
  p_credits_amount INTEGER,          -- TOTAL (base + bonus)
  p_base_credits INTEGER,            -- Base amount
  p_bonus_credits INTEGER,           -- Bonus amount
  p_amount_usd NUMERIC,
  p_crypto_currency TEXT,
  p_crypto_amount NUMERIC,
  p_payment_address TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_new_balance INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  RAISE NOTICE '[CREDIT_PACK] Processing payment: payment_id=%, user_id=%, pack_id=%, total_credits=%',
    p_payment_id, p_user_id, p_pack_id, p_credits_amount;

  -- ========================================================================
  -- STEP 1: Перевірка дублювання
  -- ========================================================================
  IF EXISTS (
    SELECT 1 FROM user_credits
    WHERE source_id = p_payment_id
  ) THEN
    RAISE EXCEPTION 'Credits already granted for payment %', p_payment_id;
  END IF;

  -- ========================================================================
  -- STEP 2: Встановити термін дії - 100 РОКІВ (вічні кредити)
  -- ========================================================================
  v_expires_at := NOW() + INTERVAL '100 years';

  RAISE NOTICE '[CREDIT_PACK] Expires at: % (permanent credits)', v_expires_at;

  -- ========================================================================
  -- STEP 3: Додати кредити в user_credits
  -- ========================================================================
  INSERT INTO user_credits (
    user_id,
    amount,
    source,
    source_id,
    expires_at,
    granted_at,
    consumed,
    metadata
  )
  VALUES (
    p_user_id,
    p_credits_amount,              -- TOTAL including bonus
    'crypto',
    p_payment_id,
    v_expires_at,                 -- 100 years from now
    NOW(),
    0,
    jsonb_build_object(
      'payment_type', 'credit_pack',
      'pack_id', p_pack_id,
      'base_crystals', p_base_credits,
      'bonus_crystals', p_bonus_credits,
      'total_crystals', p_credits_amount,
      'amount_usd', p_amount_usd,
      'crypto_currency', p_crypto_currency,
      'crypto_amount', p_crypto_amount,
      'payment_address', p_payment_address,
      'is_permanent', true,
      'original_metadata', p_metadata,
      'purchase_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  RAISE NOTICE '[CREDIT_PACK] Credits added to user_credits: credit_id=%', v_credit_id;

  -- ========================================================================
  -- STEP 4: Рахуємо новий баланс
  -- ========================================================================
  SELECT COALESCE(SUM(remaining), 0) INTO v_new_balance
  FROM user_credits
  WHERE user_id = p_user_id
    AND expires_at > NOW()
    AND remaining > 0;

  RAISE NOTICE '[CREDIT_PACK] New balance calculated: %', v_new_balance;

  -- ========================================================================
  -- STEP 5: Синхронізуємо kv_store (КЕШ)
  -- ========================================================================
  INSERT INTO kv_store_7f10f791 (key, value)
  VALUES (
    'user:' || p_user_id || ':balance',
    v_new_balance::TEXT::JSONB
  )
  ON CONFLICT (key)
  DO UPDATE SET value = v_new_balance::TEXT::JSONB;

  RAISE NOTICE '[CREDIT_PACK] kv_store synced: new_balance=%', v_new_balance;

  -- ========================================================================
  -- STEP 6: Логування в balance_transactions
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
    p_credits_amount,
    'credit_purchase',
    format('Purchased credit pack: %s crystals (%s + %s bonus)',
           p_credits_amount, p_base_credits, p_bonus_credits),
    v_new_balance - p_credits_amount,
    v_new_balance,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'pack_id', p_pack_id,
      'credit_id', v_credit_id,
      'base_crystals', p_base_credits,
      'bonus_crystals', p_bonus_credits,
      'is_permanent', true,
      'crypto_currency', p_crypto_currency,
      'crypto_amount', p_crypto_amount
    )
  );

  RAISE NOTICE '[CREDIT_PACK] Transaction logged';

  -- ========================================================================
  -- STEP 7: НЕ створюємо user_subscription (це не підписка!)
  -- ========================================================================
  RAISE NOTICE '[CREDIT_PACK] ✅ Credit pack processed successfully: user=%, credits=%, balance: % → %',
    p_user_id, p_credits_amount, v_new_balance - p_credits_amount, v_new_balance;

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- Оновити process_nowpayments_webhook для підтримки credit packs
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
  v_payment_type TEXT;
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

    -- Визначаємо тип платежу (subscription чи credit_pack)
    v_payment_type := COALESCE(v_payment.nowpayments_data->>'payment_type', 'subscription');
    RAISE NOTICE '[WEBHOOK] Payment type: %', v_payment_type;

    -- Нараховуємо кредити залежно від типу
    BEGIN
      IF v_payment_type = 'credit_pack' THEN
        -- ===== CREDIT PACK (ВІЧНІ КРЕДИТИ) =====
        RAISE NOTICE '[WEBHOOK] Processing credit pack payment';

        SELECT process_credit_pack_payment(
          p_payment_id := p_payment_id,
          p_user_id := v_payment.user_id,
          p_pack_id := v_payment.nowpayments_data->>'pack_id',
          p_credits_amount := v_payment.credits_amount::INTEGER,
          p_base_credits := (v_payment.nowpayments_data->>'base_crystals')::INTEGER,
          p_bonus_credits := (v_payment.nowpayments_data->>'bonus_crystals')::INTEGER,
          p_amount_usd := v_payment.amount_usd,
          p_crypto_currency := v_payment.crypto_currency,
          p_crypto_amount := COALESCE((p_raw_data->>'pay_amount')::NUMERIC, v_payment.crypto_amount),
          p_payment_address := COALESCE(p_raw_data->>'pay_address'::TEXT, v_payment.payment_address),
          p_metadata := jsonb_build_object('order_id', v_payment.order_id, 'nowpayments_data', p_raw_data)
        ) INTO v_credit_id;

      ELSE
        -- ===== SUBSCRIPTION (30 ДНІВ) =====
        RAISE NOTICE '[WEBHOOK] Processing subscription payment';

        SELECT process_crypto_subscription_payment(
          p_payment_id := p_payment_id,
          p_user_id := v_payment.user_id,
          p_plan_type := v_payment.plan_type,
          p_credits_amount := v_payment.credits_amount::INTEGER,
          p_amount_usd := v_payment.amount_usd,
          p_crypto_currency := v_payment.crypto_currency,
          p_crypto_amount := COALESCE((p_raw_data->>'pay_amount')::NUMERIC, v_payment.crypto_amount),
          p_payment_address := COALESCE(p_raw_data->>'pay_address'::TEXT, v_payment.payment_address),
          p_metadata := jsonb_build_object('order_id', v_payment.order_id, 'nowpayments_data', p_raw_data)
        ) INTO v_credit_id;
      END IF;

      RAISE NOTICE '[WEBHOOK] ✅ Credits granted successfully: credit_id=%', v_credit_id;

      -- Маркуємо як processed
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

      RAISE;
    END;

  ELSIF p_payment_status IN ('failed', 'expired', 'refunded') THEN
    RAISE NOTICE '[WEBHOOK] Payment failed/expired/refunded - no credits granted';

    UPDATE crypto_payments
    SET processed = TRUE, updated_at = NOW()
    WHERE payment_id = p_payment_id;

  ELSE
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

COMMENT ON FUNCTION process_credit_pack_payment IS
'Обробка покупки окремих пакетів кредитів (ВІЧНИХ - expires через 100 років)';

COMMENT ON FUNCTION process_nowpayments_webhook IS
'Обробка NOWPayments webhook з підтримкою підписок (30 днів) та credit packs (вічні)';

-- ============================================================================
-- NOWPayments Cryptocurrency Payments System
-- ============================================================================
-- Враховує:
-- 1. Підписки (plan_type) - кредити згорають через 30 днів
-- 2. Окремі покупки (credits_amount) - кредити вічні
-- 3. Захист від дублювання транзакцій (idempotency)
-- 4. Audit trail всіх операцій
-- ============================================================================

-- Таблиця для криптовалютних платежів через NOWPayments
CREATE TABLE IF NOT EXISTS crypto_payments (
  payment_id TEXT PRIMARY KEY, -- NOWPayments payment ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Фінансова інформація
  amount_usd DECIMAL(10, 2) NOT NULL,
  crypto_currency TEXT NOT NULL,
  crypto_amount DECIMAL(20, 8) NOT NULL,
  payment_address TEXT NOT NULL,
  order_id TEXT,

  -- Тип покупки (one of these will be set)
  plan_type TEXT CHECK (plan_type IN ('starter', 'pro', 'ultimate')), -- Підписка
  credits_amount INTEGER CHECK (credits_amount > 0), -- Окрема покупка

  -- Статус платежу
  status TEXT NOT NULL CHECK (status IN (
    'waiting',      -- Очікування оплати
    'confirming',   -- Підтвердження в блокчейні
    'confirmed',    -- Підтверджено
    'sending',      -- Відправка
    'finished',     -- Завершено успішно
    'failed',       -- Помилка
    'refunded',     -- Повернення коштів
    'expired'       -- Час оплати вийшов
  )),

  -- Обробка
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,

  -- Для підписок: дата закінчення 30 днів
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  subscription_credits_granted INTEGER, -- Скільки кредитів дали з підписки

  -- Metadata
  nowpayments_data JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_crypto_payments_user_id ON crypto_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_status ON crypto_payments(status);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_processed ON crypto_payments(processed);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_subscription_expires ON crypto_payments(subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crypto_payments_created_at ON crypto_payments(created_at DESC);

-- Constraint: має бути або plan_type, або credits_amount (не обидва)
ALTER TABLE crypto_payments ADD CONSTRAINT check_payment_type
  CHECK (
    (plan_type IS NOT NULL AND credits_amount IS NULL) OR
    (plan_type IS NULL AND credits_amount IS NOT NULL)
  );

-- Row Level Security
ALTER TABLE crypto_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own crypto payments" ON crypto_payments;
CREATE POLICY "Users can view own crypto payments"
  ON crypto_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Таблиця для відстеження підписочних кредитів (що згорають)
CREATE TABLE IF NOT EXISTS crypto_subscription_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES crypto_payments(payment_id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  consumed INTEGER DEFAULT 0 CHECK (consumed >= 0 AND consumed <= amount),
  remaining INTEGER GENERATED ALWAYS AS (amount - consumed) STORED,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'consumed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_user_id ON crypto_subscription_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_expires_at ON crypto_subscription_credits(expires_at);
CREATE INDEX IF NOT EXISTS idx_crypto_sub_credits_status ON crypto_subscription_credits(status);

ALTER TABLE crypto_subscription_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription credits" ON crypto_subscription_credits;
CREATE POLICY "Users can view own subscription credits"
  ON crypto_subscription_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- ФУНКЦІЯ: Обробка криптовалютної підписки
-- ============================================================================
CREATE OR REPLACE FUNCTION process_crypto_subscription_payment(
  p_payment_id TEXT,
  p_user_id UUID,
  p_plan_type TEXT,
  p_credits_amount INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Перевіряємо чи платіж вже оброблений
  IF EXISTS (
    SELECT 1 FROM crypto_payments
    WHERE payment_id = p_payment_id AND processed = TRUE
  ) THEN
    RAISE EXCEPTION 'Payment already processed: %', p_payment_id;
  END IF;

  -- Встановлюємо термін дії: 30 днів від зараз
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Створюємо запис підписочних кредитів (що згорають)
  INSERT INTO crypto_subscription_credits (
    user_id,
    payment_id,
    plan_type,
    amount,
    expires_at
  )
  VALUES (
    p_user_id,
    p_payment_id,
    p_plan_type,
    p_credits_amount,
    v_expires_at
  )
  RETURNING id INTO v_credit_id;

  -- Оновлюємо crypto_payments
  UPDATE crypto_payments
  SET
    subscription_expires_at = v_expires_at,
    subscription_credits_granted = p_credits_amount,
    processed = TRUE,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE payment_id = p_payment_id;

  -- Створюємо/оновлюємо підписку в user_subscriptions
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    expires_at
  )
  VALUES (
    p_user_id,
    p_plan_type,
    'active',
    NOW(),
    v_expires_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    plan_id = p_plan_type,
    status = 'active',
    expires_at = v_expires_at,
    updated_at = NOW();

  -- Логування в balance_transactions для сумісності
  INSERT INTO balance_transactions (
    user_id,
    amount,
    type,
    description,
    balance_before,
    balance_after,
    metadata
  )
  SELECT
    p_user_id,
    p_credits_amount,
    'subscription',
    format('Crypto subscription: %s plan', p_plan_type),
    COALESCE((SELECT balance FROM user_balances WHERE user_id = p_user_id), 0),
    COALESCE((SELECT balance FROM user_balances WHERE user_id = p_user_id), 0) + p_credits_amount,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'plan_type', p_plan_type,
      'expires_at', v_expires_at,
      'payment_method', 'crypto'
    );

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Закінчення терміну дії підписок (викликається з Edge Function)
-- ============================================================================
-- ВАЖЛИВО: Ця функція ТІЛЬКИ маркує підписки як expired
-- Edge Function cron job віднімає кредити з kv_store окремо
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_crypto_subscriptions()
RETURNS TABLE(
  user_id UUID,
  credits_burned INTEGER,
  payment_id TEXT,
  plan_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH expired_subs AS (
    -- Знаходимо всі прострочені підписки
    SELECT
      csc.id,
      csc.user_id,
      csc.remaining,
      csc.payment_id,
      csc.plan_type
    FROM crypto_subscription_credits csc
    WHERE csc.expires_at < NOW()
      AND csc.status = 'active'
      AND csc.remaining > 0
  ),
  updated_credits AS (
    -- Помічаємо кредити як прострочені
    UPDATE crypto_subscription_credits csc
    SET
      status = 'expired',
      updated_at = NOW()
    FROM expired_subs es
    WHERE csc.id = es.id
    RETURNING csc.user_id, csc.remaining, csc.payment_id, csc.plan_type
  ),
  updated_subscriptions AS (
    -- Відмічаємо підписки як закінчені
    UPDATE user_subscriptions us
    SET
      status = 'expired',
      updated_at = NOW()
    FROM updated_credits uc
    WHERE us.user_id = uc.user_id
      AND us.plan_id = uc.plan_type
    RETURNING us.user_id
  )
  -- Повертаємо список для обробки в Edge Function
  SELECT
    uc.user_id,
    uc.remaining::INTEGER as credits_burned,
    uc.payment_id,
    uc.plan_type
  FROM updated_credits uc;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Отримати активні підписочні кредити користувача
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_crypto_subscription_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(SUM(remaining), 0) INTO v_balance
  FROM crypto_subscription_credits
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW()
    AND remaining > 0;

  RETURN v_balance;
END;
$$;

-- Comments
COMMENT ON TABLE crypto_payments IS 'NOWPayments криптовалютні транзакції';
COMMENT ON TABLE crypto_subscription_credits IS 'Підписочні кредити що згорають через 30 днів';
COMMENT ON FUNCTION process_crypto_subscription_payment IS 'Обробка криптовалютної підписки';
COMMENT ON FUNCTION expire_crypto_subscriptions IS 'Закінчення терміну дії підписок (cron job)';
COMMENT ON FUNCTION get_user_crypto_subscription_balance IS 'Отримати баланс підписочних кредитів';

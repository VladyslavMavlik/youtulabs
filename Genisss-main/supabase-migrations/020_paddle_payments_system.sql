-- ============================================================================
-- Paddle Payments System - Безпечна система обробки платежів
-- ============================================================================
-- Враховує:
-- 1. Кредити мають термін дії 30 днів
-- 2. Підписка оновлює кредити щомісяця
-- 3. Захист від дублювання транзакцій
-- 4. Audit trail всіх операцій
-- ============================================================================

-- Таблиця для відстеження Paddle транзакцій (захист від дублювання)
CREATE TABLE IF NOT EXISTS paddle_transactions (
  id TEXT PRIMARY KEY, -- Paddle transaction ID
  event_type TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL,
  paddle_data JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paddle_transactions_user_id ON paddle_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_paddle_transactions_created_at ON paddle_transactions(created_at DESC);

-- Таблиця підписок Paddle (оновлена)
CREATE TABLE IF NOT EXISTS paddle_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT NOT NULL UNIQUE,
  paddle_customer_id TEXT,
  price_id TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('starter', 'pro', 'ultimate')),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'canceled', 'past_due', 'trialing')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  monthly_credits INTEGER NOT NULL, -- Кількість кредитів що даються щомісяця
  last_credits_granted_at TIMESTAMP WITH TIME ZONE, -- Коли останній раз давали кредити
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_user_id ON paddle_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_paddle_id ON paddle_subscriptions(paddle_subscription_id);
CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_status ON paddle_subscriptions(status);

-- Таблиця кредитів з expiration (оновлена)
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL CHECK (source IN ('purchase', 'subscription', 'bonus', 'initial')),
  source_id TEXT, -- Paddle transaction ID або subscription ID
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Кредити згорають через 30 днів
  consumed INTEGER DEFAULT 0 CHECK (consumed >= 0 AND consumed <= amount),
  remaining INTEGER GENERATED ALWAYS AS (amount - consumed) STORED,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_expires_at ON user_credits(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_credits_source_id ON user_credits(source_id);

-- View для загального балансу користувача (тільки активні кредити)
CREATE OR REPLACE VIEW user_active_credits AS
SELECT
  user_id,
  SUM(remaining) as total_credits,
  COUNT(*) as credit_packages,
  MIN(expires_at) as earliest_expiration
FROM user_credits
WHERE expires_at > NOW() AND remaining > 0
GROUP BY user_id;

-- RLS Policies
ALTER TABLE paddle_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paddle_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own paddle transactions" ON paddle_transactions;
CREATE POLICY "Users can view own paddle transactions"
  ON paddle_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own paddle subscription" ON paddle_subscriptions;
CREATE POLICY "Users can view own paddle subscription"
  ON paddle_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- ФУНКЦІЯ: Отримати баланс користувача (тільки активні кредити)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_active_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(total_credits, 0) INTO v_balance
  FROM user_active_credits
  WHERE user_id = p_user_id;

  RETURN v_balance;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Витратити кредити (FIFO - First In First Out)
-- ============================================================================
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INTEGER := p_amount;
  v_credit RECORD;
BEGIN
  -- Перевіряємо чи достатньо кредитів
  IF get_user_active_balance(p_user_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Requested: %, Available: %',
      p_amount, get_user_active_balance(p_user_id);
  END IF;

  -- Витрачаємо кредити в порядку закінчення терміну дії (FIFO)
  FOR v_credit IN
    SELECT id, remaining
    FROM user_credits
    WHERE user_id = p_user_id
      AND expires_at > NOW()
      AND remaining > 0
    ORDER BY expires_at ASC, created_at ASC
    FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    IF v_credit.remaining >= v_remaining THEN
      -- Цього пакету достатньо
      UPDATE user_credits
      SET consumed = consumed + v_remaining
      WHERE id = v_credit.id;
      v_remaining := 0;
    ELSE
      -- Використовуємо весь пакет і переходимо до наступного
      UPDATE user_credits
      SET consumed = amount
      WHERE id = v_credit.id;
      v_remaining := v_remaining - v_credit.remaining;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Обробка одноразової покупки кредитів
-- ============================================================================
CREATE OR REPLACE FUNCTION process_credit_purchase(
  p_paddle_transaction_id TEXT,
  p_user_id UUID,
  p_credits INTEGER,
  p_bonus INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_total_credits INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Перевіряємо чи транзакція вже оброблена
  IF EXISTS (SELECT 1 FROM user_credits WHERE source_id = p_paddle_transaction_id) THEN
    RAISE EXCEPTION 'Transaction already processed: %', p_paddle_transaction_id;
  END IF;

  v_total_credits := p_credits + p_bonus;
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Створюємо запис кредитів
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
    v_total_credits,
    'purchase',
    p_paddle_transaction_id,
    v_expires_at,
    p_metadata || jsonb_build_object(
      'base_credits', p_credits,
      'bonus_credits', p_bonus,
      'purchase_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  -- Логуємо в balance_transactions для сумісності
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
    v_total_credits,
    'purchase',
    format('Purchased %s credits (+%s bonus)', p_credits, p_bonus),
    get_user_active_balance(p_user_id) - v_total_credits,
    get_user_active_balance(p_user_id),
    p_metadata
  );

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Обробка підписки - нарахування кредитів
-- ============================================================================
CREATE OR REPLACE FUNCTION grant_subscription_credits(
  p_paddle_subscription_id TEXT,
  p_user_id UUID,
  p_plan_type TEXT,
  p_period_start TIMESTAMP WITH TIME ZONE,
  p_period_end TIMESTAMP WITH TIME ZONE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
  v_monthly_credits INTEGER;
  v_last_granted TIMESTAMP WITH TIME ZONE;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_unique_source_id TEXT;
BEGIN
  -- Визначаємо кількість кредитів по плану
  CASE p_plan_type
    WHEN 'starter' THEN v_monthly_credits := 500;
    WHEN 'pro' THEN v_monthly_credits := 2000;
    WHEN 'ultimate' THEN v_monthly_credits := 10000;
    ELSE RAISE EXCEPTION 'Unknown plan type: %', p_plan_type;
  END CASE;

  -- Отримуємо дату останнього нарахування
  SELECT last_credits_granted_at INTO v_last_granted
  FROM paddle_subscriptions
  WHERE paddle_subscription_id = p_paddle_subscription_id;

  -- Перевіряємо чи вже давали кредити цього місяця
  IF v_last_granted IS NOT NULL AND v_last_granted >= p_period_start THEN
    RAISE NOTICE 'Credits already granted for this period';
    RETURN NULL;
  END IF;

  -- Кредити з підписки також згорають через 30 днів
  v_expires_at := NOW() + INTERVAL '30 days';

  -- Унікальний ID для захисту від дублювання
  v_unique_source_id := p_paddle_subscription_id || ':' || p_period_start::TEXT;

  -- Перевіряємо чи вже створені кредити для цього періоду
  IF EXISTS (SELECT 1 FROM user_credits WHERE source_id = v_unique_source_id) THEN
    RAISE NOTICE 'Credits already exist for this period';
    RETURN NULL;
  END IF;

  -- Створюємо кредити
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
    v_monthly_credits,
    'subscription',
    v_unique_source_id,
    v_expires_at,
    jsonb_build_object(
      'plan_type', p_plan_type,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'granted_date', NOW()
    )
  )
  RETURNING id INTO v_credit_id;

  -- Оновлюємо дату останнього нарахування
  UPDATE paddle_subscriptions
  SET last_credits_granted_at = NOW(),
      updated_at = NOW()
  WHERE paddle_subscription_id = p_paddle_subscription_id;

  -- Логуємо
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
    v_monthly_credits,
    'bonus',
    format('Monthly subscription credits (%s)', p_plan_type),
    get_user_active_balance(p_user_id) - v_monthly_credits,
    get_user_active_balance(p_user_id),
    jsonb_build_object('plan_type', p_plan_type)
  );

  RETURN v_credit_id;
END;
$$;

-- ============================================================================
-- ФУНКЦІЯ: Cleanup expired credits (cron job)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_credits()
RETURNS TABLE(deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Видаляємо повністю витрачені та прострочені кредити
  DELETE FROM user_credits
  WHERE expires_at < NOW() AND remaining = 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$;

-- Comments
COMMENT ON TABLE paddle_transactions IS 'Paddle transaction log - захист від дублювання';
COMMENT ON TABLE paddle_subscriptions IS 'Active Paddle subscriptions';
COMMENT ON TABLE user_credits IS 'User credit packages з expiration 30 днів';
COMMENT ON FUNCTION get_user_active_balance IS 'Отримати активний баланс користувача';
COMMENT ON FUNCTION consume_credits IS 'Витратити кредити (FIFO)';
COMMENT ON FUNCTION process_credit_purchase IS 'Обробка одноразової покупки кредитів';
COMMENT ON FUNCTION grant_subscription_credits IS 'Нарахування місячних кредитів з підписки';
COMMENT ON FUNCTION cleanup_expired_credits IS 'Видалення прострочених кредитів';

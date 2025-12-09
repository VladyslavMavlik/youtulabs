# 🔒 ATOMIC JOB REFUND MIGRATION

## ⚠️ КРИТИЧНА МІГРАЦІЯ - ЗАПОБІГАЄ ПОДВІЙНИМ РЕФАНДАМ

---

## 🎯 ПРОБЛЕМА ЯКУ ВИРІШУЄМО

### Сценарій подвійного рефанду (ДО міграції):

```
Час | Worker 1 (original)              | Worker 2 (Bull retry)
----|---------------------------------|---------------------------
T0  | Job starts                      |
T1  | Generation fails                |
T2  | SELECT status → "processing" ✓  |
T3  |                                 | SELECT status → "processing" ✓
T4  | Refund +1000 ✅                  |
T5  |                                 | Refund +1000 ✅ (ДУБЛІКАТ!)
T6  | UPDATE status = 'failed'        |
T7  |                                 | UPDATE status = 'failed'

РЕЗУЛЬТАТ: Баланс 5000 → 4000 → 5000 → 6000 ❌❌❌
```

**Чому це відбувалось:**
1. Bull Queue позначав довгі jobs як "stalled"
2. Автоматично перезапускав job
3. Два worker'и обробляли той самий failed job одночасно
4. Обидва бачили status = "processing"
5. Обидва робили рефанд

---

## ✅ РІШЕННЯ: Atomic `refund_job_atomic()`

### Нова функція робить ВСЕ в ОДНІЙ транзакції:

```sql
BEGIN;
  -- 1. LOCK job row (FOR UPDATE) - жоден інший worker не може прочитати
  SELECT status FROM story_jobs WHERE job_id = '...' FOR UPDATE;

  -- 2. Якщо вже failed → SKIP (idempotency)
  IF status = 'failed' THEN RETURN 'already refunded';

  -- 3. Рефанд через refund_balance_atomic()
  SELECT refund_balance_atomic(user_id, amount, ...);

  -- 4. Оновити status → 'failed'
  UPDATE story_jobs SET status = 'failed' WHERE job_id = '...';
COMMIT;
```

### Після міграції:

```
Час | Worker 1                        | Worker 2 (Bull retry)
----|---------------------------------|---------------------------
T0  | BEGIN TRANSACTION               |
T1  | SELECT ... FOR UPDATE (LOCK)    |
T2  |                                 | SELECT ... (BLOCKED!)
T3  | Refund +1000 ✅                  |
T4  | UPDATE status = 'failed'        |
T5  | COMMIT (unlock)                 |
T6  |                                 | SELECT status → 'failed' ✓
T7  |                                 | SKIP refund (already done)

РЕЗУЛЬТАТ: Баланс 5000 → 4000 → 5000 ✅ (тільки 1 рефанд)
```

---

## 🚀 ІНСТРУКЦІЯ З ВСТАНОВЛЕННЯ

### Крок 1: Виконай міграцію в Supabase

1. Відкрий https://supabase.com/dashboard
2. Обери проект
3. SQL Editor → New Query
4. Скопіюй ВЕСЬ вміст файлу `migration_atomic_job_refund.sql`
5. Вставте і натисни **RUN**

### Крок 2: Перевір що функція створена

```sql
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'refund_job_atomic';
```

**Очікуваний результат**: 1 рядок з типом `FUNCTION`

### Крок 3: Перезапусти worker

```bash
ps aux | grep "storyWorker" | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
sleep 2
cd /Users/mavlik/Projects/TextGeneratorGeis
node src/queue/storyWorker.js
```

---

## 🧪 ТЕСТУВАННЯ

### Тест 1: Симуляція подвійного рефанду

Відкрий 2 термінали одночасно:

**Термінал 1:**
```sql
-- Supabase SQL Editor
SELECT refund_job_atomic('test-job-123', 'YOUR_USER_ID', 1000, 'Test error 1');
```

**Термінал 2 (одразу після):**
```sql
-- Supabase SQL Editor
SELECT refund_job_atomic('test-job-123', 'YOUR_USER_ID', 1000, 'Test error 2');
```

**Очікуваний результат:**
- Термінал 1: `{"success": true, "refunded": true, "new_balance": 6000}`
- Термінал 2: `{"success": false, "error": "Job already failed and refunded"}`

### Тест 2: Перевірка transaction log

```sql
SELECT
  type,
  amount,
  balance_before,
  balance_after,
  metadata->>'job_id' as job_id
FROM balance_transactions
WHERE metadata->>'job_id' = 'test-job-123'
ORDER BY created_at;
```

**Очікуваний результат**: ТІЛЬКИ 1 рефанд транзакція (навіть якщо викликав функцію 2 рази)

---

## 📊 МОНІТОРИНГ У ПРОДАКШЕНІ

### Перевірка на дублікати рефандів:

```sql
-- Знайти jobs з кількома refund транзакціями
SELECT
  bt.metadata->>'job_id' as job_id,
  COUNT(*) as refund_count,
  SUM(bt.amount) as total_refunded
FROM balance_transactions bt
WHERE bt.type = 'refund'
  AND bt.created_at > NOW() - INTERVAL '1 day'
  AND bt.metadata->>'job_id' IS NOT NULL
GROUP BY bt.metadata->>'job_id'
HAVING COUNT(*) > 1;
```

**Якщо є результати** → міграція НЕ застосована або старий worker працює!

### Перевірка балансів:

```sql
SELECT
  user_id,
  balance,
  updated_at
FROM user_balances
ORDER BY balance DESC
LIMIT 20;
```

Якщо баланси аномально високі → можливо були подвійні рефанди.

---

## 🔐 SECURITY

### Функція захищена:

- ✅ `FOR UPDATE` lock - блокує job на час транзакції
- ✅ Idempotency - перевіряє чи вже failed
- ✅ Atomic - ВСЕ в одній транзакції (refund + update status)
- ✅ Service role only - тільки backend може викликати

### Permissions:

```sql
-- Тільки service_role (backend worker)
GRANT EXECUTE ON FUNCTION refund_job_atomic TO service_role;
```

---

## 🔄 ЗМІНИ В КОДІ

### storyWorker.js (lines 162-207)

**ДО:**
```javascript
// Old code - race condition possible
const { data: jobData } = await supabase.from('story_jobs')
  .select('status').eq('job_id', jobId).single();

if (jobData?.status !== 'failed') {
  await refundBalance(userId, cost, ...); // ❌ Not atomic!
  await supabase.from('story_jobs')
    .update({ status: 'failed' }).eq('job_id', jobId);
}
```

**ПІСЛЯ:**
```javascript
// New code - ATOMIC, impossible to refund twice
const { data: refundResult } = await supabase.rpc('refund_job_atomic', {
  p_job_id: jobId,
  p_user_id: userId,
  p_amount: cost,
  p_error_message: error.message
});
// ✅ Refund + status update in ONE transaction
```

---

## 📞 TROUBLESHOOTING

### Помилка: "function refund_job_atomic does not exist"

**Причина**: Міграція не виконана

**Рішення**: Виконай Крок 1 (виконай SQL міграцію)

### Помилка: "permission denied for function refund_job_atomic"

**Причина**: Worker використовує НЕ service_role ключ

**Рішення**: Перевір `.env` → `SUPABASE_SERVICE_ROLE_KEY` (НЕ anon key!)

### Worker не бачить нову функцію

**Причина**: Старий worker process

**Рішення**: Перезапусти worker (Крок 3)

---

## ✅ CHECKLIST

- [ ] Міграція виконана в Supabase SQL Editor
- [ ] Функція `refund_job_atomic` створена (перевірено через SQL)
- [ ] Worker перезапущено з новим кодом
- [ ] Тест 1 пройдено (спроба подвійного рефанду заблокована)
- [ ] Тест 2 пройдено (тільки 1 транзакція в логах)
- [ ] Моніторинг: немає дублікатів рефандів за останню добу

---

**Дата міграції**: 2025-01-22
**Критичність**: 🔴 CRITICAL
**Час виконання**: ~10 секунд
**Rollback**: `DROP FUNCTION IF EXISTS refund_job_atomic;` (НЕ РЕКОМЕНДУЄТЬСЯ!)

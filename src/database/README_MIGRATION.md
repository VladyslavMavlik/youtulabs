# 🔒 CRITICAL SECURITY MIGRATION

## ⚠️ ОБОВ'ЯЗКОВО ДО ВИКОНАННЯ

Ця міграція виправляє **критичну вразливість race condition** у системі балансу кристалів.

**БЕЗ ЦЮЇ МІГРАЦІЇ**: Користувачі можуть відправити декілька одночасних запитів і списати баланс у мінус, отримуючи безкоштовні історії.

---

## 📋 Що виправлено

### ❌ ДО (ВРАЗЛИВІСТЬ):
```javascript
// server.js - старий код
1. SELECT balance FROM user_balances WHERE user_id = '...'  // User 1 reads: 100
2. SELECT balance FROM user_balances WHERE user_id = '...'  // User 2 reads: 100
3. UPDATE user_balances SET balance = 0 WHERE user_id = '...'  // User 1 writes: 100 - 100 = 0
4. UPDATE user_balances SET balance = -100 WHERE user_id = '...'  // User 2 writes: 100 - 100 = -100 ❌
```

### ✅ ПІСЛЯ (ЗАХИЩЕНО):
```sql
-- Postgres function з FOR UPDATE lock
BEGIN;
  SELECT balance FROM user_balances WHERE user_id = '...' FOR UPDATE;  -- LOCK ROW
  -- Жоден інший запит не може прочитати/записати до кінця транзакції
  UPDATE user_balances SET balance = new_balance WHERE user_id = '...';
  INSERT INTO balance_transactions (...);
COMMIT;
```

---

## 🚀 ІНСТРУКЦІЯ З ВСТАНОВЛЕННЯ

### Крок 1: Відкрийте Supabase SQL Editor

1. Перейдіть на https://supabase.com/dashboard
2. Оберіть ваш проект
3. Перейдіть в **SQL Editor** (ліве меню)

### Крок 2: Виконайте міграцію

1. Відкрийте файл `migration_atomic_balance_deduction.sql`
2. Скопіюйте ВЕСЬ вміст файлу
3. Вставте в SQL Editor
4. Натисніть **RUN** або `Ctrl+Enter`

### Крок 3: Перевірте виконання

Виконайте цю команду для перевірки:

```sql
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'deduct_balance_atomic',
    'refund_balance_atomic',
    'add_balance_atomic'
  );
```

**Очікуваний результат**: 3 функції типу `FUNCTION`

---

## 🔧 ЩО РОБИТЬ МІГРАЦІЯ

### 1. `deduct_balance_atomic()` - Списання балансу
- ✅ **FOR UPDATE lock** - блокує рядок на час транзакції
- ✅ Перевірка балансу і списання в одній атомарній операції
- ✅ Автоматичне створення transaction record
- ✅ Якщо transaction log падає - вся операція rollback
- ✅ Повертає balance_before і balance_after для audit trail

### 2. `refund_balance_atomic()` - Повернення коштів
- ✅ **FOR UPDATE lock** для рефандів
- ✅ Обов'язковий transaction log (з balance_before/balance_after)
- ✅ Використовується в storyWorker при помилках генерації

### 3. `add_balance_atomic()` - Поповнення (для адміна)
- ✅ Валідація типу транзакції (purchase, admin_grant, promo, bonus, subscription)
- ✅ Перевірка на позитивну суму
- ✅ Повний audit trail
- ✅ Готово для інтеграції з Apple Pay, Credit Card, тощо

---

## 🧪 ТЕСТУВАННЯ

### Тест 1: Перевірка race condition захисту

Відкрийте 2 термінали і виконайте одночасно (в межах 1 секунди):

**Термінал 1:**
```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"en-US","genre":"sci_fi","minutes":100,"prompt":"Test"}'
```

**Термінал 2:**
```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"en-US","genre":"sci_fi","minutes":100,"prompt":"Test"}'
```

**Очікуваний результат**:
- 1 запит успішний: `{"jobId":"..."}`
- 1 запит помилка: `{"error":"Insufficient balance","current":0,"required":1000}`
- Баланс НЕ пішов в мінус

### Тест 2: Перевірка transaction logging

```sql
SELECT
  user_id,
  amount,
  type,
  balance_before,
  balance_after,
  created_at
FROM balance_transactions
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

**Очікуваний результат**: Всі транзакції мають `balance_before` і `balance_after`.

---

## 📊 МОНІТОРИНГ

### Перевірка на дублікати рефандів:

```sql
-- Знайти job з кількома refund транзакціями
SELECT
  bt.metadata->>'refund_amount' as refund_amount,
  COUNT(*) as refund_count,
  bt.user_id
FROM balance_transactions bt
WHERE bt.type = 'refund'
  AND bt.created_at > NOW() - INTERVAL '1 day'
GROUP BY bt.metadata->>'refund_amount', bt.user_id
HAVING COUNT(*) > 1;
```

Якщо є результати - значить старий код ще працює або міграція не застосована.

### Перевірка балансів у мінусі:

```sql
SELECT
  user_id,
  balance,
  updated_at
FROM user_balances
WHERE balance < 0;
```

Якщо є користувачі з від'ємним балансом - зверніться до адміна для коригування.

---

## 🔐 PERMISSIONS

Функції вже мають правильні дозволи:

- `deduct_balance_atomic` → доступна для `authenticated` (користувачі)
- `refund_balance_atomic` → доступна тільки для `service_role` (backend)
- `add_balance_atomic` → доступна тільки для `service_role` (адмін/платежі)

---

## 🛡️ БЕЗПЕКА

### Захищено від:
- ✅ Race conditions (одночасні запити)
- ✅ Подвійні рефанди (idempotency)
- ✅ Втрата transaction logs (mandatory logging)
- ✅ Балансу в мінусі
- ✅ Маніпуляцій з client-side

### Адмінські функції:
- ✅ `add_balance_atomic()` - для поповнення через Apple Pay, кредитки, промо
- ✅ Валідація типу транзакції
- ✅ Повний audit trail для всіх операцій

---

## 📞 ПІДТРИМКА

Якщо виникли питання або помилки при міграції:

1. Перевірте логи Supabase SQL Editor
2. Перевірте що всі 3 функції створені (запит вище)
3. Перевірте permissions через Supabase Dashboard → Database → Functions

---

## ⚡ ROLLBACK (тільки у крайньому випадку)

Якщо потрібно відкотити міграцію:

```sql
DROP FUNCTION IF EXISTS deduct_balance_atomic(UUID, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS refund_balance_atomic(UUID, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS add_balance_atomic(UUID, INTEGER, TEXT, TEXT, JSONB);
```

**УВАГА**: Після rollback критична вразливість race condition повернеться!

---

## ✅ CHECKLIST

- [ ] Міграція виконана в Supabase SQL Editor
- [ ] 3 функції створені (перевірено через SQL)
- [ ] Тест 1 пройдено (race condition захист працює)
- [ ] Тест 2 пройдено (transaction logging працює)
- [ ] Немає балансів у мінусі
- [ ] Немає дублікатів рефандів за останню добу
- [ ] Server.js і storyWorker.js оновлені (вже зроблено)

---

**Дата міграції**: 2025-01-22
**Критичність**: 🔴 CRITICAL
**Час виконання**: ~30 секунд

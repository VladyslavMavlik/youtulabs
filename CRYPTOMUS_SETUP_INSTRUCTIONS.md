# 🔐 Cryptomus Crypto Payments - Інструкція Налаштування

## ✅ Що Вже Готово

### Backend (Node.js)
- ✅ API Routes: `/api/crypto/*` (зареєстровані в server.js)
- ✅ Cryptomus Client: `src/utils/cryptomusClient.js`
- ✅ API Key в `.env`: `N751VMD-QHVME3E-PDZXD4B-BMTKD22`
- ✅ Webhook Handler з ПОВНОЮ БЕЗПЕКОЮ

### Database (Supabase)
- ✅ Таблиця `cryptomus_payments` (створена)
- ✅ Таблиця `crypto_subscription_credits` (для підписочних кристалів з терміном дії)

### Безпека
- ✅ **Приймає ТІЛЬКИ статус `paid`**
- ✅ **Відхиляє `paid_over` (надмірна оплата)**
- ✅ **Відхиляє `wrong_amount` (неправильна сума)**
- ✅ **Відхиляє часткові оплати**
- ✅ **Перевіряє webhook signature**
- ✅ **Захист від повторного нарахування (idempotency)**

---

## 📋 Кроки Налаштування

### 1️⃣ Застосувати SQL Міграцію

Відкрий **Supabase SQL Editor**:
```
https://supabase.com/dashboard/project/xcqjtdfvsgvuglllxgzc/sql/new
```

Скопіюй і виконай SQL з файлу:
```bash
src/database/CRYPTOMUS_FINAL_MIGRATION.sql
```

Це створить функцію `grant_crystals_from_cryptomus_payment`, яка:
- ✅ Нараховує кристали в `crypto_subscription_credits`
- ✅ Встановлює термін дії **30 днів**
- ✅ Відхиляє всі статуси крім `paid`

**Перевірка:** Виконай в SQL Editor:
```sql
-- Має повернути інформацію про функцію
SELECT proname, prosrc FROM pg_proc
WHERE proname = 'grant_crystals_from_cryptomus_payment';
```

---

### 2️⃣ Налаштувати Webhook в Cryptomus Dashboard

1. Зайди в **Cryptomus Dashboard**: https://app.cryptomus.com/
2. Перейди в **Settings** → **Webhooks**
3. Встанови Webhook URL:
   ```
   https://youtulabs.com/api/crypto/webhook
   ```
4. Увімкни **Webhook Signature Verification**
5. Збережи налаштування

**ВАЖЛИВО:** Webhook URL має бути доступний публічно. Якщо тестуєш локально, використай **ngrok**:
```bash
ngrok http 3000
# Потім використай URL типу: https://abc123.ngrok.io/api/crypto/webhook
```

---

### 3️⃣ Перевірити IP Whitelist (Опціонально, але рекомендовано)

Cryptomus надсилає webhooks з IP: **91.227.144.54**

Можеш додати перевірку IP в `cryptoRoutes.js` (вже готова заглушка).

---

## 🧪 Тестування

### Тест 1: Перевірка API Plans
```bash
curl http://localhost:3000/api/crypto/plans | jq
```

**Очікуваний результат:**
```json
{
  "success": true,
  "plans": [
    {
      "id": "starter",
      "price_usd": 10,
      "crystals": 2000,
      "description": "2,000 crystals for $10"
    },
    {
      "id": "pro",
      "price_usd": 25,
      "crystals": 6000,
      "description": "6,000 crystals for $25"
    },
    {
      "id": "ultimate",
      "price_usd": 75,
      "crystals": 20000,
      "description": "20,000 crystals for $75"
    }
  ]
}
```

### Тест 2: Створення Платежу (потрібен access token)
```bash
curl -X POST http://localhost:3000/api/crypto/create-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"plan_id": "starter"}' | jq
```

**Очікуваний результат:**
```json
{
  "success": true,
  "payment": {
    "order_id": "YTL-1234567890-abc123",
    "payment_uuid": "uuid-from-cryptomus",
    "payment_url": "https://pay.cryptomus.com/pay/...",
    "amount_usd": 10,
    "crystals_amount": 2000,
    "plan_id": "starter",
    "status": "pending",
    "expires_at": "2025-12-08T03:00:00.000Z"
  }
}
```

### Тест 3: Перевірка Статусу Платежу
```bash
curl http://localhost:3000/api/crypto/payment/YTL-1234567890-abc123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" | jq
```

---

## 🔄 Flow Оплати

### 1. Користувач обирає підписку
Frontend → `POST /api/crypto/create-payment`
```javascript
{
  "plan_id": "pro" // or "starter" or "ultimate"
}
```

### 2. Backend створює платіж
- Генерує `order_id`: `YTL-{timestamp}-{random}`
- Викликає Cryptomus API
- Зберігає в `cryptomus_payments`
- Повертає `payment_url` і дані для QR коду

### 3. Користувач оплачує
- Frontend показує модальне вікно з:
  - Адресою гаманця
  - QR кодом
  - Сумою в обраній криптовалюті
  - Таймером (1 година)

### 4. Webhook від Cryptomus
```
POST /api/crypto/webhook
```

Backend:
1. ✅ Перевіряє signature
2. ✅ Оновлює статус в `cryptomus_payments`
3. ✅ **Якщо статус = `paid`:**
   - Викликає `grant_crystals_from_cryptomus_payment(payment_id)`
   - Створює запис в `crypto_subscription_credits` з `expires_at = now() + 30 days`
   - Позначає `crystals_granted = true`
4. ✅ **Якщо статус = `paid_over`, `wrong_amount`, `failed`:**
   - Відхиляє
   - Зберігає `error_message`
   - Логує для аудиту

### 5. Frontend перевіряє статус
Polling або Realtime subscription на `cryptomus_payments`:
```javascript
// Realtime (рекомендовано)
supabase
  .channel('crypto_payments')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'cryptomus_payments',
    filter: `order_id=eq.${orderId}`
  }, (payload) => {
    if (payload.new.status === 'paid') {
      // ✅ Показати success
      // Оновити баланс користувача
    } else if (payload.new.error_message) {
      // ❌ Показати помилку
    }
  })
  .subscribe();
```

---

## 🎯 Важливі Деталі

### Підписочні Кристали (Згорають через 30 днів)
- Зберігаються в `crypto_subscription_credits`
- Мають `expires_at = created_at + 30 days`
- `status = 'active'`
- Після 30 днів - **згорають**

### Звичайні Кристали (НЕ згорають)
- Зберігаються в `user_credits`
- Можуть мати `expires_at = null` (безстрокові)
- Купуються окремо (якщо буде меню "Купити кристали")

### Логіка Витрачання Кристалів
Рекомендую спочатку витрачати підписочні кристали (які згорають), потім звичайні:
```sql
-- Приклад: функція витрачання кристалів
-- 1. Спочатку витратити з crypto_subscription_credits (з найближчим expires_at)
-- 2. Потім з user_credits
```

---

## 🚀 Webhook URL для Production

**Поточний URL в .env:**
```
CRYPTOMUS_WEBHOOK_URL=https://youtulabs.com/api/crypto/webhook
```

**ВАЖЛИВО:**
1. Переконайся що домен `youtulabs.com` налаштований і працює
2. Сертифікат SSL активний (Cryptomus вимагає HTTPS)
3. Endpoint `/api/crypto/webhook` доступний публічно (без авторизації)

### Для локального тестування:
```bash
# Встанови ngrok
npm install -g ngrok

# Запусти tunnel
ngrok http 3000

# Використай URL типу:
https://abc123.ngrok.io/api/crypto/webhook
```

**Не забудь:** Змінити webhook URL в Cryptomus Dashboard на ngrok URL під час тестування!

---

## 📊 Моніторинг і Логи

### Логи Backend
Всі webhooks логуються в консолі:
```
[CRYPTO WEBHOOK] Received webhook: { orderId: 'YTL-...', status: 'paid' }
[CRYPTO WEBHOOK] ✅ Subscription credits granted: { ... }
```

### Перевірка в Supabase
```sql
-- Всі платежі
SELECT * FROM cryptomus_payments
ORDER BY created_at DESC LIMIT 10;

-- Підписочні кристали
SELECT * FROM crypto_subscription_credits
WHERE user_id = 'USER_ID'
ORDER BY created_at DESC;

-- Помилки
SELECT order_id, status, error_message
FROM cryptomus_payments
WHERE error_message IS NOT NULL;
```

---

## 🔒 Безпека - Checklist

- [x] Webhook signature verification
- [x] Тільки статус `paid` дозволений
- [x] Відхилення `paid_over` (надмірна оплата)
- [x] Відхилення `wrong_amount` (неправильна сума)
- [x] Захист від повторного нарахування (idempotency)
- [x] Логування відхилених платежів
- [x] Зберігання `error_message` в БД
- [ ] IP Whitelist (опціонально): `91.227.144.54`
- [x] HTTPS для webhook URL
- [x] Service Role Key тільки на backend

---

## 📞 Troubleshooting

### Помилка: "CRYPTOMUS_API_KEY not configured"
**Рішення:** Перевір `.env` файл, має бути:
```
CRYPTOMUS_API_KEY=N751VMD-QHVME3E-PDZXD4B-BMTKD22
```

### Помилка: "Invalid signature" в webhook
**Рішення:**
1. Перевір що API Key правильний
2. Cryptomus надсилає signature в header `sign`
3. Функція `verifyWebhookSignature` перевіряє MD5(base64(body) + API_KEY)

### Помилка: "Function grant_crystals_from_cryptomus_payment not found"
**Рішення:** Застосуй SQL міграцію з кроку 1️⃣

### Платіж створюється але webhook не приходить
**Рішення:**
1. Перевір webhook URL в Cryptomus Dashboard
2. Переконайся що URL доступний публічно (не localhost)
3. Перевір логи Cryptomus Dashboard → Webhooks History

---

## ✅ Готово!

Система готова до використання. Залишилось:
1. Застосувати SQL міграцію (крок 1️⃣)
2. Налаштувати webhook URL в Cryptomus (крок 2️⃣)
3. Протестувати створення платежу

**Webhook Endpoint:**
```
POST https://youtulabs.com/api/crypto/webhook
```

Цей endpoint обробляє всі статуси від Cryptomus і нараховує підписочні кристали з терміном дії 30 днів.

# 🔧 Інструкція: Застосування Cryptomus Міграції

## Проблема
Помилка "Failed to create crypto payment" виникає тому, що:
1. Таблиця `cryptomus_payments` може не існувати
2. Таблиця `cryptomus_subscription_credits` не створена  
3. Функція `grant_crystals_from_cryptomus_payment` використовує неіснуючу таблицю

## Рішення

### Варіант 1: Через Supabase Dashboard (РЕКОМЕНДОВАНО)

1. Відкрий Supabase Dashboard:
   ```
   https://supabase.com/dashboard/project/xcqjtdfvsgvuglllxgzc/sql/new
   ```

2. Скопіюй весь вміст файлу:
   ```
   /Volumes/T7 1/YouTulabs_V/v1.2.13/src/database/CRYPTOMUS_COMPLETE_MIGRATION.sql
   ```

3. Вставь в SQL Editor

4. Натисни **RUN** або **Ctrl+Enter**

5. Перевір що все пройшло успішно (no errors)

### Варіант 2: Через psql CLI

```bash
cd "/Volumes/T7 1/YouTulabs_V/v1.2.13"

# Завантаж SUPABASE_SERVICE_ROLE_KEY з .env
source .env

# Застосуй міграцію
psql "postgresql://postgres.xcqjtdfvsgvuglllxgzc:$SUPABASE_SERVICE_ROLE_KEY@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  -f src/database/CRYPTOMUS_COMPLETE_MIGRATION.sql
```

## Перевірка

Після застосування міграції, перевір:

```bash
cd "/Volumes/T7 1/YouTulabs_V/v1.2.13"
bash /tmp/test_migration.sh
```

Або через curl:

```bash
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d= -f2)

curl -X POST "https://xcqjtdfvsgvuglllxgzc.supabase.co/rest/v1/rpc/grant_crystals_from_cryptomus_payment" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_payment_id": "00000000-0000-0000-0000-000000000000"}'
```

Очікуваний результат:
```json
[
  {
    "success": false,
    "message": "Payment not found",
    "new_balance": 0
  }
]
```

## Що створюється

1. **Таблиця `cryptomus_payments`** - зберігає всі Cryptomus платежі
2. **Таблиця `cryptomus_subscription_credits`** - підписочні кредити (згорають через 30 днів)
3. **Функція `grant_crystals_from_cryptomus_payment(UUID)`** - дає кредити з захистом від дублювання

## Після міграції

Спробуй знову створити платіж через frontend:
1. Відкрий http://localhost:5174/subscription
2. Вибери план (Starter/Pro/Ultimate)
3. Клікни "Subscribe with Crypto"
4. Вибери криптовалюту
5. Перевір що не показується помилка "Failed to create crypto payment"

---

✅ Після успішного застосування можна видалити цей файл.

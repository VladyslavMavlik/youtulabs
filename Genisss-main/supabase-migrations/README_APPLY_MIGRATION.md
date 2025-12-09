# Як застосувати міграцію 015_add_username_uniqueness.sql

## Опція 1: Через Supabase Dashboard (Рекомендовано)

1. Відкрийте https://supabase.com/dashboard/project/xcqjtdfvsgvuglllxgzc/sql/new
2. Скопіюйте весь вміст файлу `015_add_username_uniqueness.sql`
3. Вставте в SQL Editor
4. Натисніть "Run" або Ctrl+Enter

## Опція 2: Через psql (командний рядок)

Якщо у вас встановлений PostgreSQL клієнт:

```bash
psql "postgresql://postgres:[YOUR_PASSWORD]@db.xcqjtdfvsgvuglllxgzc.supabase.co:5432/postgres" -f supabase-migrations/015_add_username_uniqueness.sql
```

## Що робить ця міграція?

- ✅ Створює функцію `check_username_exists()` яка перевіряє чи існує користувач з таким ім'ям
- ✅ Перевірка є case-insensitive ("John" = "john" = "JOHN")
- ✅ Дозволяє виклик функції для authenticated та anonymous користувачів

## Перевірка що міграція застосована

Виконайте в SQL Editor:

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'check_username_exists';
```

Якщо побачите рядок з `check_username_exists` - міграція успішно застосована! ✅

## Тестування

Після застосування міграції спробуйте:
1. Зареєструватись з ім'ям "TestUser"
2. Спробуйте зареєструватись ще раз з тим самим ім'ям
3. Має з'явитись помилка: "This username is already taken. Please choose another one."

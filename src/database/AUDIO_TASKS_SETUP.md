# Audio Tasks Realtime Setup

## Що це?
Система відстеження генерації аудіо через Supabase Realtime замість localStorage.

## Переваги:
- ✅ Працює на всіх вкладках/пристроях одночасно
- ✅ Надійне збереження в БД
- ✅ Автоматична синхронізація статусу
- ✅ Можна бачити прогрес з телефону/комп'ютера

## Крок 1: Перевірити чи таблиця вже існує

```bash
node src/database/check-audio-tasks.js
```

Якщо таблиця існує - скрипт покаже структуру.
Якщо НЕ існує - продовжуй до кроку 2.

## Крок 2: Запустити міграцію

### Варіант A: Автоматично (рекомендовано)
```bash
node src/database/run-audio-tasks-migration.js
```

### Варіант B: Вручну
1. Відкрий Supabase Dashboard → SQL Editor
2. Скопіюй весь вміст файлу `migration_audio_tasks.sql`
3. Вставь і виконай

## Крок 3: Перевірка

Після міграції перевір:
1. Таблиця `audio_tasks` створена
2. RLS політики активні
3. Realtime увімкнено

Виконай:
```sql
SELECT * FROM audio_tasks LIMIT 1;
```

## Що далі?

Frontend вже підготовлений для роботи з Realtime:
- При створенні аудіо → запис в БД
- При оновленні статусу → автоматичне оновлення UI
- При перезавантаженні → відновлення активних задач

## Troubleshooting

**Помилка: relation "audio_tasks" does not exist**
→ Таблиця не створена, запусти міграцію

**Помилка: permission denied**
→ Перевір RLS політики

**Realtime не працює**
→ Перевір: `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`
→ Має бути `audio_tasks` в списку

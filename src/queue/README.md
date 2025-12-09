# Story Generation Queue System

## Огляд

Система черг для фонової генерації історій з використанням Bull + Redis.

### Переваги:
- ✅ **Генерація у фоні** - користувач може закрити браузер
- ✅ **Обмеження конкурентності** - максимум 5 одночасних генерацій
- ✅ **Retry при збоях** - до 3 спроб
- ✅ **Історія зберігається ДО генерації** - не втрачається при збоях
- ✅ **Сервер не впаде** при 100+ запитах

## Налаштування

### 1. Встановити Redis

**macOS (з Homebrew):**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Windows:**
- Завантажити з https://github.com/microsoftarchive/redis/releases
- Або використовувати WSL

**Docker:**
```bash
docker run -d -p 6379:6379 redis:latest
```

### 2. Виконати міграцію бази даних

У Supabase SQL Editor виконайте:
```sql
-- Файл: src/database/migration_story_jobs.sql
```

### 3. Запустити Worker

У **окремому терміналі**:
```bash
cd src
node queue/storyWorker.js
```

Worker буде обробляти job'и з черги у фоні (5 одночасно).

### 4. Запустити API Server

```bash
npm start
```

## Як це працює

### Архітектура:

```
User Browser → API Server → Redis Queue → Worker → Database
                   ↓                          ↓
              Response (jobId)            Story saved
                   ↓
             Poll /api/job/:jobId
                   ↓
           Get story when complete
```

### Потік роботи:

1. **Користувач натискає "Generate"**
   - Frontend надсилає POST `/api/generate`
   - Баланс списується ОДРАЗУ
   - Job створюється в БД
   - Job додається в Redis чергу
   - **API відповідає одразу** з `jobId`

2. **Worker обробляє job у фоні**
   - Worker бере job з черги
   - Генерує історію (4-5 хвилин)
   - Зберігає історію в БД
   - Оновлює статус job на 'completed'

3. **Frontend перевіряє статус**
   - Кожні 5 секунд викликає GET `/api/job/:jobId`
   - Коли status === 'completed', отримує `storyId`
   - Завантажує історію через GET `/api/story/:storyId`

### Статуси Job:

- `pending` - У черзі, очікує обробки
- `processing` - Worker обробляє зараз
- `completed` - Готово, історія збережена
- `failed` - Помилка генерації

## API Endpoints

### POST /api/generate
Додає job у чергу.

**Response:**
```json
{
  "jobId": "abc123",
  "status": "queued",
  "message": "Story generation queued successfully",
  "estimatedWaitTime": {
    "position": 3,
    "queueLength": 10,
    "activeJobs": 5,
    "estimatedMinutes": 8
  }
}
```

### GET /api/job/:jobId
Перевіряє статус job.

**Response (pending):**
```json
{
  "jobId": "abc123",
  "status": "pending",
  "waitTime": {
    "position": 2,
    "estimatedMinutes": 4
  }
}
```

**Response (completed):**
```json
{
  "jobId": "abc123",
  "status": "completed",
  "storyId": "story-uuid-here",
  "result": {
    "generationTime": 245.3,
    "quality": "excellent",
    "words": 1250
  }
}
```

### GET /api/story/:storyId
Отримує готову історію.

## Конфігурація

### .env
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # Опціонально
```

### Concurrency (storyQueue.js)
```javascript
limiter: {
  max: 5, // Максимум 5 одночасних job'ів
  duration: 1000,
}
```

### Worker Concurrency (storyWorker.js)
```javascript
storyQueue.process(5, async (job) => {
  // Обробляє до 5 job'ів паралельно
});
```

## Моніторинг

### Перевірити Redis
```bash
redis-cli ping
# Має відповісти: PONG
```

### Перевірити чергу (в Node.js)
```javascript
const waiting = await storyQueue.getWaitingCount();
const active = await storyQueue.getActiveCount();
const completed = await storyQueue.getCompletedCount();
const failed = await storyQueue.getFailedCount();
```

### Очистити чергу
```javascript
await storyQueue.clean(0, 'completed'); // Видалити всі completed
await storyQueue.clean(0, 'failed'); // Видалити всі failed
await storyQueue.empty(); // Видалити ВСЕ
```

## Production Deployment

### 1. Використовуйте managed Redis
- **Upstash Redis** (безкоштовний tier)
- **Redis Cloud**
- **AWS ElastiCache**

### 2. Запустіть worker як окремий процес
```bash
# Using PM2
pm2 start src/queue/storyWorker.js --name story-worker

# Using systemd
sudo systemctl start story-worker
```

### 3. Масштабування
- Запустіть кілька worker'ів на різних серверах
- Усі вони будуть обробляти одну чергу
- Redis автоматично розподіляє навантаження

## Troubleshooting

### "Error: connect ECONNREFUSED 127.0.0.1:6379"
Redis не запущений. Запустіть: `redis-server`

### Job застряг у "pending"
Worker не запущений. Запустіть: `node queue/storyWorker.js`

### Повільна обробка
- Збільшіть concurrency у worker
- Запустіть більше worker'ів
- Використовуйте потужніший сервер

## Безпека

✅ Баланс списується ДО додавання в чергу
✅ RLS політики на `story_jobs` таблиці
✅ Користувачі бачать тільки свої job'и
✅ Rate limiting на API endpoints
✅ JWT authentication на всіх endpoints

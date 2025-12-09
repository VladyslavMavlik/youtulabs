# Управління Storage на FREE Tier

## Обмеження Supabase FREE Tier

- **Total Storage**: 1 GB (всього для всіх користувачів)
- **Max file size**: 50 MB
- **Database**: 500 MB

## Скільки поміститься?

### Реальні сценарії:

| Тип аудіо | Розмір | Кількість на 1 GB | Приклад |
|-----------|--------|-------------------|---------|
| Короткі історії (5-10 хв, 96kbps) | ~5 MB | **200 аудіо** | 20 користувачів × 10 історій |
| Середні історії (30 хв, 96kbps) | ~15 MB | **66 аудіо** | 10 користувачів × 6-7 історій |
| Довгі історії (60 хв, 128kbps) | ~50 MB | **20 аудіо** | 10 користувачів × 2 історії |

### Оптимізація:

**Використання 64 kbps замість 128 kbps:**
- Якість: достатня для мови
- Розмір: **вдвічі менший**
- 60 хв: ~25 MB замість ~50 MB
- **В 1 GB поміститься вдвічі більше!**

## Автоматичне очищення

### 1. Cleanup по віку файлів

```javascript
// Видалити файли старші за 30 днів
import { cleanupOldAudioFiles } from './utils/audioCleanup.js';

const result = await cleanupOldAudioFiles(30);
console.log(`Видалено ${result.deleted} файлів, звільнено ${result.freedSpaceMB} MB`);
```

### 2. Cleanup при наближенні до ліміту

```javascript
// Автоматично звільнити місце при використанні >80%
import { autoCleanup } from './utils/audioCleanup.js';

const result = await autoCleanup();
// Видаляє найстаріші файли поки не звільниться 20% (200 MB)
```

### 3. Моніторинг використання

```javascript
import { getStorageStats } from './utils/audioCleanup.js';

const stats = await getStorageStats();
console.log(`
Використано: ${stats.totalMB} MB / ${stats.limitMB} MB (${stats.usagePercent}%)
Файлів: ${stats.totalFiles}
Користувачів: ${stats.uniqueUsers}
Залишилось: ${stats.remainingMB} MB
`);
```

## Налаштування Cron Job

### Варіант 1: Node-cron (простий)

```javascript
// src/cron/storageMaintenance.js
import cron from 'node-cron';
import { autoCleanup, getStorageStats } from '../utils/audioCleanup.js';

// Щодня о 3:00 ночі
cron.schedule('0 3 * * *', async () => {
  console.log('[CRON] Running daily storage maintenance...');

  try {
    // Перевірити статистику
    const stats = await getStorageStats();
    console.log(`[CRON] Storage: ${stats.usagePercent}%`);

    // Автоочищення якщо >80%
    if (stats.nearLimit) {
      const result = await autoCleanup();
      console.log(`[CRON] Cleaned: ${result.freedSpaceMB} MB`);
    }
  } catch (error) {
    console.error('[CRON] Maintenance failed:', error);
  }
});

export function startStorageMaintenance() {
  console.log('[CRON] Storage maintenance cron job started');
}
```

### Додати до server.js:

```javascript
import { startStorageMaintenance } from './cron/storageMaintenance.js';

// Після запуску сервера
startStorageMaintenance();
```

### Варіант 2: Supabase Edge Function (рекомендовано)

Створити Edge Function що викликається webhook або cron:

```sql
-- Запланувати виконання через pg_cron
SELECT cron.schedule(
  'audio-cleanup',
  '0 3 * * *', -- Щодня о 3:00
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/audio-cleanup',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
  )
  $$
);
```

## API Endpoints для моніторингу

### GET /api/audio/stats

```javascript
// src/routes/audioRoutes.js

router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    // User stats
    const userAudios = await getUserAudioGenerations(userId);
    const userSize = userAudios.reduce((sum, a) => sum + (a.file_size_bytes || 0), 0);

    res.json({
      success: true,
      user: {
        totalFiles: userAudios.length,
        totalMB: (userSize / (1024 * 1024)).toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### GET /api/audio/global-stats (admin only)

```javascript
router.get('/global-stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getStorageStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Стратегії оптимізації

### 1. Політика зберігання (рекомендовано)

**FREE tier: 30 днів**
- Автоматично видаляти аудіо старше 30 днів
- Попереджати користувача заздалегідь
- Дозволити завантажити перед видаленням

**PRO tier: необмежено**
- Платні користувачі мають довічне зберігання

### 2. Квоти на користувача

```javascript
// Ліміт файлів на користувача (FREE tier)
const MAX_FILES_PER_USER = 10;

// При завантаженні нового
const userAudios = await getUserAudioGenerations(userId);
if (userAudios.length >= MAX_FILES_PER_USER) {
  // Видалити найстаріший
  await deleteAudioGeneration(userId, userAudios[0].audio_number);
}
```

### 3. Compression

Для дуже довгих історій:
- 64 kbps mono: достатня якість для мови
- Додаткова компресія MP3

## Міграція на більший план

Якщо 1 GB недостатньо:

### Supabase PRO ($25/міс):
- Storage: **100 GB** (×100 більше!)
- File size limit: до 5 GB
- Database: **8 GB**
- Priority support

### CloudFlare R2:
- Storage: $0.015/GB
- **Egress безкоштовний** (в Supabase платний після ліміту)
- Необмежений розмір файлів

## Моніторинг у Dashboard

Додати метрики в admin panel:

```javascript
// Dashboard
const stats = await getStorageStats();

<div className="storage-widget">
  <h3>Storage Usage</h3>
  <ProgressBar value={stats.usagePercent} max={100} />
  <p>{stats.totalMB} MB / {stats.limitMB} MB</p>
  <p>{stats.totalFiles} files, {stats.uniqueUsers} users</p>

  {stats.nearLimit && (
    <Alert type="warning">
      ⚠️ Storage near limit! Consider cleanup or upgrade.
    </Alert>
  )}
</div>
```

## Висновок

**FREE tier (1 GB) підходить для:**
- ✅ Тестування та MVP
- ✅ 10-20 активних користувачів
- ✅ Короткі історії (5-30 хв)
- ✅ З автоочищенням через 30 днів

**Потрібен upgrade якщо:**
- ❌ >50 активних користувачів
- ❌ Довгострокове зберігання
- ❌ Дуже довгі аудіо (>60 хв)
- ❌ Використання >80% регулярно

**Рекомендована стратегія для старту:**
1. FREE tier + автоочищення 30 днів
2. Моніторинг через dashboard
3. Upgrade на PRO коли досягнете 50 користувачів
4. Або міграція на R2 для масштабування

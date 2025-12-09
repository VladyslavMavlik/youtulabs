# Audio Generations System - Setup Guide

## Огляд

Система для зберігання та управління аудіогенераціями користувачів з автоматичною нумерацією та захистом доступу.

## Архітектура

### Зберігання
- **База даних**: Supabase PostgreSQL (таблиця `audio_generations`)
- **Файли**: Supabase Storage (bucket `audio-generations`)
- **Структура**: `{userId}/audio_001.mp3`, `{userId}/audio_002.mp3`, ...

### Безпека
- ✅ JWT аутентифікація (middleware `authenticateUser`)
- ✅ Row Level Security (RLS) на таблиці та storage
- ✅ Користувач бачить тільки свої файли
- ✅ Автоматична нумерація (1, 2, 3, ...)

## Налаштування

### 1. Створити таблицю в Supabase

Виконайте SQL з файлу `src/database/migration_audio_generations.sql`:

```bash
# Скопіюйте вміст файлу та виконайте в Supabase SQL Editor
```

Це створить:
- Таблицю `audio_generations`
- Індекси для швидкого пошуку
- RLS policies для безпеки
- Функцію `get_next_audio_number()` для автонумерації

### 2. Перевірити ліміт файлів

**Supabase файл ліміти:**
- **FREE tier**: 50 MB (фіксований, не можна змінити)
- **PRO tier**: можна збільшити в Settings → Storage → File upload limit

**50 MB = ~50 хвилин аудіо** (MP3 128kbps) або **~2 години** (MP3 64kbps)

Якщо у вас FREE tier - все вже налаштовано! Код автоматично валідує 50 MB.

Якщо PRO tier і потрібно більше:
1. Settings → Storage → File upload limit → збільште до 100+ MB
2. Змініть `MAX_FILE_SIZE` в `src/utils/audioStorage.js`

### 3. Створити Storage Bucket

**Варіант A: Через Supabase Dashboard (рекомендовано)**

1. Перейдіть в розділ **Storage** в Supabase Dashboard
2. Натисніть **"Create Bucket"**
3. Налаштування:
   - **Name**: `audio-generations`
   - **Public**: `OFF` (приватний bucket)
   - **File size limit**: `50 MB` (можна збільшити пізніше)
   - **Allowed MIME types**: `audio/mpeg`, `audio/mp3`

**Варіант B: Через SQL**

Виконайте `src/database/setup_audio_storage.sql` для створення RLS policies на storage.

### 4. Перевірити змінні оточення

У файлі `.env` мають бути:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 5. Перезапустити сервер

```bash
npm start
```

Сервер автоматично підключить routes `/api/audio/*`

## API Endpoints

Всі endpoints вимагають JWT токен в заголовку `Authorization: Bearer <token>`.

### 1. Upload Audio

```http
POST /api/audio/upload
Content-Type: application/json
Authorization: Bearer <token>

{
  "audioBuffer": "base64_encoded_mp3_data",
  "metadata": {
    "title": "My Story",
    "language": "uk-UA",
    "voice_id": "voice_123",
    "duration_seconds": 180
  }
}
```

**Response:**
```json
{
  "success": true,
  "audio": {
    "id": "uuid",
    "audio_number": 1,
    "storage_path": "user-id/audio_001.mp3",
    "signed_url": "https://...",
    "file_size_bytes": 1234567,
    "metadata": {...},
    "created_at": "2023-12-07T10:00:00Z"
  }
}
```

### 2. List User's Audios

```http
GET /api/audio/list?limit=100
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "audios": [
    {
      "id": "uuid",
      "audio_number": 3,
      "storage_path": "user-id/audio_003.mp3",
      "signed_url": "https://...",
      "file_size_bytes": 1234567,
      "duration_seconds": 180,
      "metadata": {...},
      "created_at": "2023-12-07T10:00:00Z"
    }
  ],
  "count": 3
}
```

### 3. Get Specific Audio

```http
GET /api/audio/15
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "audio": {
    "id": "uuid",
    "audio_number": 15,
    "signed_url": "https://...",
    ...
  }
}
```

### 4. Delete Audio

```http
DELETE /api/audio/15
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Audio 15 deleted successfully"
}
```

### 5. Download Audio

```http
GET /api/audio/download/15
Authorization: Bearer <token>
```

Redirects to signed URL for download.

## Використання в коді

### Backend (генерація аудіо)

```javascript
import {
  getNextAudioNumber,
  uploadAudioFile,
  createAudioGenerationRecord
} from './utils/audioStorage.js';

// Після генерації MP3
async function saveAudio(userId, mp3Buffer, metadata) {
  // Отримати наступний номер
  const audioNumber = await getNextAudioNumber(userId);

  // Завантажити файл
  const { path: storagePath } = await uploadAudioFile(
    userId,
    audioNumber,
    mp3Buffer
  );

  // Створити запис в БД
  const record = await createAudioGenerationRecord({
    userId,
    audioNumber,
    storagePath,
    fileSizeBytes: mp3Buffer.length,
    durationSeconds: metadata.duration,
    metadata
  });

  return record;
}
```

### Frontend (отримання списку)

```javascript
async function fetchUserAudios() {
  const response = await fetch('/api/audio/list', {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });

  const data = await response.json();
  return data.audios; // Масив аудіо з signed URLs
}
```

## Особливості

### Автоматична нумерація
- Кожен користувач має власну нумерацію: 1, 2, 3, ...
- Використовується SQL функція `get_next_audio_number()`
- Номери не повторюються (UNIQUE constraint)

### Безпека
- **RLS на таблиці**: `auth.uid() = user_id`
- **RLS на storage**: шлях повинен починатися з `{userId}/`
- **Signed URLs**: тимчасові посилання (1 година за замовчуванням)
- **Service role**: backend має повний доступ

### Обмеження
- **Розмір файлу**: 50 MB (FREE tier) або більше (PRO tier)
- **MIME type**: `audio/mpeg`, `audio/mp3`
- **Signed URL expiry**: 3600 секунд (1 година)
- **50 MB вміщує**: ~50 хвилин (128kbps) або ~2 години (64kbps)

## Ціноутворення Supabase Storage

- **Storage**: ~$0.023/GB/місяць
- **Bandwidth**: безкоштовно до 200GB/місяць
- **API requests**: безкоштовно до 5M/місяць

Приклад: 1000 файлів × 5MB = 5GB = ~$0.12/місяць

## Міграція на інше сховище

Систему легко мігрувати на CloudFlare R2, AWS S3, або локальну ФС:

1. Змінити реалізацію функцій в `utils/audioStorage.js`
2. API endpoints залишаться ті ж
3. Структура БД не змінюється

## Troubleshooting

### Error: "File too large: X MB exceeds 50 MB limit"

**Нормальне обмеження для FREE tier.**

Рішення:
1. **Зменшити якість аудіо** - використати нижчий bitrate (64kbps замість 128kbps)
2. **Скоротити тривалість** - генерувати коротші історії
3. **Upgrade на PRO tier** - потім збільшити ліміт в Settings → Storage

**Що вміщається в 50 MB:**
- 128 kbps (стандарт): ~50 хвилин
- 96 kbps (добра якість): ~65 хвилин
- 64 kbps (достатньо для мови): ~120 хвилин

### Error: "Bucket not found"
- Створіть bucket `audio-generations` в Supabase Dashboard

### Error: "RLS policy violated"
- Перевірте, що виконали `setup_audio_storage.sql`
- Перевірте, що передаєте JWT токен

### Error: "Failed to get next audio number"
- Перевірте, що виконали `migration_audio_generations.sql`
- Перевірте `SUPABASE_SERVICE_ROLE_KEY` в `.env`

## Приклад повного циклу

```javascript
// 1. Користувач генерує аудіо
const audioBuffer = await generateAudioFromText(text);

// 2. Backend зберігає аудіо
const audioNumber = await getNextAudioNumber(userId);
const { path } = await uploadAudioFile(userId, audioNumber, audioBuffer);
await createAudioGenerationRecord({
  userId,
  audioNumber,
  storagePath: path,
  fileSizeBytes: audioBuffer.length,
  durationSeconds: 180,
  metadata: { title: "My Story" }
});

// 3. Frontend отримує список
const audios = await fetchUserAudios(); // API call

// 4. Користувач відтворює аудіо
const audio = audios.find(a => a.audio_number === 1);
audioPlayer.src = audio.signed_url;
audioPlayer.play();
```

## Підтримка

Файли системи:
- `src/database/migration_audio_generations.sql` - таблиця
- `src/database/setup_audio_storage.sql` - storage policies
- `src/utils/audioStorage.js` - утиліти
- `src/routes/audioRoutes.js` - API endpoints
- `src/server.js` - підключення routes (lines 19, 180)

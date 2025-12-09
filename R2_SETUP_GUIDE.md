# CloudFlare R2 Setup Guide

## Чому R2?

✅ **Переваги над Supabase Storage:**
- **Безкоштовний egress** (віддача файлів 0$)
- **Немає ліміту на розмір storage** (платиш тільки $0.015/GB)
- **Необмежений розмір файлів** (не 50 MB як у Supabase FREE)
- **S3-сумісний** API (легко мігрувати)
- **CDN інтеграція** через CloudFlare

## Крок 1: Знайти Account ID

1. Відкрийте [CloudFlare Dashboard](https://dash.cloudflare.com/)
2. В правому сайдбарі знайдіть **Account ID**
3. Скопіюйте його (виглядає як: `a1b2c3d4e5f6g7h8`)

**Додайте в `.env`:**
```env
R2_ACCOUNT_ID=your-account-id-here
```

## Крок 2: Створити R2 Bucket

1. В CloudFlare Dashboard перейдіть до **R2 Object Storage**
2. Натисніть **"Create bucket"**
3. Налаштування:
   - **Bucket name**: `audio-generations` (або інша назва)
   - **Location**: Auto (CloudFlare автоматично вибере)
4. Натисніть **"Create bucket"**

**Оновіть в `.env`:**
```env
R2_BUCKET_NAME=audio-generations
```

## Крок 3: Перевірити API credentials

Ваші ключі вже додані в `.env`:
```env
R2_ACCESS_KEY_ID=3b85641367184ae80db66c3b0b3951c2
R2_SECRET_ACCESS_KEY=7a6393a6d02b7f430859e4b9e39f5dfe7b5ada60a80398aa45259ae626571774
```

**Перевірити що ключі працюють:**

Перейдіть: **R2 → Manage R2 API Tokens**

Якщо потрібно створити нові:
1. **Create API Token**
2. **Permission**: Read & Write
3. **Buckets**: Specific bucket → `audio-generations`
4. Скопіюйте Access Key ID та Secret Access Key

## Крок 4: (Опціонально) Налаштувати Public URL

Якщо потрібно щоб файли були доступні без signed URLs:

1. В bucket settings натисніть **"Connect Domain"**
2. Додайте custom domain (напр. `audio.youtulabs.com`)
3. CloudFlare автоматично налаштує SSL

**Додайте в `.env`:**
```env
R2_PUBLIC_URL=https://audio.youtulabs.com
```

**Або використовуйте R2.dev subdomain:**
```env
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxx.r2.dev
```

## Крок 5: Перезапустити сервер

```bash
npm start
```

**Перевірте лог:**
```
[R2] Initialized with endpoint: https://your-account-id.r2.cloudflarestorage.com
[AUDIO ROUTES] Using storage backend: CloudFlare R2
```

## Тестування

### Upload test:

```bash
curl -X POST http://localhost:3000/api/audio/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audioBuffer": "base64_encoded_audio",
    "metadata": {
      "title": "Test Audio",
      "duration_seconds": 60
    }
  }'
```

### Перевірити в R2 Dashboard:

1. **R2 → audio-generations bucket**
2. Повинні з'явитись файли в структурі:
   ```
   user-uuid/
     ├── audio_001.mp3
     └── audio_002.mp3
   ```

## Структура файлів

```
R2 Bucket: audio-generations
├── user-abc123-xyz/
│   ├── audio_001.mp3
│   ├── audio_002.mp3
│   └── audio_003.mp3
├── user-def456-uvw/
│   └── audio_001.mp3
```

- Кожен користувач має власну папку
- Власна нумерація (1, 2, 3...)
- База даних Supabase зберігає metadata

## Ціноутворення R2

| Ресурс | Ціна | Приклад |
|--------|------|---------|
| Storage | $0.015/GB/місяць | 100 GB = $1.50/міс |
| Class A операції (write) | $4.50/млн | 100k uploads = $0.45 |
| Class B операції (read) | $0.36/млн | 1M downloads = $0.36 |
| **Egress (bandwidth)** | **$0** | ∞ GB = **$0** 🎉 |

**Приклад розрахунку:**
- 1000 користувачів × 10 файлів × 5 MB = 50 GB storage
- Ціна: **$0.75/місяць** (в 30+ разів дешевше Supabase PRO!)

## Порівняння

| Параметр | Supabase FREE | Supabase PRO | CloudFlare R2 |
|----------|---------------|--------------|---------------|
| Storage | 1 GB | 100 GB | Unlimited* |
| Max file | 50 MB | 5 GB | Unlimited |
| Egress | 200 GB/міс | 200 GB/міс | **Unlimited FREE** |
| Ціна | $0 | $25/міс | ~$1/100GB |

*Платиш тільки за використання

## Міграція з Supabase Storage

Система автоматично визначає який storage використовувати:

```javascript
// В audioRoutes.js
const USE_R2 = process.env.R2_ACCESS_KEY_ID ? true : false;
```

**Якщо R2 credentials є в .env** → використовує R2
**Якщо немає** → використовує Supabase Storage

Це дозволяє:
- Тестувати локально з Supabase
- Production з R2
- Легка міграція туди-назад

## Troubleshooting

### Error: "Missing credentials"

Перевірте `.env`:
```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Перезапустіть сервер після змін в `.env`.

### Error: "Bucket not found"

1. Перевірте назву bucket в `.env`
2. Перевірте що bucket існує в R2 Dashboard
3. Перевірте що API token має доступ до цього bucket

### Error: "Access denied"

Перевірте:
1. API token має **Read & Write** permissions
2. Token прив'язаний до правильного bucket
3. Credentials правильно вказані в `.env`

### Файли не завантажуються

Перевірте лог сервера:
```bash
[R2] Initialized with endpoint: https://...
[AUDIO ROUTES] Using storage backend: CloudFlare R2
[AUDIO R2] Uploading audio file: user-xxx/audio_001.mp3 (5.23 MB)
```

## Моніторинг

**R2 Dashboard:**
- **Storage**: скільки GB використано
- **Operations**: кількість read/write
- **Requests**: графіки трафіку

**API Endpoint:**
```bash
curl http://localhost:3000/api/audio/global-stats \
  -H "Authorization: Bearer TOKEN"
```

## Backup стратегія

R2 має вбудовану durability (99.999999999%) але для критичних даних:

1. **R2 Bucket Replication** (копія в інший регіон)
2. **Export to S3** (резервна копія в AWS S3)
3. **Local backup** через cron job

## Висновок

R2 - ідеальне рішення для audio storage:
- ✅ Безкоштовний bandwidth
- ✅ Необмежений storage (платиш тільки за GB)
- ✅ Швидкий CDN CloudFlare
- ✅ Без обмежень на розмір файлів

**Рекомендовано для production!**

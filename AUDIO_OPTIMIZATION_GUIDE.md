# Оптимізація аудіо для 50 MB ліміту

## Проблема

Supabase FREE tier має ліміт 50 MB на файл. Довгі аудіоісторії можуть перевищити цей ліміт.

## Рішення: Зменшення bitrate

### MP3 Bitrate для мови:

| Bitrate | Якість | Тривалість на 50 MB | Рекомендація |
|---------|--------|---------------------|--------------|
| 320 kbps | Музична якість | ~20 хв | ❌ Надмірно для мови |
| 192 kbps | Висока | ~33 хв | ⚠️ Надмірно |
| 128 kbps | Стандарт подкастів | **~50 хв** | ✅ Добре |
| 96 kbps | Хороша для мови | **~65 хв** | ✅ Оптимально |
| 64 kbps | Достатньо для мови | **~120 хв** | ✅ Для довгих історій |
| 48 kbps | Прийнятно | ~160 хв | ⚠️ Помітна деградація |

## Як налаштувати bitrate в ElevenLabs

### Через API:

```javascript
const response = await elevenLabs.textToSpeech({
  voice_id: voiceId,
  text: text,
  model_id: "eleven_multilingual_v2",
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75
  },
  // Додати параметр для оптимізації
  output_format: "mp3_44100_64"  // 64 kbps, 44.1 kHz
});
```

### Доступні формати ElevenLabs:

- `mp3_44100_128` - 128 kbps (стандарт, ~50 хв на 50 MB)
- `mp3_44100_96` - 96 kbps (~65 хв на 50 MB) **рекомендовано**
- `mp3_44100_64` - 64 kbps (~120 хв на 50 MB)
- `mp3_22050_32` - 32 kbps, 22 kHz (економія для дуже довгих історій)

## Рекомендований підхід

### Динамічний вибір якості залежно від тривалості:

```javascript
function selectOptimalFormat(durationMinutes) {
  if (durationMinutes <= 50) {
    return "mp3_44100_128"; // Стандартна якість
  } else if (durationMinutes <= 65) {
    return "mp3_44100_96"; // Добра якість
  } else if (durationMinutes <= 120) {
    return "mp3_44100_64"; // Достатня якість для мови
  } else {
    // Для дуже довгих історій розбити на частини
    throw new Error("Story too long. Split into multiple parts.");
  }
}

// Використання
const format = selectOptimalFormat(requestedMinutes);
const audio = await generateAudio(text, voiceId, format);
```

## Альтернативи для дуже довгих історій

### 1. Розбиття на частини (chapters)

```javascript
// Генерувати окремі файли для кожного розділу
for (let i = 0; i < chapters.length; i++) {
  const audioNumber = await getNextAudioNumber(userId);
  const audio = await generateAudio(chapters[i], voiceId, "mp3_44100_96");

  await uploadAudioFile(userId, audioNumber, audio);

  // Кожен розділ = окрема генерація з власним номером
  // audio_001.mp3, audio_002.mp3, audio_003.mp3...
}
```

**Переваги:**
- Кожен файл < 50 MB
- Користувач може слухати частинами
- Можна перегенерувати один розділ без переробки всього

### 2. Стримінг (майбутня фіча)

ElevenLabs підтримує WebSocket стримінг - аудіо надходить частинами в реальному часі, файл не зберігається.

## Поточна реалізація

Код вже містить валідацію:

```javascript
// src/utils/audioStorage.js
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
if (audioBuffer.length > MAX_FILE_SIZE) {
  const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
  throw new Error(`File too large: ${sizeMB} MB exceeds 50 MB limit.`);
}
```

## Тестування різних якостей

```bash
# Тест генерації з різними форматами
curl -X POST /api/audio/upload \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "voiceId": "voice_id",
    "text": "Sample text...",
    "format": "mp3_44100_96"
  }'
```

## Висновок

**Рекомендація для вашого проекту:**

1. **Стандартні історії (до 50 хв)**: `mp3_44100_128`
2. **Довгі історії (50-120 хв)**: `mp3_44100_96` або `mp3_44100_64`
3. **Дуже довгі (>120 хв)**: розбивати на розділи (chapters)

Для мовленого контенту різниця між 128 kbps і 64 kbps майже не помітна!

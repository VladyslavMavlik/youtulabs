# Story Generator — Audio-First Mode для YouTube 🎙️

Генератор історій з оптимізацією для YouTube voice-over (канал TRUE LIES).

## Швидкий старт

```bash
cd ~/Projects/TextGeneratorGeis
./start.sh
```

Відкрий http://localhost:3000

## audioMode готовий ✅

- **7 принципів audio-first**: chunking, transitions, dialogue tags, sentence rhythm, single resolution, no meta-intrusions, intimacy handling
- **Лексикони переходів**: Українська (25+), Польська (15+), Англійська (14+), Німецька (9+)
- **5 метрик якості**:
  - Sentence median (8-14 words)
  - Beat compliance (80-140 words)
  - Transition beacons (явні маркери часу/місця)
  - Dialogue tags (кожні 1-2 репліки)
  - Meta-intrusions (0 = ідеально)

## Як використовувати

1. Відкрий UI: http://localhost:3000
2. Обери мову (uk-UA, pl-PL, en-US, de-DE)
3. Обери жанр (noir_drama, thriller, romance, etc.)
4. Вкажи тривалість (1-180 хвилин)
5. **Увімкни чекбокс "🎙️ Audio-first mode"**
6. Введи промпт
7. Генеруй!

## Результат

- Story text оптимізований для voice-over
- Quality metrics показують audio-first compliance
- Готово для запису або TTS
- Ідеально для каналу TRUE LIES (@TRUELIES-w7o)

## Локація

**Постійна робоча папка**: `~/Projects/TextGeneratorGeis`
- Поза iCloud (без ETIMEDOUT помилок)
- Швидкий npm install і запуск
- node_modules працює без затримок

**Резервна копія**: `~/Desktop/C/Text Generator Geis`
- Синхронізується автоматично
- Має проблему з iCloud (не запускай звідти)

**Тимчасова**: `/tmp/TextGeneratorGeis`
- Для швидких тестів
- Видаляється при перезавантаженні

## Команди

**Запуск**:
```bash
cd ~/Projects/TextGeneratorGeis
npm start
```

**З автоперезавантаженням**:
```bash
npm run dev
```

**Зупинка**:
```bash
killall -9 node
```

**Тест API**:
```bash
curl http://localhost:3000/health
```

## Структура

- `src/prompts/audioRules.js` — 7 принципів + лексикони
- `src/utils/audioMetrics.js` — метрики якості
- `src/utils/qualityGate.js` — фінальна валідація
- `src/orchestrator.js` — головний оркестратор (audioMode інтегровано)
- `public/index.html` — UI з чекбоксом audioMode

## Наступні кроки

**TODO**:
- [ ] Створити audio patches (strip_meta_lines, split_long_sentences, etc.)
- [ ] Тестувати 25-хв story з audioMode
- [ ] Порівняти метрики audioMode ON vs OFF
- [ ] Експортувати для TRUE LIES каналу

## TRUE LIES YouTube Channel

- Handle: @TRUELIES-w7o
- Subscribers: 610
- Videos: 66
- Status: Not Monetized
- Genre: Noir Drama / Thriller stories

Цей генератор створено спеціально для оптимізації контенту під voice-over цього каналу.

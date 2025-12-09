# Quiet Noir / Mature Romance Guide

Покращення для жанру **romance** з фокусом на **"тихий психологічний нуар"** для дорослої аудиторії (55+).

---

## 🎯 Що нового

### 1. **Motif Budget** - контроль повторюваних мотивів
Система тепер відстежує частоту мотивів (timestamp, elevator bell, auto-delete) і обмежує їх до **3 появ на 10k слів**.

### 2. **Mid-Act Compression** - стиснення середини
Розділи 2-3 автоматично стискаються на **6%**, видаляючи технічні повтори без втрати сюжету.

### 3. **Character Anchors** - якорні спогади
Система вимагає мінімум **2 якірні моменти** (memory shards) для персонажів - короткі спогади або жести, що розкривають глибину.

### 4. **Visible Price** - конкретна ціна в фіналі
Фінальний розділ має містити **одне речення** з конкретним наслідком (therapy, move, work conflict) - не метафори, а видиму дію.

### 5. **Dialogue Ratio Check** - перевірка діалогів
Мінімум **28%** діалогів у розділах 2-6 для dynamic pacing.

---

## 📝 Як писати промпт для Quiet Noir

### Структура промпту:

```
[QUIET_NOIR_BRIEF]
READER_PROFILE: male 55+, quiet psychological noir, no melodrama
INTIMACY_MODE: "heard not just seen"; trust vs control
LOCALE: [3 сенсорні штрихи, без зайвої технічки]

PROTAGONIST (flaw + desire):
Ім'я, вік, професія
Flaw: professional distrust that ruins relationships
Desire: to see one case through to the very end

PARTNER (with anchor moment):
Ім'я, зв'язок з протагоністом
Anchor: [один конкретний спогад, 3-4 рядки]

ANTAGONISM_VECTOR: jealousy → control → self-sabotage
STAKES & DEADLINE: in 5 days evidence vanishes

MYSTERY: how does the shadow network operate?

MOTIFS (max 3 appearances): [timestamp, elevator chime, auto-delete]

VISIBLE_PRICE_TARGET: therapy appointment / separate apartment / job transfer

CONSTRAINTS: no explicit sexual content; moderate violence; quiet tone
ENDING_TASTE: bittersweet, adult acceptance
```

---

## ⚙️ Конфігурація (.env)

Для активації всіх перевірок quiet noir:

```env
# Quiet Noir Settings
MOTIF_MAX_PER_10K=3                  # max 3 появи кожного мотиву
MID_COMPRESSION_PERCENT=6            # стиснення середини на 6%
DIALOGUE_RATIO_MIN=0.28              # мінімум 28% діалогів
VISIBLE_PRICE_REQUIRED=true          # вимагати конкретну ціну в фіналі
CHARACTER_ANCHORS_REQUIRED=true      # вимагати якірні моменти
```

---

## 🎭 Приклад промпту

### Базовий thriller:
```
Cybersecurity auditor discovers shadow identity network at airport.
5 days to expose it before evidence vanishes.
```

### Quiet Noir версія:
```
[QUIET_NOIR_BRIEF]
READER_PROFILE: male 55+, quiet psychological noir
INTIMACY_MODE: "heard not just seen"; trust vs control

LOCALE: Warsaw airport data center (3 floors below gates),
Berlin hotel with mirrored corridors,
server hum as constant background

PROTAGONIST:
Marek, 42, cybersecurity auditor
Flaw: professional distrust that destroyed his marriage
Desire: to see one case through without compromise

PARTNER:
Anna, 38, data analyst
Anchor: "She used to leave post-it notes with coffee jokes on his laptop.
He'd kept one for years—'Ctrl+Alt+Delight'—tucked behind his work badge."

ANTAGONISM_VECTOR:
discovers Anna consulting for Helix →
jealousy feeds into surveillance →
monitoring becomes control →
self-sabotages relationship

STAKES: 5 days before Helix shutters public layer

MYSTERY: who enables identity substitution inside Helix?

MOTIFS (max 3): [timestamp, elevator bell, auto-delete notification]

VISIBLE_PRICE_TARGET: therapy intake form on his desk /
studio apartment lease across town

CONSTRAINTS: no explicit content; moderate violence; quiet tone
ENDING_TASTE: truth exposed, but personal compromise visible
```

---

## 📊 Quality Metrics для Quiet Noir

Після генерації ти отримаєш звіт з такими метриками:

```json
{
  "quality": {
    "gate": {
      "passed": true,
      "metrics": {
        "motifViolations": [],
        "dialogueRatio": 0.32,
        "visiblePrice": true,
        "characterAnchors": 3
      }
    }
  }
}
```

### Цільові значення:
- **Repetition Rate**: ≤ 3.2/1000 (romance допускає трохи більше emotional lexicon)
- **Motif Budget**: ≤ 3 появи кожного мотиву
- **Dialogue Ratio**: 28-40% в розділах 2-6
- **Visible Price**: ✓ found
- **Character Anchors**: ≥ 2 (по одному для кожного ключового персонажа)

---

## 🔧 Automatic Patches

Якщо метрики провалені, система автоматично викличе спеціальні патчі:

1. **Motif & Mid-Compression Patch** - замінить надлишкові мотиви свіжими sensory cues
2. **Character Anchor Patch** - додасть memory shards для персонажів
3. **Visible Price Patch** - додасть конкретний наслідок в фінал
4. **Dialogue Boost Patch** - додасть 2-4 короткі репліки з паузами

---

## 💡 Поради

### ✅ ДОБРЕ:
- "Motifs: [timestamp, server hum, digital silence]" - конкретні, atmospheric
- "Anchor: She remembered how he'd pause mid-sentence when uncertain" - specific gesture
- "Visible price: the lease he'd signed for a studio across town" - concrete action
- "Quiet tone, bittersweet ending" - no melodrama

### ❌ ПОГАНО:
- "Motifs appear everywhere" - no control
- "They had memories together" - too vague
- "He felt the emotional cost" - metaphorical, not visible
- "Dramatic confrontation, explosive ending" - wrong tone

---

## 📈 Очікуваний результат

З цими покращеннями твій "тихий нуар" системно виходитиме на **9.6-9.8/10**:

- ✅ Motifs під контролем (не нав'язливі)
- ✅ Середина щільна (темп не провисає)
- ✅ Персонажі живі (через anchor moments)
- ✅ Фінал має "ціну" (видиму, дорослу)
- ✅ Діалоги збалансовані (показують через недомовки)
- ✅ Tone mature (без melodrama)

---

**Приклад використання:** обери жанр "romance" в UI, вставмий промпт у форматі `[QUIET_NOIR_BRIEF]` вище, встанови хвилини на 10-15, і система автоматично застосує всі правила!

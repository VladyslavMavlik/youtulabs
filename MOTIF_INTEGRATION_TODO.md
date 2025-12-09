# Motif Integration - ЗАВЕРШЕНО ✅

## ✅ ПОВНІСТЮ ІНТЕГРОВАНО (planner-first підхід):

### 1. Планер (`src/prompts/sonnetPlanner.js`)
- ✅ CHEKHOV MOTIF BUDGET додано до system prompt
- ✅ OUTLINE_JSON тепер очікує `{beats: [], motifs: {}}`
- ✅ MOTIF SCHEDULE RULES додано

### 2. Парсер (`src/utils/parsers.js`)
- ✅ Парсить новий формат outline з `beats` і `motifs`
- ✅ Підтримка legacy формату (тільки array beats)

### 3. Motif Scheduler (`src/utils/motifScheduler.js`) - НОВИЙ МОДУЛЬ
- ✅ `validateAndDistributeMotifs()` - валідує і виправляє розклад
- ✅ `buildActiveMotifSection()` - генерує ACTIVE_MOTIFS для промпта
- ✅ `scrubMotifTokens()` - очищає contextSummary від токенів мотивів
- ✅ `getActiveMotifsForChapter()` - визначає активні мотиви для розділу

### 4. Patch система (`src/patch/patchRuntime.js`)
- ✅ `motif_evolve` patch додано з повним шаблоном
- ✅ `pickPatch()` вже має пріоритет для `metrics.motifViolations`

### 5. Quality Gate (`src/utils/qualityGate.js`)
- ✅ `motifDensityMetrics()` додано до перевірок
- ✅ Check 5b: Chekhov motif density (universal)

### 6. Motif Tracker (`src/utils/motifTracker.js`)
- ✅ `MOTIF_GROUPS` з patterns (camera, audit, letter, remote)
- ✅ `motifDensityMetrics()` - повна реалізація з spacing check

### 7. Orchestrator (`src/orchestrator.js`)
- ✅ Імпорт додано: `import { validateAndDistributeMotifs, buildActiveMotifSection, scrubMotifTokens } from './utils/motifScheduler.js';`

---

## ✅ ІНТЕГРАЦІЯ В ORCHESTRATOR - ЗАВЕРШЕНО:

### ✅ Крок 1: Context Scrubbing у generateShortMultiAct()

**Файл:** `src/orchestrator.js`, рядок 541-548

```javascript
// Generate context summary for next act
if (i < NUM_ACTS - 1) {
  const chapters = extractChapters(actChapters);
  const lastChapter = chapters[chapters.length - 1];
  let rawSummary = `ACT ${actNum} SUMMARY:\n${lastChapter.text.slice(0, 500)}...\n\nContinue the story from here.`;
  // Scrub motif tokens to prevent echo-repetition in next act
  contextSummary = scrubMotifTokens(rawSummary, language);
}
```

### ✅ Крок 2: Context Scrubbing у generateLong()

**Файл:** `src/orchestrator.js`, рядок 717-723

```javascript
// Get context from ledger
let contextSummary = i > 0 ? ledger.generateContextSummary(acts[i - 1]) : null;

// Scrub motif tokens to prevent echo-repetition across acts
if (contextSummary) {
  contextSummary = scrubMotifTokens(contextSummary, language);
}
```

### ✅ Плановик як єдине джерело правди

Planner тепер сам відповідає за розподіл мотивів через `chapters[]` з `allowed_motifs`/`banned_motifs`.
Немає потреби в складній валідації - планер самообмежується на основі власного outline.

---

## 🎯 Що було зроблено:

**Planner-first підхід:**
1. Planner генерує `chapters[]` з `allowed_motifs`/`banned_motifs` в OUTLINE_JSON
2. Planner самообмежується на основі цього outline (єдине джерело правди)
3. Multi-act stories: `scrubMotifTokens()` очищає contextSummary від мотивів перед передачею наступному акту
4. Quality gate перевіряє мотиви post-generation, якщо є порушення - запускає `motif_evolve` patch

**Результат:**
- Мотиви з'являються максимум 3 рази (intro/pivot/consequence)
- Відстань між появами ≥250 слів
- Немає echo-повторів між актами

---

## 🧪 Як тестувати:

1. **Перевірте що сервер запущений:**
   ```bash
   # Server running at http://localhost:3000
   ```

2. **Згенеруйте multi-act story (>2200 words):**
   - Planner створить `chapters[]` з `allowed_motifs`/`banned_motifs`
   - Context summary між актами буде очищений від мотивів
   - Quality gate перевірить що кожен мотив з'являється ≤3 рази

3. **Перевірте metrics в response:**
   ```json
   {
     "quality": {
       "gate": {
         "metrics": {
           "motifDensity": {
             "camera": 3,
             "audit": 2
           }
         }
       }
     }
   }
   ```

4. **Якщо є порушення:**
   - Quality gate запустить `motif_evolve` patch
   - Patch collapse-ить надлишкові згадки мотивів

---

## 📝 Очікуваний OUTLINE_JSON формат:

```json
{
  "beats": [
    {"index": 1, "name": "Inciting incident", "goal": "...", "open_q": [...]}
  ],
  "chapters": [
    {"n": 1, "title": "...", "target_words": 300, "allowed_motifs": ["camera"], "banned_motifs": ["audit", "letter"]},
    {"n": 2, "title": "...", "target_words": 320, "allowed_motifs": ["audit"], "banned_motifs": ["camera", "letter"]}
  ]
}
```

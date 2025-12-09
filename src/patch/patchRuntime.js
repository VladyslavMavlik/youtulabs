/**
 * Patch Runtime - Pure functions, NO side effects, NO imports
 * All logic inline, zero dependencies
 */

/**
 * Select appropriate patch type based on metrics and genre
 */
export function pickPatch(genrePack, metrics, repetitionThreshold = 3.2, extremeFactor = 10, pov = null, audioMode = false) {
  // Highest Priority: POV drift
  if (metrics.pov && metrics.pov.drift && pov) {
    return pov === 'first' ? 'pov_normalize_first' : 'pov_normalize_third';
  }

  // High Priority: Monetization safety (sexual lexeme density too high)
  if (metrics.monetization && metrics.monetization.needsPatch) {
    return 'implication_rewrite';
  }

  // Audio-first mode patches (high priority for TTS quality)
  if (audioMode && metrics.audio) {
    if (metrics.audio.sentenceMedian > 25) {
      return 'split_long_sentences';
    }
    if (metrics.audio.transitionScore < 0.5) {
      return 'insert_transitions';
    }
    if (metrics.audio.dialogueAttribution < 0.6) {
      return 'tag_dialogue_speakers';
    }
    if (metrics.audio.metaIntrusions > 0) {
      return 'strip_meta_lines';
    }
    if (metrics.audio.awkwardEndings > 2) {
      return 'resolve_endings_single';
    }
  }

  // Priority: extreme repetition
  if (metrics.repetitionRate >= repetitionThreshold * extremeFactor) {
    return 'extreme_repetition';
  }

  // Quiet noir specific checks
  if (metrics.motifViolations && metrics.motifViolations.length > 0) {
    return 'motif_evolve';
  }

  if (metrics.characterAnchors < 2 && genrePack.quietNoirMode) {
    return 'anchor_inject';
  }

  if (!metrics.visiblePrice && genrePack.quietNoirMode) {
    return 'visible_price';
  }

  // Genre-specific checks
  if (genrePack.name === 'romance') {
    const dialogueMin = typeof genrePack.dialogueRatio === 'object'
      ? genrePack.dialogueRatio.min
      : (genrePack.dialogueRatio || 0.28);

    if (metrics.dialogueRatio < dialogueMin) {
      return 'chemistry_amplify';
    }
  }

  if (genrePack.name === 'mystery' && metrics.missingHooks > 0) {
    return 'clue_clarity';
  }

  if (genrePack.name === 'thriller' && metrics.missingHooks > 0) {
    return 'reveal_tighten';
  }

  if (genrePack.name === 'horror' && metrics.missingHooks > 0) {
    return 'dread_intensifier';
  }

  // High repetition (not extreme)
  if (metrics.repetitionRate > repetitionThreshold) {
    return 'pacing_condense';
  }

  // Style policy checks
  if (metrics.avgSentence && metrics.avgSentence > 16) {
    return 'style_compact_pass';
  }

  if (metrics.dialogueStats && metrics.dialogueStats.longTurns > 0) {
    return 'dialogue_tightener_pass';
  }

  return null;
}

/**
 * Build patch prompt - all templates inline
 */
export function buildPatchPrompt(patchType, ctx) {
  const { chapters, languagePack, metrics, genrePack, repetitionMax = 3.2 } = ctx;

  const baseSystem = `You are a surgical text rewriter. Output ONLY between <<<CHAPTERS>>> ... <<<END_CHAPTERS>>>.
No meta-commentary, no analysis, no prefaces.
Producing analysis is TASK FAILURE. If uncertain, return input verbatim.`;

  const langRules = languagePack.rules || languagePack.minRules || '';

  const templates = {
    extreme_repetition: () => {
      const topBigrams = (metrics.highFrequencyBigrams || [])
        .slice(0, 15)
        .map(b => `"${b.bigram}" (${b.count}x)`)
        .join(', ');

      return `LANGUAGE_RULES:
${langRules}

CRITICAL ISSUE:
Current repetition rate is ${(metrics.repetitionRate / repetitionMax).toFixed(0)}x above genre norm.

TOP OVERUSED BIGRAMS (must reduce):
${topBigrams}

GOAL:
- Reduce extreme repetition to ≤ ${repetitionMax} bigrams/1000
- Rephrase high-frequency n-grams with fresh equivalents
- Merge near-duplicate sentences
- Vary paragraph openings (avoid repeated time-stamps as starters)
- Keep ALL plot points, character names, story events
- Preserve chapter-end hooks
- Maintain length within ±5%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`;
    },

    motif_evolve: () => {
      const violationsText = (metrics.motifViolations || [])
        .slice(0, 5)
        .join('\n- ');

      return `LANGUAGE_RULES:
${langRules}

CRITICAL ISSUE: Chekhov's gun violations detected
Motifs (camera, audit, letter, remote, etc.) appear >3 times instead of exactly 3.

VIOLATIONS DETECTED:
- ${violationsText}

GOAL:
- Collapse redundant motif mentions into THREE beats only: [introduction], [pivot], [consequence]
- Each motif should appear exactly 3x total, spaced ≥250 words apart
- Keep ALL plot facts, character decisions, timeline unchanged
- Remove duplicate technical phrasing around motifs
- Example fix: "камера у коридорі... знову камера... і знову камера" → pick the 3 strongest moments only

ROLES:
1. Introduction: First mention establishes the motif (setup)
2. Pivot: Second mention shows its importance (development)
3. Consequence: Third mention delivers payoff (resolution)

- Length ±3%
- Surface transformation only - no new facts

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`;
    },

    pacing_condense: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Condense redundant exposition by ~6% in middle chapters
- Remove atmospheric padding that slows tempo
- Keep ALL plot points, reveals, character beats
- Preserve chapter-end hooks
- Tighten dialogue (remove filler exchanges)

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    visible_price: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Add ONE concrete visible consequence in the final chapter
- Examples: therapy session booked, work friction, moving boxes
- Non-melodramatic, grounded
- Length ±2%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    anchor_inject: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Insert ONE 3-4 line anchor memory in middle chapter
- Subtle, specific sensory detail
- Grounds character emotionally
- Length ±2%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    chemistry_amplify: () => {
      const dialogueTarget = typeof genrePack.dialogueRatio === 'object'
        ? genrePack.dialogueRatio.target
        : (genrePack.dialogueRatio || 0.38);

      return `LANGUAGE_RULES:
${langRules}

GOAL:
- Add 2-3 brief, subtext-rich dialogue exchanges
- Compress nearby exposition to keep length stable
- Target dialogue ratio: ${Math.round(dialogueTarget * 100)}%
- Keep chapter hooks

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`;
    },

    clue_clarity: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Make one clever clue explicit (fair-play mystery)
- Tighten reveal logic
- No new characters
- Length ±2%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    reveal_tighten: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Tighten pre-final reversal
- Reduce hedging, increase tension
- Preserve hooks
- Length ±2%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    dread_intensifier: () => `LANGUAGE_RULES:
${langRules}

GOAL:
- Add one-sentence unsettling echo in final chapter
- Subtle, atmospheric
- Length ±1%

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    pov_normalize_first: () => `LANGUAGE_RULES:
${langRules}

POV CORRECTION REQUIRED:
- Rewrite to strict 1st person singular ("I") from narrator's perspective
- Remove all omniscient statements; convert to narrator's inference or observation
- Keep all plot facts, character decisions, story order unchanged
- Maintain consistent tense (past or present as established)
- This is SURFACE TRANSFORMATION ONLY - no plot changes

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    pov_normalize_third: () => `LANGUAGE_RULES:
${langRules}

POV CORRECTION REQUIRED:
- Rewrite to strict 3rd person limited, tethered to protagonist's viewpoint
- Remove any 1st-person narration outside dialogue
- No head-hopping; stay with protagonist's perceptions only
- Keep all plot facts, character decisions, story order unchanged
- Maintain consistent tense (past or present as established)
- This is SURFACE TRANSFORMATION ONLY - no plot changes

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    style_compact_pass: () => `LANGUAGE_RULES:
${langRules}

[EDIT_FOR_PACING]
- Compress by 20–30% without changing plot facts or order
- Remove rhetorical questions except possibly one per scene
- Keep average sentence 12–16 words; maintain hooks
- Surface transformation only - no plot changes

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    dialogue_tightener_pass: () => `LANGUAGE_RULES:
${langRules}

[EDIT_FOR_DIALOGUE]
- Any dialogue turn >20 words: split and insert a relevant action beat or pause
- Keep speaker intent and subtext; do not add new facts
- Surface transformation only - no plot changes

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    implication_rewrite: () => `LANGUAGE_RULES:
${langRules}

[MONETIZATION_SAFETY_PASS]
CRITICAL: Rewrite to achieve PG-13 rating for YouTube/TTS monetization.

ISSUE DETECTED:
- Sexual lexeme density too high (>2 per 1000 words)
- Explicit terms found in dialogue/narration

REQUIRED CHANGES:
- Replace explicit anatomical/sexual terms with implication techniques
- Use fade-to-black, ellipsis, metaphor instead of direct description
- Rewrite dialogue containing explicit language to imply meaning
- Keep ALL plot events, character decisions, timeline unchanged

IMPLICATION TECHNIQUES:
- "The door closed. Morning light found them..." (time skip)
- "What followed stays between them and the shadows" (off-screen)
- "She touched his hand; the rest needs no words" (ellipsis)
- Replace body-part names with sensory/emotional language

TARGET: Reduce lexeme density to ≤2 per 1000 words while maintaining story clarity.
This is SURFACE TRANSFORMATION ONLY - no plot changes.

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    // Audio-first mode patches
    strip_meta_lines: () => `LANGUAGE_RULES:
${langRules}

[AUDIO_CLEANUP_PASS]
GOAL: Remove all control tokens and meta-markers for clean TTS narration.

REMOVE THESE PATTERNS:
- ⟪CAMERA:...⟫ markers (entire line)
- ⟪OUTLINE_JSON⟫ / ⟪/OUTLINE_JSON⟫ markers
- ⟪CHAPTERS⟫ / ⟪/CHAPTERS⟫ markers
- ⟪CHECKLIST⟫ / ⟪/CHECKLIST⟫ markers
- Any other ⟪...⟫ control tokens
- <<< ... >>> delimiters

KEEP:
- All story text, dialogue, narration
- Chapter headings (# Chapter N: Title)
- Normal punctuation and formatting

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    split_long_sentences: () => `LANGUAGE_RULES:
${langRules}

[AUDIO_SENTENCE_SPLIT]
GOAL: Split sentences >25 words for better TTS pacing.

CURRENT ISSUE:
- Median sentence length: ${metrics.audio?.sentenceMedian || 'N/A'} words
- Target: ≤20 words median for optimal voice-over flow

TECHNIQUE:
- Locate sentences >25 words
- Split at natural break points: conjunctions (and, but), clauses, semicolons
- Insert brief action beats or pauses if needed
- Keep meaning and plot unchanged
- Maintain all dialogue and character voice

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    insert_transitions: () => `LANGUAGE_RULES:
${langRules}

[AUDIO_TRANSITION_INJECT]
GOAL: Add temporal/spatial transitions for audio clarity (target: 1-2 per chapter).

CURRENT SCORE: ${metrics.audio?.transitionScore || 'N/A'} (target: ≥0.7)

USE THESE TRANSITIONS (language-appropriate):
- Time: "Later that evening...", "The next morning...", "Hours passed..."
- Space: "In the hallway...", "Back at the office...", "Outside..."
- Brief beats: "She paused.", "A moment of silence.", "He waited."

RULES:
- Insert 1-2 transitions per chapter at scene/time shifts
- Keep natural, economical (3-6 words)
- No exposition dumps
- Surface transformation only

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    tag_dialogue_speakers: () => `LANGUAGE_RULES:
${langRules}

[AUDIO_DIALOGUE_ATTRIBUTION]
GOAL: Add speaker tags to improve TTS clarity (target: 70%+ attribution).

CURRENT: ${Math.round((metrics.audio?.dialogueAttribution || 0) * 100)}% dialogue tagged

TECHNIQUE:
- After untagged dialogue, add brief attribution: "he said", "she replied", "they whispered"
- Use action beats: "She crossed her arms. 'No way.'"
- Vary verbs: said, replied, asked, murmured, called
- Don't tag every line - natural rhythm (60-80% coverage)
- Keep character voice unchanged

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`,

    resolve_endings_single: () => `LANGUAGE_RULES:
${langRules}

[AUDIO_ENDING_FIX]
GOAL: Fix awkward sentence endings for TTS voice quality.

CURRENT ISSUE: ${metrics.audio?.awkwardEndings || 0} sentences end with weak/unclear words

AVOID THESE ENDINGS:
- Dangling prepositions: "...what it was about" → "...what troubled him"
- Weak pronouns: "...and told her" → "...and told Sarah"
- Unclear references at sentence end

TECHNIQUE:
- Rewrite final 3-5 words for clarity and rhythm
- Keep meaning unchanged
- Prefer concrete nouns over pronouns at sentence end
- Surface transformation only

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`
  };

  const userPrompt = templates[patchType] ? templates[patchType]() : null;

  if (!userPrompt) {
    return null;
  }

  return {
    systemPrompt: baseSystem,
    userPrompt
  };
}

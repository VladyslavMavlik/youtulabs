/**
 * Quality Gate - final validation before returning to user
 * Ensures text meets all quality standards
 */
console.log('[LOAD] qualityGate.js');

import { isTruncated } from './continuationRecovery.js';
import { checkLength } from './quality.js';
import { extractChapters } from './parsers.js';
import { hasHook } from './quality.js';
import {
  calculateBigramRepetition,
  povDriftMetrics,
  avgSentenceLength,
  countRhetorical,
  dialogueStats,
  sensoryTriplet
} from './quality.js';
import {
  checkMotifBudget,
  extractMotifsFromPrompt,
  calculateDialogueRatio,
  checkVisiblePrice,
  checkCharacterAnchors,
  motifDensityMetrics
} from './motifTracker.js';
import { monetizationGate } from './monetizationGate.js';
import { runAudioMetrics } from './audioMetrics.js';

/**
 * Run all quality checks on final text
 * Returns { passed: boolean, failures: string[], metrics: object }
 */
export function qualityGate(chaptersMarkdown, targetWords, config = {}) {
  const {
    lengthTolerance = 0.10,  // ±10%
    repetitionMax = 3.0,     // per 1000 tokens
    requireHooks = true,
    genre = null,
    genrePack = null,        // Genre pack with metrics
    languagePack = null,     // Language pack for stopwords
    userPrompt = null,
    checkMotifs = false,
    checkDialogue = false,
    checkVisiblePriceRequired = false,
    checkAnchorsRequired = false,
    checkPOVConsistency = false,
    checkMonetization = false,  // Monetization gate check
    audioMode = false,           // Audio-first mode check
    pov = null,
    language = 'en-US',
    stylePolicy = false,
    maxAvgSentence = 16,
    maxRhetoricalPerChapter = 1,
    allowLongDialogueTurns = null  // Will be calculated dynamically
  } = config;

  // Calculate realistic limits based on actual word count
  const actualWords = chaptersMarkdown.split(/\s+/).filter(w => w.length > 0).length;
  const maxLongTurns = allowLongDialogueTurns !== null
    ? allowLongDialogueTurns
    : Math.ceil((actualWords / 1000) * 2);  // 2 per 1000 words
  const maxRhetorical = Math.max(1, Math.ceil(actualWords / 400));  // 1 per 400 words

  const failures = [];
  const metrics = {};

  // Check 1: Continuation (not truncated)
  const truncCheck = isTruncated(chaptersMarkdown, targetWords);
  metrics.truncated = truncCheck.truncated;

  if (truncCheck.truncated) {
    failures.push(`text_truncated: ${truncCheck.reason}`);
  }

  // Check 2: Length within range (±10%)
  const lengthCheck = checkLength(chaptersMarkdown, targetWords);
  metrics.lengthRatio = lengthCheck.ratio;

  const lengthOk = Math.abs(lengthCheck.ratio - 1.0) <= lengthTolerance;
  if (!lengthOk) {
    failures.push(`length_out_of_range: ${lengthCheck.actualWords}/${targetWords} (${(lengthCheck.ratio * 100).toFixed(0)}%)`);
  }

  // Check 3: Hooks present (if required)
  if (requireHooks) {
    const chapters = extractChapters(chaptersMarkdown);
    const missingHooks = chapters.filter(ch => !hasHook(ch.text));
    metrics.missingHooksCount = missingHooks.length;
    metrics.totalChapters = chapters.length;

    if (missingHooks.length > 0) {
      failures.push(`missing_hooks: ${missingHooks.length}/${chapters.length} chapters`);
    }
  }

  // Check 4: Repetition within threshold (with stopword filtering)
  const bigramData = calculateBigramRepetition(chaptersMarkdown, languagePack || {});
  metrics.repetitionRate = bigramData.rate;
  metrics.highFrequencyBigrams = bigramData.highFrequencyBigrams;  // For patch router

  if (bigramData.rate > repetitionMax) {
    failures.push(`high_repetition: ${bigramData.rate.toFixed(2)}/1000 (max: ${repetitionMax})`);
  }

  // Check 5: Motif budget (genre-specific or quiet noir)
  if (checkMotifs && userPrompt) {
    const motifPatterns = extractMotifsFromPrompt(userPrompt);
    // Use genre pack motif budget if available, otherwise fallback to env
    const motifMax = genrePack?.motifBudgetPer10k || parseInt(process.env.MOTIF_MAX_PER_10K || '3');
    const motifCheck = checkMotifBudget(chaptersMarkdown, motifPatterns, motifMax);
    metrics.motifViolations = motifCheck.violations;

    if (motifCheck.exceeded) {
      failures.push(`motif_budget_exceeded: ${motifCheck.violations.length} motifs over limit`);
    }
  }

  // Check 5b: Chekhov motif density (universal - camera, audit, letter, remote)
  // Always runs to catch excessive repetition of Chekhov's gun motifs
  const motifDensityCheck = motifDensityMetrics(chaptersMarkdown, targetWords);
  metrics.motifDensity = motifDensityCheck.details;

  if (!motifDensityCheck.passed) {
    // Override motifViolations with new density-based violations for patch router
    metrics.motifViolations = motifDensityCheck.violations;
    failures.push(`motif_density_exceeded: ${motifDensityCheck.violations.length} Chekhov violations (max 3 per motif, ≥250w spacing)`);
  }

  // Check 6: Dialogue ratio (genre-specific with range support)
  if (checkDialogue) {
    const dialogueCheck = calculateDialogueRatio(chaptersMarkdown);
    metrics.dialogueRatio = dialogueCheck.ratio;

    // Support both range objects and legacy single values
    let dialogueMin, dialogueMax;
    if (genrePack?.dialogueRatio) {
      if (typeof genrePack.dialogueRatio === 'object') {
        // New range format: { min: 0.28, target: 0.38, max: 0.55 }
        dialogueMin = genrePack.dialogueRatio.min;
        dialogueMax = genrePack.dialogueRatio.max;
      } else {
        // Legacy single value - use 90% tolerance
        dialogueMin = genrePack.dialogueRatio * 0.90;
        dialogueMax = 1.0; // No upper limit for legacy
      }
    } else {
      // Fallback to env
      dialogueMin = parseFloat(process.env.DIALOGUE_RATIO_MIN || '0.28');
      dialogueMax = 1.0;
    }

    if (dialogueCheck.ratio < dialogueMin) {
      failures.push(`low_dialogue_ratio: ${(dialogueCheck.ratio * 100).toFixed(0)}% (min: ${(dialogueMin * 100).toFixed(0)}%)`);
    } else if (dialogueCheck.ratio > dialogueMax) {
      failures.push(`high_dialogue_ratio: ${(dialogueCheck.ratio * 100).toFixed(0)}% (max: ${(dialogueMax * 100).toFixed(0)}%)`);
    }
  }

  // Check 7: Visible price in finale (for quiet noir)
  if (checkVisiblePriceRequired) {
    const chapters = extractChapters(chaptersMarkdown);
    if (chapters.length > 0) {
      const finalChapter = chapters[chapters.length - 1];
      const priceCheck = checkVisiblePrice(finalChapter.text);
      metrics.visiblePrice = priceCheck.found;

      if (!priceCheck.found) {
        failures.push('missing_visible_price: no concrete consequence in finale');
      }
    }
  }

  // Check 8: Character anchors (for quiet noir)
  if (checkAnchorsRequired) {
    const anchorCheck = checkCharacterAnchors(chaptersMarkdown);
    metrics.characterAnchors = anchorCheck.count;

    if (!anchorCheck.sufficient) {
      failures.push(`insufficient_character_anchors: ${anchorCheck.count}/2 found`);
    }
  }

  // Check 9: POV consistency
  if (checkPOVConsistency && pov) {
    const povCheck = povDriftMetrics(chaptersMarkdown, pov, language);
    metrics.pov = povCheck;

    if (povCheck.drift) {
      failures.push(`pov_drift: inconsistent ${pov}-person perspective (1st: ${povCheck.first}, 3rd: ${povCheck.third})`);
    }
  }

  // Check 10: Style policy - average sentence length
  if (stylePolicy) {
    const sentenceCheck = avgSentenceLength(chaptersMarkdown);
    metrics.avgSentence = sentenceCheck.avg;

    if (sentenceCheck.avg > maxAvgSentence) {
      failures.push(`pacing: avg_sentence=${sentenceCheck.avg.toFixed(1)} > ${maxAvgSentence}`);
    }
  }

  // Check 11: Style policy - rhetorical questions
  if (stylePolicy) {
    const rq = countRhetorical(chaptersMarkdown);
    metrics.rhetorical = rq;

    if (rq > maxRhetorical) {
      failures.push(`rhetorical: ${rq} exceeds limit of ${maxRhetorical} (1 per 400 words)`);
    }
  }

  // Check 12: Style policy - dialogue turn length
  if (stylePolicy) {
    const dialogueCheck = dialogueStats(chaptersMarkdown);
    metrics.dialogueStats = dialogueCheck;

    if (dialogueCheck.longTurns > maxLongTurns) {
      failures.push(`dialogue_long_turns: ${dialogueCheck.longTurns} exceed limit of ${maxLongTurns} (2 per 1000 words)`);
    }
  }

  // Check 13: Style policy - sensory triplet
  if (stylePolicy) {
    const sensoryCheck = sensoryTriplet(chaptersMarkdown);
    metrics.sensory = sensoryCheck;

    if (!(sensoryCheck.sound && sensoryCheck.touch && sensoryCheck.space)) {
      failures.push('sensory_triplet_missing: need sound+touch+space for immersion');
    }
  }

  // Check 14: Monetization gate (romance/drama genres only)
  if (checkMonetization) {
    const monetCheck = monetizationGate(chaptersMarkdown, language, genre);
    metrics.monetization = {
      passed: monetCheck.passed,
      lexemeDensity: monetCheck.metrics.lexemeDensity,
      lexemeHits: monetCheck.metrics.lexemeHits,
      inQuotesHits: monetCheck.metrics.inQuotesHits,
      needsPatch: monetCheck.needsPatch
    };

    if (monetCheck.passed === 'fail') {
      failures.push(`monetization_fail: lexeme_density=${monetCheck.metrics.lexemeDensity}/1000, in_quotes=${monetCheck.metrics.inQuotesHits}`);
    } else if (monetCheck.passed === 'warn') {
      // Warning doesn't fail quality gate, but logs in metrics
      console.log(`[MONETIZATION] Warning: lexeme_density=${monetCheck.metrics.lexemeDensity}/1000 (threshold: 2-4)`);
    }
  }

  // Check 15: Audio-first metrics (if audioMode enabled)
  if (audioMode) {
    const audioMetrics = runAudioMetrics(chaptersMarkdown, language);
    metrics.audio = audioMetrics;

    // Thresholds for audio-first mode
    if (audioMetrics.sentenceMedian > 20) {
      failures.push(`audio_sentence_length: median=${audioMetrics.sentenceMedian} words (max: 20)`);
    }

    if (audioMetrics.beatCompliance < 0.6) {
      failures.push(`audio_beats_sparse: ${(audioMetrics.beatCompliance * 100).toFixed(0)}% compliance (min: 60%)`);
    }

    if (audioMetrics.transitions.density < 1.2) {
      failures.push(`audio_missing_transitions: ${audioMetrics.transitions.density}/1000 words (min: 1.2)`);
    }

    if (audioMetrics.dialogueAttribution < 0.6) {
      failures.push(`audio_dialogue_attribution_low: ${(audioMetrics.dialogueAttribution * 100).toFixed(0)}% (min: 60%)`);
    }

    if (audioMetrics.metaIntrusions.length > 0) {
      failures.push(`audio_meta_intrusions: ${audioMetrics.metaIntrusions.length} meta lines found`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    metrics
  };
}

/**
 * Check if Haiku response is valid (not meta-commentary)
 * Returns { valid: boolean, reason?: string }
 */
export function isValidPatchResponse(response, minWords = 100) {
  // Check 1: Must start with chapter marker (# or markdown heading)
  const trimmed = response.trim();

  if (!trimmed.startsWith('#')) {
    return {
      valid: false,
      reason: 'does_not_start_with_chapter_heading'
    };
  }

  // Check 2: Must not contain meta-commentary phrases
  const metaPhrases = [
    'would you like',
    'shall i',
    'after careful review',
    'key observations',
    'shall we',
    'here are the',
    'let me know',
    'if you want',
    'should i',
    'minimal recommended edits',
    'polish recommendations'
  ];

  const lowerResponse = response.toLowerCase();
  for (const phrase of metaPhrases) {
    if (lowerResponse.includes(phrase)) {
      return {
        valid: false,
        reason: `contains_meta_phrase: "${phrase}"`
      };
    }
  }

  // Check 3: Must have minimum word count
  const wordCount = response.split(/\s+/).length;
  if (wordCount < minWords) {
    return {
      valid: false,
      reason: `too_short: ${wordCount} words (min: ${minWords})`
    };
  }

  // Check 4: Must have multiple chapters (at least 2 # headings)
  const chapterCount = (response.match(/^# /gm) || []).length;
  if (chapterCount < 2) {
    return {
      valid: false,
      reason: `too_few_chapters: ${chapterCount} (min: 2)`
    };
  }

  return { valid: true };
}

/**
 * Calculate expected chapter count based on target words
 */
export function calculateExpectedChapters(targetWords) {
  // Rule of thumb: ~350 words per chapter for tight pacing
  const base = Math.round(targetWords / 350);

  // Clamp between 3 and 12 chapters
  return Math.max(3, Math.min(12, base));
}

/**
 * Get genre-specific repetition threshold
 * Now uses genre pack if available for future extensibility
 */
export function getGenreRepetitionThreshold(genre, genrePack = null) {
  // Genre-specific thresholds with metric v2 (content tokens, stopwords filtered)
  // Higher values for dialogue-heavy genres (natural repetition in conversation)
  const thresholds = {
    'noir_drama': 3.5,      // More atmospheric lexicon allowed
    'thriller': 2.7,        // Tight, varied language
    'tech_thriller': 2.7,
    'romance': 6.0,         // High dialogue ratio + emotional lexicon (metric v2)
    'sci_fi': 2.8,          // Technical but varied
    'scifi_adventure': 2.9, // Adventure pacing with some repetition
    'fantasy': 3.0,         // World-building lexicon
    'horror': 3.3,          // Atmosphere allowed
    'comedy': 2.5,          // Maximum variety for humor
    'mystery': 2.9,         // Precise language
    'family_drama': 6.0     // High dialogue ratio (metric v2)
  };

  return genrePack?.repetitionThreshold || thresholds[genre] || 3.2;  // Default
}

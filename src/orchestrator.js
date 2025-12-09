/**
 * Story Generation Orchestrator v2.0
 * Enhanced with: validation, retry, ledger, length correction, hook enforcement, logging
 */
console.log('[LOAD] orchestrator.js START');

import Anthropic from '@anthropic-ai/sdk';
console.log('[LOAD] Anthropic imported');
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { getLanguagePack } from './config/languagePacks.js';
import { getGenrePack } from './config/genrePacks.js';
import { buildSonnetPlannerPrompt } from './prompts/sonnetPlanner.js';
import { buildHaikuPolishPrompt } from './prompts/haikuPolish.js';
import { buildHaikuPatchStrictPrompt } from './prompts/haikuPatchStrict.js';
import { buildSonnetAssemblerPrompt } from './prompts/sonnetAssembler.js';
import { buildLengthCorrectorPrompt } from './prompts/lengthCorrector.js';
import { buildHookEnforcerPrompt } from './prompts/hookEnforcer.js';
import { sanitizeRomance, shouldApplyRomanceSafety } from './prompts/romanceSafetyModule.js';
import {
  parseSonnetPlannerResponse,
  parseHaikuPolishResponse,
  parseSonnetAssemblerResponse,
  countWords,
  extractChapters,
  sanitizeControlMarkers
} from './utils/parsers.js';
import { generateQualityReport, calculateBigramRepetition, hasHook, checkLength } from './utils/quality.js';
import { sanitizeUserPrompt } from './utils/escapeFilter.js';
import { validateSonnetPlannerResponse, validateHaikuPolishResponse, fixInvalidData } from './utils/validation.js';
import { withRetry, withRetryAndFallback } from './utils/retry.js';
import { buildChapterMotifConstraints, scrubMotifTokens } from './utils/motifScheduler.js';
import { PromiseLedger } from './utils/promiseLedger.js';
import { createStoryLogger, logMetrics } from './utils/logger.js';
import { isTruncated, buildContinuationPrompt, mergeContinuation } from './utils/continuationRecovery.js';
import { saveArtifact } from './utils/artifacts.js';
import {
  qualityGate,
  isValidPatchResponse,
  calculateExpectedChapters,
  getGenreRepetitionThreshold
} from './utils/qualityGate.js';
import { softDedupe, buildSonnetRevisionPrompt } from './utils/sonnetRevision.js';
import { stripMetaLines, stripAudioBeats } from './utils/audioScaffold.js';
// NOTE: ensureTimeBridges removed - Sonnet planner generates natural time transitions

console.log('[LOAD] orchestrator.js ALL IMPORTS COMPLETE');

// Language-specific reading speeds for audiobooks (words/characters per minute)
// Based on average narration speed for engaging fiction audiobooks
//
// For languages without spaces (Japanese, Chinese, Thai):
//   - Values are "word-equivalents" (characters ÷ density factor)
//   - countWords() in parsers.js applies automatic conversion
//
// Research-backed values: English standard is 155 WPM (Audible), Russian slower than Ukrainian
const WORDS_PER_MINUTE_BY_LANGUAGE = {
  'en-US': 155,    // English: Audible standard for audiobooks
  'en': 155,
  'uk-UA': 135,    // Ukrainian: longer words due to inflections
  'uk': 135,
  'ru-RU': 130,    // Russian: slower than Ukrainian (research-confirmed)
  'ru': 130,
  'pl-PL': 140,    // Polish: faster than Ukrainian
  'pl': 140,
  'de-DE': 130,    // German: longest compound words
  'de': 130,
  'fr-FR': 145,    // French: medium complexity
  'fr': 145,
  'it-IT': 150,    // Italian: similar to Spanish
  'it': 150,
  'es-ES': 155,    // Spanish: similar to English
  'es': 155,
  'pt-BR': 155,    // Portuguese: similar to Spanish
  'pt': 155,
  'ja-JP': 140,    // Japanese: ~350 CPM ÷ 2.5 = 140 word-equivalents (countWords divides by 2.5)
  'ja': 140,
  'zh-CN': 140,    // Chinese: ~350 CPM ÷ 2.5 = 140 word-equivalents (countWords divides by 2.5)
  'zh': 140,
  'ko-KR': 145,    // Korean: HAS spaces between words, agglutinative structure
  'ko': 145,
  'ar-SA': 150,    // Arabic: complex script (higher WPM to compensate for long words)
  'ar': 150,
  'th-TH': 160,    // Thai: ~640 CPM ÷ 4 = 160 word-equivalents (countWords divides by 4, no spaces)
  'th': 160,
  'tr-TR': 140,    // Turkish: agglutinative like Ukrainian
  'tr': 140
};

const DEFAULT_WORDS_PER_MINUTE = 145; // Default for unlisted languages
const LONG_MODE_THRESHOLD = 9000; // words
const WORDS_PER_ACT = 3000;

/**
 * Get reading speed for a specific language
 */
function getWordsPerMinute(language) {
  return WORDS_PER_MINUTE_BY_LANGUAGE[language] || DEFAULT_WORDS_PER_MINUTE;
}

/**
 * Log raw LLM output for diagnostics
 * FIXED: Use persistent directory with rotation instead of /tmp
 */
function logRawLLM(stage, text, storyId) {
  // Skip logging if disabled via environment variable
  if (process.env.DISABLE_LLM_LOGGING === 'true') {
    return;
  }

  try {
    // Use ./logs directory (create if not exists)
    const logsDir = path.join(process.cwd(), 'logs', 'llm_artifacts');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const file = path.join(logsDir, `llm_raw_${stage}_${storyId}_${timestamp}.txt`);
    const safe = String(text || '').slice(0, 200_000); // limit to 200KB

    fs.writeFileSync(file, safe, 'utf8');
    console.log('[RAW_LLM]', stage, file, { size: safe.length });

    // Log rotation: delete files older than 7 days
    cleanOldLogFiles(logsDir, 7 * 24 * 60 * 60 * 1000); // 7 days in ms
  } catch (e) {
    console.error('[RAW_LLM] Failed to write log:', e.message);
  }
}

/**
 * Clean log files older than maxAge milliseconds
 */
function cleanOldLogFiles(directory, maxAge) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(directory);

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log('[LOG_ROTATION] Deleted old log:', file);
      }
    }
  } catch (e) {
    console.error('[LOG_ROTATION] Failed to clean logs:', e.message);
  }
}

export class StoryOrchestrator {
  constructor(apiKey) {
    // Timeout: 20 minutes per API call (handles long stories up to 30 min target)
    // Long stories (>15 min target) can take 10-15 minutes to generate
    // Worker heartbeat (every 20s) prevents false "stalled" detection by Bull Queue
    // Stalled detection is 15 minutes - API timeout must be longer
    this.client = new Anthropic({
      apiKey,
      timeout: 1200000, // 20 minutes in milliseconds (longer than stalledInterval)
      maxRetries: 2, // Retry on transient network errors
    });
    this.currentStoryId = null; // Track current story for artifacts
  }

  /**
   * Main generation function
   */
  async generate(payload) {
    const storyId = nanoid();
    this.currentStoryId = storyId; // Set for artifact saving
    const startTime = Date.now();

    const {
      language,
      genre,
      minutes,
      prompt: userPrompt,
      pov = 'third',
      audioMode = false,  // Audio-first optimization for YouTube VO
      policy = { no_explicit_content: true, violence_level: 'moderate' },
      options = { return_outline: true, return_titles: true }
    } = payload;

    // Create logger for this story
    const log = createStoryLogger(storyId, { language, genre, minutes });
    log.info('Starting story generation');

    // Sanitize user input
    const prompt = sanitizeUserPrompt(userPrompt);

    // Calculate target words and mode (language-specific)
    const wordsPerMinute = getWordsPerMinute(language);
    const targetWords = minutes * wordsPerMinute;
    const mode = targetWords <= LONG_MODE_THRESHOLD ? 'short' : 'long';

    log.info({ mode, targetWords }, 'Mode determined');

    // Get language and genre packs
    const languagePack = getLanguagePack(language);
    const genrePack = getGenrePack(genre);

    let result;
    try {
      if (mode === 'short') {
        result = await this.generateShort({
          storyId,
          language,
          genre,
          targetWords,
          policy,
          prompt,
          pov,
          audioMode,
          options,
          languagePack,
          genrePack,
          log
        });
      } else {
        result = await this.generateLong({
          language,
          genre,
          targetWords,
          policy,
          prompt,
          pov,
          audioMode,
          options,
          languagePack,
          genrePack,
          log
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      log.info({ duration_ms: duration }, 'Generation complete');

      // Build final response
      return {
        meta: {
          story_id: storyId,
          language,
          genre,
          target_words: targetWords,
          actual_words: countWords(result.chaptersMarkdown, language),
          mode,
          generation_time_seconds: (duration / 1000).toFixed(1)
        },
        outline: options.return_outline ? result.outline : undefined,
        chapters_markdown: result.chaptersMarkdown,
        titles: options.return_titles ? result.titles : undefined,
        synopsis: result.synopsis,
        quality: result.quality
      };
    } catch (error) {
      log.error({ error: error.message }, 'Generation failed');
      throw error;
    }
  }

  /**
   * Short mode: 2-3 calls (Sonnet Planner → Haiku Polish → Optional corrections)
   * For stories >2200 words: uses 2-act segmentation to reduce repetition
   */
  async generateShort({ storyId, language, genre, targetWords, policy, prompt, pov, audioMode = false, options = {}, languagePack, genrePack, log }) {
    // Act segmentation for larger short stories (>2200 words ~ 15 min)
    const ACT_SEGMENTATION_THRESHOLD = 2200;

    if (targetWords > ACT_SEGMENTATION_THRESHOLD) {
      log.info({ targetWords, numActs: 2 }, 'Using act segmentation for large short story');
      return this.generateShortMultiAct({ storyId, language, genre, targetWords, policy, prompt, pov, audioMode, options, languagePack, genrePack, log });
    }

    log.info('Step 1: Sonnet Planner');

    // Call 1: Sonnet Planner with retry
    const expectedChapters = calculateExpectedChapters(targetWords);

    const plannerPrompt = buildSonnetPlannerPrompt({
      language,
      genre,
      mode: 'short',
      targetWords,
      policy,
      prompt,
      pov,
      audioMode,
      languagePack,
      genrePack,
      expectedChapters,
      options
    });

    // Use genre-specific temperature (opening phase)
    const temperature = genrePack.temps ? genrePack.temps[0] : 0.7;

    const plannerResponse = await withRetry(
      () => this.callClaude('sonnet', plannerPrompt, { temperature, log })
    );

    // Log RAW LLM output for diagnostics
    logRawLLM('planner', plannerResponse, storyId);

    let plannerData = parseSonnetPlannerResponse(plannerResponse);

    // Validate and fix if needed
    const validation = validateSonnetPlannerResponse(plannerData);
    if (!validation.success) {
      log.warn({ errors: validation.errors }, 'Validation failed, attempting to fix');
      plannerData = fixInvalidData(plannerData, validation);
    }

    log.info({ words: countWords(plannerData.chapters, language), titles: plannerData.titles.length }, 'Planner complete');

    // Start with Sonnet chapters as the final text
    let finalChapters = plannerData.chapters;

    // HOTFIX: Apply Sonnet revision for extreme repetition (before polish system)
    const initialMetrics = {
      repetition_rate_bigrams: calculateBigramRepetition(finalChapters, languagePack).rate,
      highFrequencyBigrams: calculateBigramRepetition(finalChapters, languagePack).highFrequencyBigrams
    };

    // Apply soft deduplication first
    finalChapters = softDedupe(finalChapters);

    // Strip meta lines early (but don't add time bridges yet - they'll be added once at the end)
    finalChapters = stripMetaLines(finalChapters);
    // Audio beats removed - TTS uses natural paragraph breaks for pauses

    const repetitionThreshold = getGenreRepetitionThreshold(genre, genrePack);
    const extremeFactor = parseFloat(process.env.EXTREME_REPETITION_FACTOR || '10');
    const extremeThreshold = repetitionThreshold * extremeFactor;

    const needsExtreme = initialMetrics.repetition_rate_bigrams >= extremeThreshold;
    const needsReduce = initialMetrics.repetition_rate_bigrams > repetitionThreshold * 1.5;

    if (needsExtreme || needsReduce) {
      log.warn({
        rate: initialMetrics.repetition_rate_bigrams,
        threshold: repetitionThreshold,
        mode: needsExtreme ? 'extreme' : 'reduce'
      }, 'Applying Sonnet revision for repetition');

      const revisionPrompt = buildSonnetRevisionPrompt({
        chapters: finalChapters,
        repeatList: initialMetrics.highFrequencyBigrams || [],
        languagePack,
        mode: needsExtreme ? 'extreme' : 'reduce'
      });

      const revisionResponse = await withRetryAndFallback(
        () => withRetry(
          () => this.callClaude('sonnet', revisionPrompt, { temperature: 0.2, log, step: 'sonnet_revision' }),
          { retries: 2, baseDelay: 1000 }
        ),
        () => {
          log.warn('Revision failed after retries, using original text');
          return { text: finalChapters };
        }
      );

      // Handle both direct response (from callClaude) and fallback object (with text property)
      const revisedText = typeof revisionResponse === 'string' ? revisionResponse : revisionResponse.text;

      if (typeof revisionResponse === 'string') {
        const revisedData = parseSonnetPlannerResponse(revisedText);
        if (revisedData.chapters && countWords(revisedData.chapters, language) > targetWords * 0.5) {
          finalChapters = revisedData.chapters;

          // Re-apply meta line stripping after revision (time bridges will be added once at the end)
          finalChapters = stripMetaLines(finalChapters);
          // Audio beats removed - TTS uses natural paragraph breaks for pauses

          log.info({ newRate: calculateBigramRepetition(finalChapters, languagePack).rate }, 'Revision applied');
        }
      } else {
        // Fallback was used, revisedText is already the original finalChapters
        finalChapters = revisedText;
      }
    }

    // Check quality metrics to decide if polish is needed
    const polishMode = process.env.POLISH_MODE || 'off';
    const bigramData = calculateBigramRepetition(finalChapters, languagePack);
    const lengthCheck = checkLength(finalChapters, targetWords);
    const chapters = extractChapters(finalChapters);
    const missingHooks = chapters.filter(ch => !hasHook(ch.text)).map(ch => ch.title);

    // Genre-aware repetition threshold
    const repetitionMaxBigrams = getGenreRepetitionThreshold(genre, genrePack);
    const lengthTolerance = parseFloat(process.env.LENGTH_TOLERANCE_PERCENT || '10') / 100;

    const needsPolish =
      polishMode === 'always' ||
      (polishMode === 'conditional' && (
        bigramData.rate > repetitionMaxBigrams ||
        Math.abs(lengthCheck.ratio - 1.0) > lengthTolerance ||
        missingHooks.length > 0
      ));

    if (needsPolish) {
      log.info({
        reason: {
          repetition: bigramData.rate > repetitionMaxBigrams,
          length: Math.abs(lengthCheck.ratio - 1.0) > lengthTolerance,
          hooks: missingHooks.length > 0
        }
      }, 'Step 2: Applying conditional polish');

      // Call Haiku with strict patch mode
      const patchPrompt = buildHaikuPatchStrictPrompt({
        chaptersMarkdown: finalChapters,
        languagePack,
        repetitionData: bigramData.highFrequencyBigrams,
        missingHooks,
        rules: {
          fixRepetition: bigramData.rate > repetitionMaxBigrams,
          enforceHooks: missingHooks.length > 0,
          normalizePunctuation: true
        }
      });

      try {
        const patchResponse = await withRetry(
          () => this.callClaude('haiku', patchPrompt, {
            temperature: 0.2,
            log,
            step: 'haiku_patch'
          }),
          { retries: 3, baseDelay: 800 }
        );

        // Validate that response is not meta-commentary
        const validation = isValidPatchResponse(patchResponse, targetWords * 0.5);

        if (validation.valid) {
          // Try to parse the patched response
          const patchData = parseHaikuPolishResponse(patchResponse);

          if (patchData.chapters && countWords(patchData.chapters, language) > targetWords * 0.5) {
            finalChapters = patchData.chapters;

            // Re-apply meta line stripping after patch (time bridges will be added once at the end)
            finalChapters = stripMetaLines(finalChapters);
            // Audio beats removed - TTS uses natural paragraph breaks for pauses

            log.info({ words: countWords(finalChapters, language) }, 'Patch applied successfully');
          } else {
            log.warn('Patch parsing failed, using Sonnet original');
          }
        } else {
          log.warn({ reason: validation.reason }, 'Patch response invalid, using Sonnet original');
        }
      } catch (error) {
        log.warn({ error: error.message }, 'Patch failed, using Sonnet original');
      }
    } else {
      log.info('Step 2: Skipping polish (quality metrics passed)');
    }

    // Step 3: Continuation recovery if truncated
    const truncCheck = isTruncated(finalChapters, targetWords);
    if (truncCheck.truncated) {
      log.warn({ ...truncCheck }, 'Text appears truncated, attempting continuation recovery');
      finalChapters = await this.recoverContinuation(finalChapters, truncCheck.missingWords, language, log);
    }

    // Step 4: Length correction (raised threshold to 500 words = ~16% tolerance)
    const finalLengthCheck = checkLength(finalChapters, targetWords);
    if (finalLengthCheck.needsAdjustment && Math.abs(finalLengthCheck.difference) > 500) {
      log.info({ adjustment: finalLengthCheck.difference }, 'Applying length correction');
      finalChapters = await this.correctLength(finalChapters, finalLengthCheck.difference, targetWords, log);
    }

    // Step 5: Hook enforcement (only if enabled and still missing hooks)
    const hookEnforce = process.env.HOOK_ENFORCE === 'true';
    if (hookEnforce) {
      finalChapters = await this.enforceHooks(finalChapters, log);
    }

    // Final quality gate before returning to user
    const gateResult = qualityGate(finalChapters, targetWords, {
      lengthTolerance: lengthTolerance,
      repetitionMax: repetitionMaxBigrams,
      requireHooks: process.env.HOOK_ENFORCE === 'true',
      genre,
      genrePack,
      languagePack,
      userPrompt: prompt,
      checkMotifs: true,
      checkDialogue: true,
      checkVisiblePriceRequired: genrePack.quietNoirMode?.visiblePriceRequired || false,
      checkAnchorsRequired: genrePack.quietNoirMode?.characterAnchorsRequired || false,
      checkPOVConsistency: true,
      checkMonetization: shouldApplyRomanceSafety(genre),  // Monetization gate for romance/drama
      audioMode,  // Audio-first mode for YouTube VO
      language,
      pov,
      stylePolicy: process.env.STYLE_POLICY === 'on' || process.env.STYLE_POLICY === 'conditional',
      maxAvgSentence: parseInt(process.env.SENT_LEN_MAX || '16', 10),
      maxRhetoricalPerChapter: parseInt(process.env.RQUESTIONS_PER_SCENE_MAX || '1', 10),
      allowLongDialogueTurns: parseInt(process.env.DIALOGUE_TURN_MAX_EXCEPTIONS || '0', 10)
    });

    log.info({
      passed: gateResult.passed,
      failures: gateResult.failures,
      metrics: gateResult.metrics
    }, 'Quality gate check');

    // If gate failed and polish mode allows it, try one final genre-specific patch
    if (!gateResult.passed && polishMode !== 'off') {
      log.warn({ failures: gateResult.failures }, 'Quality gate failed, routing to genre-specific patch');

      try {
        // Use patchRuntime (no circular dependencies, pure functions)
        const { pickPatch, buildPatchPrompt } = await import('./patch/patchRuntime.js');

        // Get ENV parameters for patch selection
        const repetitionThreshold = parseFloat(process.env.REPETITION_MAX_BIGRAMS || '3.2');
        const extremeFactor = parseFloat(process.env.EXTREME_REPETITION_FACTOR || '10');

        // Select patch type based on metrics and genre
        const patchType = pickPatch(genrePack, gateResult.metrics, repetitionThreshold, extremeFactor, pov, audioMode);

        if (patchType) {
          log.info({ patchType }, 'Applying genre-specific patch');

          // Remove audio beats BEFORE patch (so LLM doesn't see/rewrite them as text)
          const finalChaptersClean = stripAudioBeats(finalChapters);

          // Build patch prompt (pure function, all inline)
          const patchPrompt = buildPatchPrompt(patchType, {
            chapters: finalChaptersClean,
            languagePack,
            metrics: gateResult.metrics,
            genrePack,
            repetitionMax: repetitionThreshold
          });

          if (patchPrompt) {
            try {
              const finalPatchResponse = await withRetry(
                () => this.callClaude('haiku', patchPrompt, {
                  temperature: 0.2,
                  log,
                  step: `patch_${patchType}`
                }),
                { retries: 3, baseDelay: 800 }
              );

              const finalValidation = isValidPatchResponse(finalPatchResponse, targetWords * 0.5);
              if (finalValidation.valid) {
                const finalPatchData = parseHaikuPolishResponse(finalPatchResponse);
                if (finalPatchData.chapters && countWords(finalPatchData.chapters, language) > targetWords * 0.5) {
                  finalChapters = finalPatchData.chapters;
                  log.info({ patchType }, 'Genre-specific patch applied successfully');
                }
              }
            } catch (e) {
              log.error({ error: e.message, patchType }, 'Patch failed after retries, using original chapters');
            }
          }
        } else {
          log.info('No suitable patch found for failures');
        }
      } catch (e) {
        log.warn({ error: e.message }, 'Final patch failed, using current version');
      }
    }

    // Generate quality report
    const quality = generateQualityReport(finalChapters, targetWords, null, languagePack);
    quality.gate = gateResult;  // Include gate results

    logMetrics(log, {
      repetition_rate: quality.repetition.rate,
      pacing_flags_count: quality.pacing.flags.length,
      quality_gate_passed: gateResult.passed
    });

    // FINAL sanitization: remove ALL control markers before returning to user
    // NOTE: Time bridges are generated naturally by Sonnet planner - no need to add them artificially
    let cleanChapters = sanitizeControlMarkers(finalChapters);

    // Apply romance safety sanitization if needed (only if forbidden terms detected)
    const sanitizeResult = sanitizeRomance(cleanChapters, genre);
    cleanChapters = sanitizeResult.text;
    quality.sanitized = sanitizeResult.sanitized;

    // FINAL: Keep audio beats if audioMode enabled (for YouTube VO)
    if (!audioMode) {
      cleanChapters = stripAudioBeats(cleanChapters);
    }

    return {
      outline: plannerData.outline,
      chaptersMarkdown: cleanChapters,
      titles: plannerData.titles,
      synopsis: plannerData.synopsis,
      quality
    };
  }

  /**
   * Short Multi-Act mode: Dynamic acts based on WORDS_PER_ACT (3000 words/act)
   * Flow: Sonnet Act 1 → softDedupe → Sonnet Act 2 → softDedupe → Assemble
   */
  async generateShortMultiAct({ storyId, language, genre, targetWords, policy, prompt, pov, audioMode = false, options = {}, languagePack, genrePack, log }) {
    // Dynamic acts: 3000 words per act (Sonnet can handle this comfortably)
    const NUM_ACTS = Math.max(2, Math.ceil(targetWords / WORDS_PER_ACT));
    const wordsPerAct = Math.round(targetWords / NUM_ACTS);
    const acts = [];
    const actSummaries = []; // Store brief summaries of ALL previous acts for cumulative context
    let allTitles = [];
    let allSynopses = [];
    let contextSummary = null;

    // Generate each act
    for (let i = 0; i < NUM_ACTS; i++) {
      const actNum = i + 1;
      log.info({ act: actNum, total: NUM_ACTS, wordsPerAct }, `Generating act ${actNum}`);

      // Build Sonnet prompt for this act
      const expectedChapters = calculateExpectedChapters(wordsPerAct);
      const temperature = genrePack.temps ? genrePack.temps[0] : 0.7;

      const plannerPrompt = buildSonnetPlannerPrompt({
        language,
        genre,
        mode: 'short',
        targetWords: wordsPerAct,
        policy,
        prompt,
        pov,
        audioMode,
        languagePack,
        genrePack,
        expectedChapters,
        contextSummary,
        actNumber: actNum,
        options
      });

      // Call Sonnet with retry
      const plannerResponse = await withRetry(
        () => this.callClaude('sonnet', plannerPrompt, { temperature, log, step: `act${actNum}_planner` }),
        { retries: 2, baseDelay: 1000 }
      );

      // Log RAW LLM output for diagnostics
      logRawLLM(`act${actNum}_planner`, plannerResponse, storyId);

      let plannerData = parseSonnetPlannerResponse(plannerResponse);

      // Validate and fix if needed
      const validation = validateSonnetPlannerResponse(plannerData);
      if (!validation.success) {
        log.warn({ errors: validation.errors }, `Act ${actNum} validation failed, attempting to fix`);
        plannerData = fixInvalidData(plannerData, validation);
      }

      log.info({ words: countWords(plannerData.chapters, language) }, `Act ${actNum} complete`);

      // Apply softDedupe to this act
      let actChapters = softDedupe(plannerData.chapters);

      // Strip meta lines from this act BEFORE storing
      actChapters = stripMetaLines(actChapters);

      // Store act
      acts.push(actChapters);

      if (i === 0) {
        allTitles = plannerData.titles;
      }
      allSynopses.push(plannerData.synopsis);

      // Generate context summary for next act
      if (i < NUM_ACTS - 1) {
        // Create brief summary of THIS act (200-250 words) for future reference
        const actWords = countWords(actChapters, language);
        const summaryLength = Math.min(250, Math.floor(actWords * 0.15)); // ~15% of act length, max 250 words
        const actSummary = actChapters.split(/\s+/).slice(0, summaryLength).join(' ') + '...';

        actSummaries.push({
          actNum,
          summary: actSummary
        });

        // Build cumulative context: summaries of ALL previous acts + FULL text of last act
        let cumulativeContext = '';

        // Add summaries of all acts EXCEPT the current one (current will be full text)
        if (actSummaries.length > 1) {
          cumulativeContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
          cumulativeContext += 'PREVIOUS ACTS SUMMARY (for plot continuity):\n';
          cumulativeContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

          for (let j = 0; j < actSummaries.length - 1; j++) {
            const { actNum: prevActNum, summary } = actSummaries[j];
            cumulativeContext += `ACT ${prevActNum} SUMMARY:\n${summary}\n\n`;
          }
        }

        // Add FULL text of the immediate previous act (most important for continuity)
        cumulativeContext += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        cumulativeContext += `ACT ${actNum} - FULL TEXT (continue from here):\n`;
        cumulativeContext += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        cumulativeContext += actChapters;
        cumulativeContext += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        cumulativeContext += `END OF ACT ${actNum}\n`;
        cumulativeContext += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        cumulativeContext += `YOUR TASK: Write Act ${actNum + 1} that continues naturally from where Act ${actNum} ended.\n`;
        cumulativeContext += `- Maintain character voices, POV consistency, tone, and narrative momentum\n`;
        cumulativeContext += `- Reference previous acts' events when relevant (you have summaries above)\n`;
        cumulativeContext += `- DO NOT repeat exact phrases or sentence patterns from previous acts\n`;
        cumulativeContext += `- Continue character arcs, don't restart them`;

        contextSummary = cumulativeContext;

        // NOTE: No motif scrubbing - Claude needs full context to maintain plot continuity
      }
    }

    // Skip assembler for short mode multi-act stories - just concatenate to prevent truncation
    log.info(`Joining ${NUM_ACTS} acts (skipping assembler for short mode)`);
    let finalChapters = acts.join('\n\n');

    // Apply final softDedupe
    finalChapters = softDedupe(finalChapters);

    // Strip meta lines (time bridges will be added once at the end)
    finalChapters = stripMetaLines(finalChapters);
    // Audio beats removed - TTS uses natural paragraph breaks for pauses

    // Check for repetition and apply Sonnet revision if needed
    const repetitionThreshold = getGenreRepetitionThreshold(genre, genrePack);
    const extremeThreshold = repetitionThreshold * parseFloat(process.env.EXTREME_REPETITION_FACTOR || '10');
    const initialBigramData = calculateBigramRepetition(finalChapters, languagePack);

    const needsExtreme = initialBigramData.rate >= extremeThreshold;
    const needsReduce = initialBigramData.rate > repetitionThreshold * 1.5;

    if (needsExtreme || needsReduce) {
      log.warn({
        rate: initialBigramData.rate,
        threshold: repetitionThreshold,
        mode: needsExtreme ? 'extreme' : 'reduce'
      }, 'Applying Sonnet revision for repetition');

      const revisionPrompt = buildSonnetRevisionPrompt({
        chapters: finalChapters,
        repeatList: initialBigramData.highFrequencyBigrams || [],
        languagePack,
        mode: needsExtreme ? 'extreme' : 'reduce'
      });

      const revisionResponse = await withRetryAndFallback(
        () => withRetry(
          () => this.callClaude('sonnet', revisionPrompt, { temperature: 0.2, log, step: 'sonnet_revision' }),
          { retries: 2, baseDelay: 1000 }
        ),
        () => {
          log.warn('Revision failed after retries, using original text');
          return { text: finalChapters };
        }
      );

      // Handle both direct response and fallback object
      const revisedText = typeof revisionResponse === 'string' ? revisionResponse : revisionResponse.text;

      if (typeof revisionResponse === 'string') {
        const revisedData = parseSonnetPlannerResponse(revisedText);
        if (revisedData.chapters && countWords(revisedData.chapters, language) > targetWords * 0.5) {
          finalChapters = revisedData.chapters;

          // Re-apply meta line stripping after revision (time bridges will be added once at the end)
          finalChapters = stripMetaLines(finalChapters);
          // Audio beats removed - TTS uses natural paragraph breaks for pauses

          log.info({ newRate: calculateBigramRepetition(finalChapters, languagePack).rate }, 'Revision applied');
        }
      } else {
        finalChapters = revisedText;
      }
    }

    // Continue with standard short mode flow (length correction, hook enforcement, quality gate)
    const polishMode = process.env.POLISH_MODE || 'off';

    const truncCheck = isTruncated(finalChapters, targetWords);
    if (truncCheck.truncated) {
      log.warn({ ...truncCheck }, 'Text appears truncated, attempting continuation recovery');
      finalChapters = await this.recoverContinuation(finalChapters, truncCheck.missingWords, language, log);
    }

    // Length correction (raised threshold to 500 words = ~16% tolerance)
    const finalLengthCheck = checkLength(finalChapters, targetWords);
    if (finalLengthCheck.needsAdjustment && Math.abs(finalLengthCheck.difference) > 500) {
      log.info({ adjustment: finalLengthCheck.difference }, 'Applying length correction');
      finalChapters = await this.correctLength(finalChapters, finalLengthCheck.difference, targetWords, log);
    }

    // Hook enforcement
    const hookEnforce = process.env.HOOK_ENFORCE === 'true';
    if (hookEnforce) {
      finalChapters = await this.enforceHooks(finalChapters, log);
    }

    // Quality gate (with audio metrics)
    const repetitionMaxBigrams = getGenreRepetitionThreshold(genre, genrePack);
    const lengthTolerance = parseFloat(process.env.LENGTH_TOLERANCE_PERCENT || '10') / 100;

    const gateResult = qualityGate(finalChapters, targetWords, {
      lengthTolerance,
      repetitionMax: repetitionMaxBigrams,
      requireHooks: process.env.HOOK_ENFORCE === 'true',
      genre,
      genrePack,
      languagePack,
      userPrompt: prompt,
      checkMotifs: true,
      checkDialogue: true,
      checkVisiblePriceRequired: genrePack.quietNoirMode?.visiblePriceRequired || false,
      checkAnchorsRequired: genrePack.quietNoirMode?.characterAnchorsRequired || false,
      checkPOVConsistency: true,
      checkMonetization: shouldApplyRomanceSafety(genre),  // Monetization gate for romance/drama
      audioMode,  // Audio-first mode for YouTube VO
      language,
      pov,
      stylePolicy: process.env.STYLE_POLICY === 'on' || process.env.STYLE_POLICY === 'conditional',
      maxAvgSentence: parseInt(process.env.SENT_LEN_MAX || '16', 10),
      maxRhetoricalPerChapter: parseInt(process.env.RQUESTIONS_PER_SCENE_MAX || '1', 10),
      allowLongDialogueTurns: parseInt(process.env.DIALOGUE_TURN_MAX_EXCEPTIONS || '0', 10)
    });

    log.info({
      passed: gateResult.passed,
      failures: gateResult.failures,
      metrics: gateResult.metrics
    }, 'Quality gate check');

    // If gate failed and polish mode allows it, try one final genre-specific patch
    if (!gateResult.passed && polishMode !== 'off') {
      log.warn({ failures: gateResult.failures }, 'Quality gate failed, routing to genre-specific patch');

      try {
        // Use patchRuntime (no circular dependencies, pure functions)
        const { pickPatch, buildPatchPrompt } = await import('./patch/patchRuntime.js');

        // Get ENV parameters for patch selection
        const repetitionThreshold = parseFloat(process.env.REPETITION_MAX_BIGRAMS || '3.2');
        const extremeFactor = parseFloat(process.env.EXTREME_REPETITION_FACTOR || '10');

        // Select patch type based on metrics and genre
        const patchType = pickPatch(genrePack, gateResult.metrics, repetitionThreshold, extremeFactor, pov, audioMode);

        if (patchType) {
          log.info({ patchType }, 'Applying genre-specific patch');

          // Remove audio beats BEFORE patch (so LLM doesn't see/rewrite them as text)
          const finalChaptersClean = stripAudioBeats(finalChapters);

          // Build patch prompt (pure function, all inline)
          const patchPrompt = buildPatchPrompt(patchType, {
            chapters: finalChaptersClean,
            languagePack,
            metrics: gateResult.metrics,
            genrePack,
            repetitionMax: repetitionThreshold
          });

          if (patchPrompt) {
            try {
              const finalPatchResponse = await withRetry(
                () => this.callClaude('haiku', patchPrompt, {
                  temperature: 0.2,
                  log,
                  step: `patch_${patchType}`
                }),
                { retries: 3, baseDelay: 800 }
              );

              const finalValidation = isValidPatchResponse(finalPatchResponse, targetWords * 0.5);
              if (finalValidation.valid) {
                const finalPatchData = parseHaikuPolishResponse(finalPatchResponse);
                if (finalPatchData.chapters && countWords(finalPatchData.chapters, language) > targetWords * 0.5) {
                  finalChapters = finalPatchData.chapters;
                  log.info({ patchType }, 'Genre-specific patch applied successfully');
                }
              }
            } catch (e) {
              log.error({ error: e.message, patchType }, 'Patch failed after retries, using original chapters');
            }
          }
        } else {
          log.info('No suitable patch found for failures');
        }
      } catch (e) {
        log.warn({ error: e.message }, 'Final patch failed, using current version');
      }
    }

    // Generate quality report
    // NOTE: Time bridges are generated naturally by Sonnet planner - no need to add them artificially
    const quality = generateQualityReport(finalChapters, targetWords, null, languagePack);
    quality.gate = gateResult;

    logMetrics(log, {
      repetition_rate: quality.repetition.rate,
      pacing_flags_count: quality.pacing.flags.length,
      quality_gate_passed: gateResult.passed
    });

    // Final sanitization
    let cleanChapters = sanitizeControlMarkers(finalChapters);

    // Apply romance safety sanitization if needed (only if forbidden terms detected)
    const sanitizeResult = sanitizeRomance(cleanChapters, genre);
    cleanChapters = sanitizeResult.text;
    quality.sanitized = sanitizeResult.sanitized;

    // FINAL: Keep audio beats if audioMode enabled (for YouTube VO)
    if (!audioMode) {
      cleanChapters = stripAudioBeats(cleanChapters);
    }

    return {
      outline: [],  // Multi-act doesn't preserve outline structure
      chaptersMarkdown: cleanChapters,
      titles: allTitles,
      synopsis: allSynopses.join('\n\n'),
      quality
    };
  }

  /**
   * Long mode: Multiple acts + assembly
   */
  async generateLong({ language, genre, targetWords, policy, prompt, pov, audioMode = false, options = {}, languagePack, genrePack, log }) {
    const numActs = Math.ceil(targetWords / WORDS_PER_ACT);
    const wordsPerAct = Math.round(targetWords / numActs);
    log.info({ numActs, wordsPerAct }, 'Long mode: multiple acts');

    const acts = [];
    const ledger = new PromiseLedger();
    let allOutlines = [];
    let allTitles = [];
    let allSynopses = [];

    for (let i = 0; i < numActs; i++) {
      const actNum = i + 1;
      log.info({ act: actNum, total: numActs }, 'Generating act');

      // Temperature variation by act (genre-aware)
      const temperature = this.getTemperatureForAct(actNum, numActs, genrePack);

      // Get context from ledger
      let contextSummary = i > 0 ? ledger.generateContextSummary(acts[i - 1]) : null;

      // Scrub motif tokens to prevent echo-repetition across acts
      if (contextSummary) {
        contextSummary = scrubMotifTokens(contextSummary, language);
      }

      // Call 1: Sonnet for this act
      const plannerPrompt = buildSonnetPlannerPrompt({
        language,
        genre,
        mode: 'long',
        targetWords: wordsPerAct,
        policy,
        prompt,
        pov,
        audioMode,
        languagePack,
        genrePack,
        contextSummary,
        actNumber: actNum,
        options
      });

      const plannerResponse = await withRetry(
        () => this.callClaude('sonnet', plannerPrompt, { temperature, log }),
        { retries: 2, baseDelay: 1000 }
      );

      let plannerData = parseSonnetPlannerResponse(plannerResponse);

      // Validate
      const validation = validateSonnetPlannerResponse(plannerData);
      if (!validation.success) {
        plannerData = fixInvalidData(plannerData, validation);
      }

      // Safety check: ensure outline is array before spreading
      const outline = Array.isArray(plannerData.outline) ? plannerData.outline : [];
      allOutlines.push(...outline);
      if (i === 0) allTitles = plannerData.titles;
      allSynopses.push(plannerData.synopsis);

      // Add to ledger
      ledger.addPromises(plannerData.checklist, actNum);

      log.info({ words: countWords(plannerData.chapters, language) }, 'Act planner complete');

      // Call 2: Haiku Polish
      const bigramData = calculateBigramRepetition(plannerData.chapters, languagePack);
      const polishPrompt = buildHaikuPolishPrompt({
        outlineJson: JSON.stringify(plannerData.outline, null, 2),
        checklist: plannerData.checklist.map(item => `- ${item}`).join('\n'),
        chaptersMarkdown: plannerData.chapters,
        languagePack,
        repetitionData: bigramData.highFrequencyBigrams.slice(0, 10),
        genre
      });

      const polishResponse = await withRetry(
        () => this.callClaude('haiku', polishPrompt, {
          temperature: 0.3,
          log,
          prefill: '<<<CHAPTERS>>>\n⟪CHAPTERS⟫\n# Chapter'  // Force immediate chapter output (no trailing space!)
        }),
        { retries: 2, baseDelay: 1000 }
      );

      const polishData = parseHaikuPolishResponse(polishResponse);

      // Update ledger resolutions
      ledger.updateResolutions(polishData.notes.checklist_resolution);

      // IMPORTANT: Use original planner chapters, NOT polish (polish only improves quality, doesn't replace)
      acts.push(plannerData.chapters);

      log.info({ act: actNum, words: countWords(plannerData.chapters, language) }, 'Act polish complete');
    }

    // Log ledger summary
    const ledgerSummary = ledger.getSummary();
    log.info({ ledger: ledgerSummary }, 'Promise ledger summary');

    // Call 3: Sonnet Assembler
    log.info('Assembling acts');

    const assemblerPrompt = buildSonnetAssemblerPrompt({
      allActsMarkdown: acts,
      language,
      genre,
      pov,
      languagePack,
      genrePack
    });

    const assemblerResponse = await withRetry(
      () => this.callClaude('sonnet', assemblerPrompt, { temperature: 0.6, log }),
      { retries: 2, baseDelay: 1000 }
    );

    if (!assemblerResponse) {
      throw new Error('Assembly failed: No response from AI model');
    }

    const assemblerData = parseSonnetAssemblerResponse(assemblerResponse);

    if (!assemblerData || !assemblerData.markdown) {
      throw new Error('Assembly failed: Invalid response structure');
    }

    log.info({ words: countWords(assemblerData.markdown, language) }, 'Assembly complete');

    // Length correction (raised threshold to 500 words = ~16% tolerance)
    const lengthCheck = checkLength(assemblerData.markdown, targetWords);
    let finalMarkdown = assemblerData.markdown;

    if (lengthCheck.needsAdjustment && Math.abs(lengthCheck.difference) > 500) {
      log.info({ adjustment: lengthCheck.difference }, 'Applying length correction');
      finalMarkdown = await this.correctLength(finalMarkdown, lengthCheck.difference, targetWords, log);
    }

    // Hook enforcement
    const hookEnforce = process.env.HOOK_ENFORCE === 'true';
    if (hookEnforce) {
      finalMarkdown = await this.enforceHooks(finalMarkdown, log);
    }

    // Strip meta lines
    finalMarkdown = stripMetaLines(finalMarkdown);
    // NOTE: Time bridges are generated naturally by Sonnet planner - no need to add them artificially
    // Audio beats removed - TTS uses natural paragraph breaks for pauses

    // Generate quality report
    const quality = generateQualityReport(finalMarkdown, targetWords, null, languagePack);
    quality.ledger = ledgerSummary;

    // FINAL sanitization: remove ALL control markers before returning to user
    let cleanMarkdown = sanitizeControlMarkers(finalMarkdown);

    // Apply romance safety sanitization if needed (only if forbidden terms detected)
    const sanitizeResult = sanitizeRomance(cleanMarkdown, genre);
    cleanMarkdown = sanitizeResult.text;
    quality.sanitized = sanitizeResult.sanitized;

    // FINAL: Strip audio beats before export
    cleanMarkdown = stripAudioBeats(cleanMarkdown);

    return {
      outline: allOutlines,
      chaptersMarkdown: cleanMarkdown,
      titles: allTitles,
      synopsis: assemblerData.metadata.synopsis || allSynopses.join('\n\n'),
      quality
    };
  }

  /**
   * Get temperature for act (varies by position)
   * Now uses genre pack temperature profiles if available
   */
  getTemperatureForAct(actNum, totalActs, genrePack = null) {
    // If genre pack has temperature profile, use it
    if (genrePack?.temps && genrePack.temps.length === 3) {
      const progress = actNum / totalActs;
      const [opening, middle, finale] = genrePack.temps;

      if (progress < 0.25) return opening;
      if (progress < 0.75) return middle;
      return finale;
    }

    // Fallback to default profile
    if (totalActs <= 2) return 0.7;

    const progress = actNum / totalActs;

    if (progress < 0.25) return 0.8; // Opening: more creative
    if (progress < 0.75) return 0.85; // Middle: most creative
    return 0.65; // Ending: more controlled
  }

  /**
   * Recover continuation for truncated text
   */
  async recoverContinuation(chaptersMarkdown, missingWords, language, log) {
    const continuationPrompt = buildContinuationPrompt(chaptersMarkdown, missingWords, language);

    try {
      const continuationResponse = await this.callClaude('sonnet', continuationPrompt, { temperature: 0.8, log });

      const mergedText = mergeContinuation(chaptersMarkdown, continuationResponse.trim());

      log.info({ originalWords: countWords(chaptersMarkdown, language), finalWords: countWords(mergedText, language) }, 'Continuation recovery successful');

      return mergedText;
    } catch (error) {
      log.warn({ error: error.message }, 'Continuation recovery failed, using original');
      return chaptersMarkdown;
    }
  }

  /**
   * Correct story length
   */
  async correctLength(chaptersMarkdown, adjustment, targetWords, log) {
    if (Math.abs(adjustment) < 100) return chaptersMarkdown; // Skip if trivial

    const correctorPrompt = buildLengthCorrectorPrompt({
      chaptersMarkdown,
      adjustment,
      targetWords
    });

    try {
      const correctedResponse = await this.callClaude('haiku', correctorPrompt, { temperature: 0.3, log });
      const corrected = correctedResponse.match(/⟪CHAPTERS⟫([\s\S]*?)⟪\/CHAPTERS⟫/);

      if (corrected && corrected[1]) {
        log.info('Length correction applied');
        return corrected[1].trim();
      }
    } catch (error) {
      log.warn({ error: error.message }, 'Length correction failed, using original');
    }

    return chaptersMarkdown;
  }

  /**
   * Enforce hooks at chapter ends
   */
  async enforceHooks(chaptersMarkdown, log) {
    const chapters = extractChapters(chaptersMarkdown);
    let modified = false;
    let result = chaptersMarkdown;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      if (!hasHook(chapter.text)) {
        log.info({ chapter: chapter.title }, 'Adding missing hook');

        try {
          const hookPrompt = buildHookEnforcerPrompt({
            chapterTitle: chapter.title,
            chapterText: chapter.text
          });

          const hookResponse = await this.callClaude('haiku', hookPrompt, { temperature: 0.5, log });
          const hook = hookResponse.trim();

          // Append hook to chapter
          result = result.replace(chapter.text, `${chapter.text}\n\n${hook}`);
          modified = true;
        } catch (error) {
          log.warn({ error: error.message, chapter: chapter.title }, 'Hook enforcement failed');
        }
      }
    }

    if (modified) {
      log.info('Hooks enforced');
    }

    return result;
  }

  /**
   * Call Claude API
   */
  async callClaude(model, { systemPrompt, userPrompt }, options = {}) {
    const { temperature = 1.0, log, step = model, prefill = null } = options;

    const modelMap = {
      'sonnet': 'claude-sonnet-4-20250514',
      'haiku': 'claude-3-5-haiku-20241022'
    };

    // Use ENV variable with higher defaults to prevent truncation
    // Haiku max output tokens: 8192 (enforced by API)
    const envMaxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '32000', 10);
    const maxTokens = model === 'sonnet' ? envMaxTokens : Math.min(envMaxTokens, 8192);

    const startTime = Date.now();

    // Build messages array
    const messages = [
      {
        role: 'user',
        content: userPrompt
      }
    ];

    // Add prefill if provided (forces Claude to start with specific text)
    if (prefill) {
      messages.push({
        role: 'assistant',
        content: prefill
      });
    }

    const response = await this.client.messages.create({
      model: modelMap[model],
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages
    });

    const duration = Date.now() - startTime;
    let responseText = response.content[0].text;

    // If prefill was used, prepend it to the response
    if (prefill) {
      responseText = prefill + responseText;
    }

    // Save raw artifact for debugging
    if (this.currentStoryId) {
      await saveArtifact(this.currentStoryId, step, responseText);
    }

    if (log) {
      log.debug({
        model,
        temperature,
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        duration_ms: duration,
        response_length: responseText.length,
        used_prefill: !!prefill
      }, 'Claude API call');
    }

    return responseText;
  }
}

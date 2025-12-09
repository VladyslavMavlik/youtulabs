/**
 * Quality enforcement utilities
 */
console.log('[LOAD] quality.js');

import { countWords, extractChapters } from './parsers.js';
import { getPOVPronounPatterns } from '../prompts/povDirectives.js';

/**
 * Extract content tokens (remove stopwords, punctuation, markdown, service markers)
 */
function contentTokens(text, languagePack) {
  const stopwords = new Set(languagePack.stopwords || []);

  return text
    .toLowerCase()
    // Remove chapter headers (e.g., "Chapter 1", "Chapter X")
    .replace(/^\s*#+\s*chapter.*/gmi, '')
    // Remove block markers <<<>>> and ⟪⟫
    .replace(/<<<[^>]+>>>/g, ' ')
    .replace(/⟪[^⟫]+⟫/g, ' ')
    // Remove service strings (lines with only quotes/dashes)
    .replace(/^\s*["«»'–—-]+\s*$/gm, ' ')
    // Remove markdown headers
    .replace(/#[^\n]*\n/g, '\n')
    // Remove dashes, quotes, punctuation
    .replace(/[—–\-—"«»""'']+/g, ' ')
    // Split on whitespace
    .split(/\s+/)
    // Keep only letters and numbers, remove punctuation
    .map(t => t.replace(/[^\p{L}\p{N}]+/gu, ''))
    // Filter out stopwords and single-char tokens
    .filter(t => t && !stopwords.has(t) && t.length > 1);
}

/**
 * Calculate bigram repetition rate per 1000 bigrams (content-aware v3)
 * Formula: (repeated_bigrams / total_bigrams) * 1000
 */
export function calculateBigramRepetition(text, languagePack = {}) {
  const tokens = contentTokens(text, languagePack);

  if (tokens.length < 4) {
    return {
      rate: 0,
      total: 0,
      highFrequencyBigrams: []
    };
  }

  // Count bigrams
  const bigramCounts = new Map();
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
  }

  // Total bigrams = number of bigrams created
  const totalBigrams = tokens.length - 1;

  // Count repeating bigrams (freq > 1)
  let repeatedBigrams = 0;
  for (const count of bigramCounts.values()) {
    if (count > 1) {
      repeatedBigrams += (count - 1);
    }
  }

  // Rate per 1000 bigrams (CORRECT FORMULA per Vlad)
  const rate = totalBigrams > 0 ? (repeatedBigrams / totalBigrams) * 1000 : 0;

  // Top high-frequency bigrams
  const highFrequencyBigrams = Array.from(bigramCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([bigram, count]) => ({ bigram, count }))
    .sort((a, b) => b.count - a.count);

  // Diagnostic logging
  console.log('[BIGRAM_DIAGNOSTIC]', {
    totalBigrams,
    repeatedBigrams,
    rate: rate.toFixed(2),
    top10: highFrequencyBigrams.slice(0, 10).map(b => `"${b.bigram}":${b.count}`)
  });

  return {
    rate,
    total: repeatedBigrams,
    highFrequencyBigrams
  };
}

/**
 * Check if chapter ends with a hook
 */
export function hasHook(chapterText) {
  const lastParagraphs = chapterText.trim().split('\n\n').slice(-2).join('\n\n');

  // Check for question marks BEFORE splitting (split removes them!)
  if (lastParagraphs.includes('?')) return true;

  // Split for pattern matching
  const lastSentences = lastParagraphs.split(/[.!?]+/).slice(-3).join('. ');

  // Check for common hook patterns
  const hookPatterns = [
    /but\s+/i,
    /however\s+/i,
    /suddenly\s+/i,
    /then\s+/i,
    /until\s+/i,
    /unless\s+/i,
    /if\s+only/i,
    /what\s+if/i,
    /could\s+it\s+be/i,
    /wondered/i,
    /realized/i,
    /discovered/i,
    /heard/i,
    /saw/i,
    /felt/i
  ];

  return hookPatterns.some(pattern => pattern.test(lastSentences));
}

/**
 * Check for POV drift (perspective consistency)
 * Detects if text is using wrong pronouns for the specified POV
 */
export function povDriftMetrics(text, pov, language = 'en-US') {
  if (!pov || !text) {
    return { drift: false, first: 0, third: 0 };
  }

  // Remove dialogue (content in quotes) to avoid false positives
  const scrubbed = text.replace(/"[^"]*"|'[^']*'|«[^»]*»|"[^"]*"/g, '');

  // Get pronoun patterns for the language
  const patterns = getPOVPronounPatterns(language);

  // Count pronouns
  const firstMatches = scrubbed.match(patterns.first) || [];
  const thirdMatches = scrubbed.match(patterns.third) || [];

  const firstCount = firstMatches.length;
  const thirdCount = thirdMatches.length;

  let drift = false;

  if (pov === 'first') {
    // If many third-person pronouns in a first-person narrative → drift
    // First-person should have 5-10x more "I" than "he/she" pronouns
    // Allow only 20% third-person (for dialogue attribution like "he said")
    drift = thirdCount > Math.max(5, firstCount * 0.20);
  } else if (pov === 'third') {
    // If many first-person pronouns in a third-person narrative → drift
    // Third-person should be dominant, allow only 10% first-person
    drift = firstCount > Math.max(5, thirdCount * 0.10);
  }

  return {
    drift,
    first: firstCount,
    third: thirdCount,
    pov
  };
}

/**
 * Enforce hooks at chapter ends
 */
export function enforceHooks(markdown) {
  const chapters = extractChapters(markdown);
  let modified = false;
  let result = markdown;

  chapters.forEach((chapter, index) => {
    if (!hasHook(chapter.text)) {
      console.log(`Chapter ${index + 1} missing hook, needs enhancement`);
      modified = true;
      // Note: This would require an additional API call to add a hook
      // For now, we just flag it
    }
  });

  return { markdown: result, modified };
}

/**
 * Check length and suggest adjustments
 */
export function checkLength(markdown, targetWords) {
  const actualWords = countWords(markdown);
  const difference = actualWords - targetWords;

  // Safe ratio calculation (prevent NaN)
  const ratio = (targetWords > 0) ? (actualWords / targetWords) : 0;
  const percentDiff = (targetWords > 0) ? (difference / targetWords) * 100 : 0;

  const withinRange = Math.abs(percentDiff) <= 10;

  return {
    actualWords,
    targetWords,
    difference,
    ratio,  // actualWords / targetWords
    percentDiff: percentDiff.toFixed(1),
    withinRange,
    needsAdjustment: !withinRange,
    suggestion: !withinRange
      ? difference > 0
        ? `condense by approximately ${Math.abs(difference)} words`
        : `expand by approximately ${Math.abs(difference)} words`
      : null
  };
}

/**
 * Analyze pacing (exposition vs action ratio)
 */
export function analyzePacing(markdown) {
  const chapters = extractChapters(markdown);
  const flags = [];

  chapters.forEach((chapter, index) => {
    const paragraphs = chapter.text.split('\n\n').filter(p => p.trim());

    // Heuristic: paragraphs with lots of "was", "were", "had been" might be exposition-heavy
    let expositionCount = 0;
    paragraphs.forEach(para => {
      const expositionMarkers = (para.match(/\b(was|were|had been|used to|would often)\b/gi) || []).length;
      if (expositionMarkers > 2) expositionCount++;
    });

    const expositionRatio = paragraphs.length > 0 ? expositionCount / paragraphs.length : 0;

    if (expositionRatio > 0.25) {
      flags.push(`Chapter ${index + 1}: High exposition ratio (${(expositionRatio * 100).toFixed(0)}%)`);
    }

    if (!hasHook(chapter.text)) {
      flags.push(`Chapter ${index + 1}: Missing soft hook at end`);
    }
  });

  return flags;
}

/**
 * Calculate average sentence length for pacing analysis
 */
export function avgSentenceLength(text) {
  // Remove quoted dialogue to avoid skewing results
  const noQuotes = text.replace(/"[^"]*"|'[^']*'|«[^»]*»|"[^"]*"/g, ' ');
  const sentences = noQuotes.split(/[.!?]+[\s\n]/).filter(s => s.trim().length > 0);
  const words = sentences.map(s => s.trim().split(/\s+/).length);
  const avg = words.length ? (words.reduce((a, b) => a + b, 0) / words.length) : 0;

  return { avg, sentences: sentences.length };
}

/**
 * Count rhetorical questions (potential tell-not-show markers)
 */
export function countRhetorical(text) {
  // Remove quoted dialogue
  const scrub = text.replace(/"[^"]*"|'[^']*'|«[^»]*»|"[^"]*"/g, ' ');

  // Question marks at end of line/paragraph
  const marks = (scrub.match(/\?\s*(\n|$)/g) || []).length;

  // Soft rhetorical patterns
  const soft = (scrub.match(/\b(why|what if|isn't it|am i|could it be|was it)\b/gi) || []).length;

  return marks + Math.max(0, soft - marks);
}

/**
 * Analyze dialogue turn length
 */
export function dialogueStats(text) {
  const lines = text.split('\n');
  let longTurns = 0;
  let totalTurns = 0;

  for (const ln of lines) {
    // Match dialogue lines (starts with quote)
    const isDialogue = /^["«].+["»]\s*$/.test(ln.trim());
    if (isDialogue) {
      totalTurns++;
      const wordCount = ln.trim().split(/\s+/).length;
      if (wordCount > 22) longTurns++;  // Realistic threshold: >22 words = long turn
    }
  }

  return { totalTurns, longTurns };
}

/**
 * Check for sensory triplet (sound + touch + space)
 * Simple heuristic for immersive writing
 */
export function sensoryTriplet(text) {
  const lower = text.toLowerCase();

  // Sound words (multilingual)
  const SOUND = /\b(hum|buzz|ring|clack|whisper|шурх|дзвін|гул|дзвоник|stuk|brzęk|szept|summen|klicken|flüstern)\b/;

  // Touch/tactile words
  const TOUCH = /\b(rough|warm|cold|slick|sharp|волога|гострий|тепл|холод|ciepły|chłodny|ostry|rau|kühl|scharf)\b/;

  // Spatial/architectural words
  const SPACE = /\b(corridor|stairs|doorframe|window|wall|вікно|коридор|ліфт|двері|okno|korytarz|drzwi|fenster|tür|gang)\b/;

  return {
    sound: SOUND.test(lower),
    touch: TOUCH.test(lower),
    space: SPACE.test(lower)
  };
}

/**
 * Quality check report
 */
export function generateQualityReport(markdown, targetWords, notesFromHaiku = null, languagePack = {}) {
  const bigramAnalysis = calculateBigramRepetition(markdown, languagePack);
  const lengthCheck = checkLength(markdown, targetWords);
  const pacingFlags = analyzePacing(markdown);

  return {
    repetition: {
      rate: bigramAnalysis.rate.toFixed(2),
      highFrequencyBigrams: bigramAnalysis.highFrequencyBigrams.slice(0, 5),
      acceptable: bigramAnalysis.rate <= 3
    },
    length: lengthCheck,
    pacing: {
      flags: pacingFlags,
      acceptable: pacingFlags.length === 0
    },
    haikuNotes: notesFromHaiku,
    overallQuality: bigramAnalysis.rate <= 3 && lengthCheck.withinRange && pacingFlags.length <= 2 ? 'good' : 'needs_review'
  };
}

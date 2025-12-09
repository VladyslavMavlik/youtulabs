/**
 * Audio-First Metrics
 * Measure listenability for YouTube VO / audiobooks
 */
console.log('[LOAD] audioMetrics.js');

import { getTransitionLexicon } from '../prompts/audioRules.js';

/**
 * Calculate median sentence length
 * Target: 12-16 words for voice acting
 */
export function calculateSentenceMedian(text) {
  // Split by sentence-ending punctuation
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

  if (sentences.length === 0) return 0;

  const wordCounts = sentences.map(s => s.trim().split(/\s+/).length);
  wordCounts.sort((a, b) => a - b);

  const mid = Math.floor(wordCounts.length / 2);
  const median = wordCounts.length % 2 === 0
    ? (wordCounts[mid - 1] + wordCounts[mid]) / 2
    : wordCounts[mid];

  return parseFloat(median.toFixed(1));
}

/**
 * Check beat compliance (paragraph span should be 80-140 words)
 * Returns ratio of paragraphs that fall within the range
 */
export function checkBeatCompliance(text) {
  // Split by double newline (paragraph breaks)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length === 0) return 0;

  let compliant = 0;
  const minWords = 80;
  const maxWords = 140;

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).length;
    if (words >= minWords && words <= maxWords) {
      compliant++;
    }
  }

  return parseFloat((compliant / paragraphs.length).toFixed(2));
}

/**
 * Count transition beacons per 1000 words
 * Returns density of time/place markers
 */
export function countTransitions(text, languageCode = 'en-US') {
  const lexicon = getTransitionLexicon(languageCode);
  const words = text.split(/\s+/).length;

  let count = 0;
  for (const beacon of lexicon) {
    // Case-insensitive search
    const regex = new RegExp(beacon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  const density = (count / words) * 1000;
  return {
    count,
    density: parseFloat(density.toFixed(2))
  };
}

/**
 * Calculate dialogue attribution ratio
 * Checks how often speaker names/tags appear relative to dialogue turns
 */
export function dialogueAttributionScore(text) {
  // Extract dialogue (text between quotes)
  const dialogueMatches = text.match(/"[^"]{10,}"/g) || [];
  const totalDialogueTurns = dialogueMatches.length;

  if (totalDialogueTurns === 0) return 1.0; // No dialogue = n/a

  // Count attribution markers near dialogue
  // Pattern: name/pronoun + "said"/"asked"/"replied" etc within 50 chars of quote
  const attributionPatterns = [
    /(\w+)\s+(said|asked|replied|whispered|shouted|muttered|answered|continued)/gi,
    /(he|she|they)\s+(said|asked|replied|whispered|shouted|muttered)/gi,
    /(said|asked|replied)\s+(\w+)/gi  // Inverted: "said John"
  ];

  let attributionCount = 0;
  for (const pattern of attributionPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      attributionCount += matches.length;
    }
  }

  // Ratio: attributions per 2 dialogue turns (ideal is ~0.5)
  const ratio = Math.min(1.0, attributionCount / (totalDialogueTurns / 2));
  return parseFloat(ratio.toFixed(2));
}

/**
 * Detect meta-intrusions (loglines, CTA, marketing text mid-narrative)
 * Returns array of problematic lines
 */
export function detectMetaIntrusions(text) {
  const lines = text.split('\n');
  const intrusions = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip markdown headers (those are OK)
    if (trimmed.startsWith('#')) continue;

    // Pattern 1: ALL CAPS lines (6+ chars)
    if (/^[A-Z][A-Z \-:]{6,}$/.test(trimmed)) {
      intrusions.push({ line: trimmed, type: 'all_caps' });
      continue;
    }

    // Pattern 2: Logline markers
    if (/^(LOGLINE|SYNOPSIS|CTA|AFTER HOURS|THIS STORY|THEMES):/i.test(trimmed)) {
      intrusions.push({ line: trimmed, type: 'logline_marker' });
      continue;
    }

    // Pattern 3: Marketing language
    if (/(explores themes of|set against|examines how|click to|subscribe|like and share)/i.test(trimmed)) {
      intrusions.push({ line: trimmed.substring(0, 60), type: 'marketing' });
      continue;
    }
  }

  return intrusions;
}

/**
 * Run all audio metrics
 * Returns comprehensive audio quality report
 */
export function runAudioMetrics(text, languageCode = 'en-US') {
  return {
    sentenceMedian: calculateSentenceMedian(text),
    beatCompliance: checkBeatCompliance(text),
    transitions: countTransitions(text, languageCode),
    dialogueAttribution: dialogueAttributionScore(text),
    metaIntrusions: detectMetaIntrusions(text)
  };
}

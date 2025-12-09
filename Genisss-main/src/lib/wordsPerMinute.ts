/**
 * Words per minute configuration for different languages
 * Based on average narration speed for engaging fiction audiobooks
 *
 * For languages without spaces (Japanese, Chinese, Thai):
 *   - Values are "word-equivalents" (characters ÷ density factor)
 *   - Backend countWords() applies automatic conversion
 *
 * Must match backend configuration in src/orchestrator.js
 */

export const WORDS_PER_MINUTE_BY_LANGUAGE = {
  'en-US': 155,    // English: Audible standard
  'en': 155,
  'uk-UA': 135,    // Ukrainian: longer words due to inflections
  'uk': 135,
  'ru-RU': 130,    // Russian: slower than Ukrainian (longer words)
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
  'ja-JP': 140,    // Japanese: ~350 CPM ÷ 2.5 = 140 word-equivalents
  'ja': 140,
  'zh-CN': 140,    // Chinese: ~350 CPM ÷ 2.5 = 140 word-equivalents
  'zh': 140,
  'ko-KR': 145,    // Korean: HAS spaces between words, agglutinative structure
  'ko': 145,
  'ar-SA': 150,    // Arabic: complex script (higher WPM to compensate for long words)
  'ar': 150,
  'th-TH': 160,    // Thai: ~640 CPM ÷ 4 = 160 word-equivalents (no spaces between words)
  'th': 160,
  'tr-TR': 140,    // Turkish: agglutinative like Ukrainian
  'tr': 140,
} as const;

const DEFAULT_WORDS_PER_MINUTE = 145; // Default for unlisted languages

export type SupportedLanguage = keyof typeof WORDS_PER_MINUTE_BY_LANGUAGE;

/**
 * Calculate expected word count for a given duration and language
 * @param duration - Duration in minutes
 * @param language - Language code
 * @returns Expected word count
 */
export function calculateWordCount(duration: number, language: string): number {
  // Use language-specific rate or default for unlisted languages
  const wordsPerMinute = WORDS_PER_MINUTE_BY_LANGUAGE[language as SupportedLanguage] ?? DEFAULT_WORDS_PER_MINUTE;
  return Math.round(duration * wordsPerMinute);
}
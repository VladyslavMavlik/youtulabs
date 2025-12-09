/**
 * Continuation Recovery - handles truncated text
 */

import { countWords } from './parsers.js';
import crypto from 'crypto';

/**
 * Check if text appears truncated
 */
export function isTruncated(text, targetWords) {
  const actualWords = countWords(text);

  // Check 1: Less than 90% of target
  if (actualWords < targetWords * 0.9) {
    // Check 2: Doesn't end with proper punctuation
    const lastChars = text.trim().slice(-10);
    const endsWithPunctuation = /[.!?][\s"»"]*$/.test(lastChars);

    if (!endsWithPunctuation) {
      return {
        truncated: true,
        actualWords,
        targetWords,
        missingWords: targetWords - actualWords,
        reason: 'Text is short and does not end with punctuation'
      };
    }
  }

  return {
    truncated: false,
    actualWords,
    targetWords
  };
}

/**
 * Build continuation prompt
 */
export function buildContinuationPrompt(chaptersMarkdown, missingWords, language) {
  // Extract last 400-500 chars as context
  const context = chaptersMarkdown.slice(-500);

  // Find the last complete sentence in context
  const sentences = context.split(/[.!?]+/);
  const lastCompleteSentence = sentences.length >= 2 ? sentences[sentences.length - 2] : '';

  const systemPrompt = `You are a Story Continuation Specialist.
Continue the story seamlessly from where it stopped. Match the exact tone, voice, and style.`;

  const userPrompt = `The story was interrupted mid-flow. Continue seamlessly from this exact point.

CONTEXT (last portion of the story):
${context}

REQUIREMENTS:
- Continue in ${language}
- Add approximately ${missingWords} words
- NO new chapter headings or outline resets
- Match the existing narrative voice and style exactly
- End at a natural story conclusion or soft hook
- Output ONLY the continuation text (no markers, no explanations)

Continue from here:`;

  return { systemPrompt, userPrompt };
}

/**
 * Hash text for deduplication
 */
export function hashText(text) {
  return crypto.createHash('md5').update(text).digest('hex').substring(0, 16);
}

/**
 * Merge continuation with original text
 */
export function mergeContinuation(originalText, continuation) {
  // Get hash of last 200 chars of original
  const originalEnd = originalText.slice(-200);
  const originalHash = hashText(originalEnd);

  // Check if continuation starts with same content (duplication)
  const continuationStart = continuation.substring(0, 200);
  const continuationHash = hashText(continuationStart);

  if (originalHash === continuationHash) {
    console.log('Continuation recovery: detected duplication, using continuation as-is');
    return continuation;
  }

  // Find overlap between end of original and start of continuation
  let overlapFound = false;
  for (let overlapSize = 100; overlapSize >= 10; overlapSize -= 10) {
    const originalSnippet = originalText.slice(-overlapSize);
    const idx = continuation.indexOf(originalSnippet);

    if (idx >= 0 && idx < 100) {
      // Found overlap - merge without duplication
      const mergedText = originalText + continuation.substring(idx + overlapSize);
      console.log(`Continuation recovery: found ${overlapSize} char overlap, merging`);
      return mergedText;
    }
  }

  // No overlap found - simple concatenation
  console.log('Continuation recovery: no overlap detected, simple append');
  return originalText + '\n\n' + continuation;
}

/**
 * Escape Filter - prevents prompt injection via control tokens
 */

const CONTROL_TOKENS = ['⟪', '⟫', '<<<', '>>>'];
const MARKER_NAMES = ['CHAPTERS', 'OUTLINE_JSON', 'CHECKLIST', 'TITLES', 'SYNOPSIS', 'NOTES'];

/**
 * Escape control tokens in user input to prevent breaking response parsing
 */
export function escapeControlTokens(text) {
  if (!text) return text;

  let escaped = text;

  // Replace Unicode control tokens with safe alternatives
  escaped = escaped.replace(/⟪/g, '⟨');  // U+2329 LEFT-POINTING ANGLE BRACKET
  escaped = escaped.replace(/⟫/g, '⟩');  // U+232A RIGHT-POINTING ANGLE BRACKET

  // Replace ASCII triple markers
  escaped = escaped.replace(/<<</g, '‹‹‹');  // U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK
  escaped = escaped.replace(/>>>/g, '›››');  // U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK

  // Neutralize marker names if they appear with markers
  MARKER_NAMES.forEach(markerName => {
    const patterns = [
      new RegExp(`⟪${markerName}⟫`, 'gi'),
      new RegExp(`<<<${markerName}>>>`, 'gi'),
      new RegExp(`⟪/${markerName}⟫`, 'gi'),
      new RegExp(`<<<END_${markerName}>>>`, 'gi')
    ];

    patterns.forEach(pattern => {
      escaped = escaped.replace(pattern, `[${markerName}]`);
    });
  });

  return escaped;
}

/**
 * Sanitize user prompt before sending to Claude
 */
export function sanitizeUserPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return '';
  }

  // Escape control tokens
  let sanitized = escapeControlTokens(prompt);

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

  // Trim
  sanitized = sanitized.trim();

  // Limit length (max 10000 chars for prompt)
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000) + '... [truncated]';
  }

  return sanitized;
}

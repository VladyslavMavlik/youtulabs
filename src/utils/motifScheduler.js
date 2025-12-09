/**
 * Motif Scheduler - simplified planner-first approach
 * Planner decides allowed/banned motifs per chapter
 */

/**
 * Build CHAPTER_CONSTRAINTS section for chapter prompt
 * @param {Object} chapterInfo - { n, allowed_motifs, banned_motifs }
 * @returns {string} - Constraints block for prompt
 */
export function buildChapterMotifConstraints(chapterInfo) {
  if (!chapterInfo || !chapterInfo.allowed_motifs) {
    return '';
  }

  const allowed = chapterInfo.allowed_motifs || [];
  const banned = chapterInfo.banned_motifs || [];

  if (allowed.length === 0 && banned.length === 0) {
    return '';
  }

  const allowedText = allowed.length > 0
    ? `You MAY name these motifs: ${allowed.join(', ')} (1-2 sentences max per motif)`
    : '';

  const bannedText = banned.length > 0
    ? `FORBIDDEN to name: ${banned.join(', ')} - use pronouns/neutral action only ("it", "the device", "that", etc.)`
    : '';

  return `
[CHAPTER_MOTIF_CONSTRAINTS]
${allowedText}
${bannedText}`;
}

/**
 * Scrub motif tokens from context summary to prevent accidental repetition
 * @param {string} contextSummary - Summary of previous acts
 * @param {string} language - Language code for language-specific patterns
 * @returns {string} - Cleaned summary
 */
export function scrubMotifTokens(contextSummary, language = 'en-US') {
  if (!contextSummary) return contextSummary;

  // Language-specific motif patterns
  const patterns = {
    'en-US': [
      /\b(camera|cameras|CCTV|surveillance|monitor|monitoring|feed)\b/gi,
      /\b(audit|audits|IT check|IT sweep|inspection)\b/gi,
      /\b(letter|letters|envelope|envelopes|attorney|legal notice)\b/gi,
      /\b(remote|remotes|dimmer|stage-?light|lighting preset)\b/gi,
      /\b(timestamp|timestamps|auto-?delete|countdown)\b/gi
    ],
    'uk-UA': [
      /\b(камера|камери|відеоспостереження|моніторинг|монітор)\b/gi,
      /\b(аудит|перевірка|ІТ-перевірка)\b/gi,
      /\b(лист|листи|конверт|конверти|адвокат|юридичне повідомлення)\b/gi,
      /\b(пульт|пульти|світло|освітлення|димер)\b/gi
    ],
    'pl-PL': [
      /\b(kamera|kamery|monitoring|monitorowanie)\b/gi,
      /\b(audyt|kontrola|inspekcja)\b/gi,
      /\b(list|listy|koperta|koperty|adwokat)\b/gi,
      /\b(pilot|piloty|światło|oświetlenie)\b/gi
    ],
    'de-DE': [
      /\b(Kamera|Kameras|Überwachung|Monitor)\b/gi,
      /\b(Prüfung|Inspektion|Kontrolle)\b/gi,
      /\b(Brief|Briefe|Umschlag|Anwalt)\b/gi,
      /\b(Fernbedienung|Licht|Beleuchtung)\b/gi
    ]
  };

  const languagePatterns = patterns[language] || patterns['en-US'];

  let cleaned = contextSummary;

  for (const pattern of languagePatterns) {
    // Replace with neutral phrase while preserving sentence structure
    cleaned = cleaned.replace(pattern, (match) => {
      // Preserve case of first letter
      const replacement = 'it';
      return match[0] === match[0].toUpperCase()
        ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
        : replacement;
    });
  }

  return cleaned;
}

/**
 * Motif Budget Tracker - prevents overuse of recurring motifs
 * For "quiet noir" style stories targeting mature readers
 */

/**
 * Track motif frequency in text
 * Returns { motif: string, count: number, positions: number[] }[]
 */
export function trackMotifs(text, motifPatterns = []) {
  const results = [];

  for (const pattern of motifPatterns) {
    const regex = new RegExp(pattern, 'gi');
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push(match.index);
    }

    if (matches.length > 0) {
      results.push({
        motif: pattern,
        count: matches.length,
        positions: matches
      });
    }
  }

  return results;
}

/**
 * Default motif patterns for quiet noir/romance
 */
export const DEFAULT_QUIET_NOIR_MOTIFS = [
  'timestamp',
  'auto-delete',
  'auto delete',
  'elevator bell',
  'elevator chime',
  'lift bell',
  'system clock',
  'digital clock',
  'countdown'
];

/**
 * Check if motifs exceed budget (max 3 per 10k words)
 * Returns { exceeded: boolean, violations: Array }
 */
export function checkMotifBudget(text, motifPatterns, maxAppearances = 3) {
  const wordCount = text.split(/\s+/).length;
  const scaleFactor = Math.max(1, wordCount / 10000);
  const adjustedMax = Math.ceil(maxAppearances * scaleFactor);

  const tracked = trackMotifs(text, motifPatterns);
  const violations = tracked.filter(m => m.count > adjustedMax);

  return {
    exceeded: violations.length > 0,
    violations: violations.map(v => ({
      motif: v.motif,
      count: v.count,
      limit: adjustedMax,
      excess: v.count - adjustedMax
    })),
    tracked,
    adjustedLimit: adjustedMax
  };
}

/**
 * Extract motifs from user prompt (looking for MOTIFS: [...])
 */
export function extractMotifsFromPrompt(prompt) {
  // Look for MOTIFS: [...]  or MOTIFS (max 3): [...]
  const motifMatch = prompt.match(/MOTIFS[^:]*:\s*\[([^\]]+)\]/i);

  if (motifMatch) {
    const motifsText = motifMatch[1];
    // Split by comma and clean
    return motifsText
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);
  }

  return DEFAULT_QUIET_NOIR_MOTIFS;
}

/**
 * Calculate dialogue ratio in text
 * For quiet noir, target is 28-40%
 */
export function calculateDialogueRatio(text) {
  // Count lines that start with dialogue markers
  const lines = text.split('\n');

  // English: "text"
  // Ukrainian: —text
  // Polish: —text
  const dialogueLines = lines.filter(line => {
    const trimmed = line.trim();
    return /^["«„—]/.test(trimmed) || /^—\s*[А-Яа-яЄєІіЇїҐґA-Za-z]/.test(trimmed);
  });

  const totalLines = lines.filter(l => l.trim().length > 0).length;

  return {
    ratio: totalLines > 0 ? dialogueLines.length / totalLines : 0,
    dialogueLines: dialogueLines.length,
    totalLines
  };
}

/**
 * Check for visible price in final chapter
 * Returns { found: boolean, examples: string[] }
 */
export function checkVisiblePrice(finalChapterText) {
  // Patterns indicating concrete consequences
  const pricePatterns = [
    /therapy|therapist|counseling|counsellor/i,
    /moved out|moving out|packed|separate apartment|new place/i,
    /quit|resigned|left (the|his|her) job|transferred/i,
    /blocked|unfollowed|deleted (his|her|the) number/i,
    /restraining order|legal|lawsuit/i,
    /hospital|clinic|treatment/i
  ];

  const found = [];

  for (const pattern of pricePatterns) {
    const match = finalChapterText.match(pattern);
    if (match) {
      // Extract context (30 words around match)
      const index = match.index;
      const start = Math.max(0, index - 150);
      const end = Math.min(finalChapterText.length, index + 150);
      found.push(finalChapterText.substring(start, end).trim());
    }
  }

  return {
    found: found.length > 0,
    examples: found.slice(0, 2)  // Max 2 examples
  };
}

/**
 * Check for character anchors (memory/gesture snippets)
 * Returns { found: boolean, count: number }
 */
export function checkCharacterAnchors(text) {
  // Look for memory/flashback indicators
  const anchorPatterns = [
    /remembered|recalled|thought back|flashed back/i,
    /years ago|months ago|once, (he|she)/i,
    /used to|would always|had always/i,
    /the way (he|she) used to/i,
    /memory of|reminded (him|her) of/i
  ];

  let count = 0;
  const examples = [];

  for (const pattern of anchorPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
      if (examples.length < 2) {
        examples.push(matches[0]);
      }
    }
  }

  return {
    found: count > 0,
    count,
    examples,
    sufficient: count >= 2  // At least 2 anchors (one per main character)
  };
}

/**
 * Chekhov Motif Groups - patterns that should appear exactly 3 times
 * (introduction, pivot, consequence)
 */
export const MOTIF_GROUPS = {
  camera: /(camera|monitor|surveil(lance)?|feed|CCTV|відеоспостереження|камера|моніторинг)/gi,
  audit: /(audit|9 ?:?00 ?(am)?|IT (check|sweep)|аудит|перевірка)/gi,
  letter: /(letter|envelope|attorney|legal notice|лист|конверт|адвокат)/gi,
  remote: /(remote|stage-?light|dimmer|lighting preset|пульт|світло|освітлення)/gi
};

/**
 * Motif Density Metrics - Check for Chekhov's gun violations
 * Max 3 appearances per motif for ~2k words
 * Min 250 words distance between appearances
 *
 * @param {string} text - Full story text
 * @param {number} targetWords - Expected word count (default 2000)
 * @returns {Object} { passed: boolean, violations: string[], details: Object }
 */
export function motifDensityMetrics(text, targetWords = 2000) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const violations = [];
  const details = {};

  // Calculate max allowed based on word count (3 per 2k words)
  const scaleFactor = wordCount / targetWords;
  const maxAllowedPerMotif = Math.ceil(3 * scaleFactor);

  for (const [motifName, pattern] of Object.entries(MOTIF_GROUPS)) {
    const matches = [];
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        text: match[0],
        wordPosition: Math.floor(match.index / 5)  // Rough word position (avg 5 chars/word)
      });
    }

    if (matches.length > 0) {
      details[motifName] = {
        count: matches.length,
        positions: matches.map(m => m.index),
        examples: matches.map(m => m.text),
        wordPositions: matches.map(m => m.wordPosition)
      };

      // Check ceiling (max 3 for ~2k words)
      if (matches.length > maxAllowedPerMotif) {
        violations.push(
          `${motifName}: ${matches.length} appearances (max ${maxAllowedPerMotif} for ${wordCount}w story)`
        );
      }

      // Check minimum distance (250 words ≈ 1250 chars)
      for (let i = 1; i < matches.length; i++) {
        const charDistance = matches[i].index - matches[i - 1].index;
        const wordDistance = matches[i].wordPosition - matches[i - 1].wordPosition;

        if (wordDistance < 250) {
          violations.push(
            `${motifName}: appearances ${i} and ${i + 1} too close (${wordDistance}w apart, need ≥250w)`
          );
        }
      }

      // Check role distribution (should be intro → pivot → consequence)
      if (matches.length === 3) {
        const storyThirds = wordCount / 3;
        const positions = matches.map(m => m.wordPosition);

        // Ideal: first in 1st third, second in 2nd third, third in 3rd third
        const expectedPositions = [storyThirds * 0.5, storyThirds * 1.5, storyThirds * 2.5];
        const deviations = positions.map((pos, idx) => Math.abs(pos - expectedPositions[idx]));

        // If any appearance is more than 500 words off from ideal, flag it
        const badDistribution = deviations.some(dev => dev > 500);
        if (badDistribution) {
          details[motifName].roleWarning =
            'Motif distribution may not follow intro→pivot→consequence pattern';
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    details,
    wordCount,
    maxAllowedPerMotif
  };
}

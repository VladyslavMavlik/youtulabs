/**
 * Sonnet Revision Strict - hotfix for extreme repetition
 * No dependencies on patch system
 */

/**
 * Soft deduplication - removes near-duplicate lines
 */
export function softDedupe(markdown) {
  const lines = markdown.split('\n');
  const seen = new Set();

  return lines.filter((line, i) => {
    const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
    const key = normalized.slice(0, 120); // cheap key for similarity check

    if (!normalized) return true; // Keep empty lines
    if (seen.has(key)) return false; // Remove near-duplicates

    seen.add(key);
    return true;
  }).join('\n');
}

/**
 * Build Sonnet revision prompt
 */
export function buildSonnetRevisionPrompt({ chapters, repeatList, languagePack, mode }) {
  const maxRate = process.env.REPETITION_MAX_BIGRAMS || '3.2';

  const systemPrompt = `You rewrite chapters surgically. Output ONLY between <<<CHAPTERS>>> ... <<<END_CHAPTERS>>>.
No analysis, no notes, no prefaces. Keep plot/facts. Length change ≤2%. Keep chapter hooks.

Producing analysis is failure; if uncertain return input verbatim.`;

  const goal = (mode === 'extreme')
    ? `Reduce extreme repetition to ≤ ${maxRate} bigrams/1000.
       Rephrase high-frequency n-grams, merge near-duplicates, vary paragraph openings.
       **Vary paragraph openings; avoid repeated time-stamps as paragraph starters**.`
    : `Reduce repetition to genre norm; respect motif budget; slightly compress redundant exposition.
       Keep dialogue ratio stable.`;

  const topBigrams = (repeatList || []).slice(0, 15)
    .map(b => `"${b.bigram || b}" (${b.count || '?'}x)`)
    .join(', ');

  const userPrompt = `LANGUAGE_RULES:
${languagePack.rules || languagePack.minRules || ''}

REPEAT_LIST (reduce these):
${topBigrams || 'No data'}

GOAL:
${goal}

<<<CHAPTERS>>>
${chapters}
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

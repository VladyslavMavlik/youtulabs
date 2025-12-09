/**
 * Extreme Repetition Patch
 * For cases where repetition is 10x+ above genre threshold
 * Aggressive rewriting to eliminate high-frequency n-grams
 */

export function buildExtremeRepetitionPatch({
  chaptersMarkdown,
  languagePack,
  repetitionData = [],
  targetRate = 3.2,
  currentRate = 40
}) {
  // Top overused bigrams
  const topBigrams = repetitionData.slice(0, 15).map(b => `"${b.bigram}" (${b.count}x)`).join(', ');

  // Genre-specific banned phrases
  const bannedPhrases = {
    romance: [
      'my heart skipped a beat',
      'it felt like forever',
      'I didn\'t realize I was holding my breath',
      'time seemed to stand still',
      'butterflies in my stomach',
      'lost in his/her eyes',
      'our eyes met',
      'sparks flew',
      'chemistry between us',
      'couldn\'t deny the attraction'
    ],
    thriller: [
      'adrenaline pumping',
      'heart racing',
      'time was running out',
      'no time to lose',
      'had to think fast',
      'every second counted'
    ],
    mystery: [
      'something didn\'t add up',
      'pieces of the puzzle',
      'gut feeling',
      'couldn\'t shake the feeling'
    ],
    horror: [
      'blood ran cold',
      'sent shivers down',
      'hair stood on end',
      'couldn\'t believe my eyes'
    ]
  };

  const systemPrompt = `You are a surgical text rewriter specializing in eliminating extreme repetition.
Output ONLY the revised chapters. No preface, no analysis, no meta-commentary.

CRITICAL: Producing analysis or meta-text is a TASK FAILURE. If you cannot apply the patch, return the input chapters verbatim.`;

  const userPrompt = `TASK: Eliminate extreme repetition (current: ${currentRate.toFixed(1)}/1000, target: ≤${targetRate}/1000)

LANGUAGE RULES:
${languagePack.rules}

CRITICAL ISSUES:
Current repetition rate is ${(currentRate / targetRate).toFixed(0)}x above genre norm.

TOP OVERUSED BIGRAMS (must reduce):
${topBigrams}

REWRITING STRATEGY:
1. **Vary sentence openings**: If 5+ sentences start with same word/phrase, rewrite 3-4 of them
2. **Merge near-duplicate sentences**: Combine sentences that convey same information
3. **Rephrase high-frequency patterns**: Replace repeated n-grams with fresh equivalents
4. **Vary paragraph structure**: Mix short/long sentences; vary rhythm
5. **Use pronouns/synonyms**: Reduce noun repetition

CONSTRAINTS:
- Keep ALL plot points, character names, and story events unchanged
- Preserve chapter-end hooks
- Maintain total length within ±5%
- Keep tone and voice consistent
- DO NOT remove dialogue

FORBIDDEN (cliché phrases to eliminate):
- Overused emotional phrases
- Repeated transition words at sentence starts
- Redundant descriptors

OUTPUT FORMAT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[All chapters with extreme repetition eliminated]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>

BEGIN REWRITING NOW:

${chaptersMarkdown}`;

  return { systemPrompt, userPrompt };
}

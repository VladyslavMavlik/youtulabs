/**
 * Haiku Patch Strict - Surgical text fixes ONLY
 * NO meta-commentary, NO analysis, NO questions
 */
export function buildHaikuPatchStrictPrompt({
  chaptersMarkdown,
  languagePack,
  repetitionData = null,
  missingHooks = [],
  rules = {}
}) {
  const repetitionNote = repetitionData && repetitionData.length > 0
    ? `\nREPEAT_LIST (avoid these): ${JSON.stringify(repetitionData.slice(0, 10))}`
    : '';

  const hooksNote = missingHooks.length > 0
    ? `\nMISSING_HOOKS in chapters: ${missingHooks.join(', ')}`
    : '';

  const systemPrompt = `You are a surgical text rewriter.

CRITICAL RULES:
- Output ONLY the chapters block - NO analysis, NO preface, NO notes, NO questions
- If there is nothing to change, return the input verbatim
- Never print any text before the first chapter heading
- Producing analysis or meta-text is a TASK FAILURE - the output will be discarded
- Start immediately with the opening marker`;

  const userPrompt = `LANGUAGE_RULES:
${languagePack.rules}${repetitionNote}${hooksNote}

REWRITE_RULES:
${rules.fixRepetition ? '- Remove redundant n-gram repetitions (keep facts/names intact)' : ''}
${rules.enforceHooks ? '- Ensure each chapter ends with a soft hook (question/risk/choice) if missing' : ''}
${rules.normalizePunctuation ? '- Normalize punctuation per LANGUAGE_RULES' : ''}
- Keep tone/voice; adjust only minimal spans
- Do NOT add commentary, explanations, or notes

<<<INPUT_CHAPTERS>>>
⟪INPUT_CHAPTERS⟫
${chaptersMarkdown}
⟪/INPUT_CHAPTERS⟫
<<<END_INPUT_CHAPTERS>>>

OUTPUT FORMAT (start immediately, no preamble):

<<<CHAPTERS>>>
⟪CHAPTERS⟫
# Chapter 1: [Title]
[Chapter text...]

# Chapter 2: [Title]
[Chapter text...]

[...all remaining chapters...]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

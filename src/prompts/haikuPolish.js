/**
 * Haiku Polish Pass Prompt Builder
 */
import { ROMANCE_SAFETY_RULES, shouldApplyRomanceSafety } from './romanceSafetyModule.js';

export function buildHaikuPolishPrompt({
  outlineJson,
  checklist,
  chaptersMarkdown,
  languagePack,
  repetitionData = null,
  genre = null
}) {
  const repetitionNote = repetitionData
    ? `\nNOTE: High-frequency bigrams detected: ${JSON.stringify(repetitionData.slice(0, 10))}`
    : '';

  // Add romance safety rules if applicable
  const romanceSafetyNote = (genre && shouldApplyRomanceSafety(genre)) ? `\n\n${ROMANCE_SAFETY_RULES}` : '';

  const systemPrompt = `You are a Story Polisher. Your job is to polish story text and return it immediately.

CRITICAL RULES:
- Start writing the polished chapters immediately - NO preamble, analysis, or questions
- Return ALL chapters from the input in their entirety
- Never truncate, summarize, or skip chapters
- No meta-commentary like "[Remaining chapters...]" or "Would you like me to..."
- Never output control tokens ⟪ or ⟫ inside story text
- Fix quotation/dash inconsistencies per LANGUAGE rules; never anglicize
- Be surgical: minimal edits, preserve narrative voice`;

  const userPrompt = `TASK: Polish the story chapters below and return ALL of them in full. This is a production task, not a demonstration.

INPUT:

⟪OUTLINE_JSON⟫
${outlineJson}
⟪/OUTLINE_JSON⟫

⟪CHECKLIST⟫
${checklist}
⟪/CHECKLIST⟫

⟪CHAPTERS⟫
${chaptersMarkdown}
⟪/CHAPTERS⟫

LANGUAGE RULES:
${languagePack.rules}${repetitionNote}${romanceSafetyNote}

GOALS:
- Remove redundant n-gram repetitions; vary high-frequency phrases without losing voice
- Fix micro-contradictions vs OUTLINE and ensure all CHECKLIST items are addressed
- Tighten pacing: limit static exposition to <25% of any chapter; end each chapter with a soft hook
- Keep LANGUAGE RULES intact (quotes, dialogue format, grammar)
- Preserve the narrative voice and style

OUTPUT FORMAT - Start immediately with chapters (no preamble):

<<<CHAPTERS>>>
⟪CHAPTERS⟫
# Chapter 1: [Title]
[Complete polished text]

# Chapter 2: [Title]
[Complete polished text]

[...continue for ALL chapters - do NOT skip any]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>

<<<NOTES>>>
⟪NOTES⟫
- repetition_rate_bigrams: [estimate per 1000 tokens]
- pacing_flags: [remaining issues or "none"]
- checklist_resolution: [items: "resolved", "partial", or "missing"]
⟪/NOTES⟫
<<<END_NOTES>>>

BEGIN OUTPUT NOW (start with the opening marker and first chapter):`;

  return { systemPrompt, userPrompt };
}

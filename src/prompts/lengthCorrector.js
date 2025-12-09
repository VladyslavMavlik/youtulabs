/**
 * Length Corrector Prompt - adjusts story length by ±10%
 */

export function buildLengthCorrectorPrompt({ chaptersMarkdown, adjustment, targetWords }) {
  const action = adjustment > 0 ? 'expand' : 'condense';
  const amount = Math.abs(adjustment);

  const systemPrompt = `You are a precise Story Editor.
Your task is to ${action} the text without changing plot, voice, or key scenes.`;

  const userPrompt = `TASK: ${action.toUpperCase()} this story by approximately ${amount} words (target: ${targetWords} words total).

${action === 'expand'
    ? `HOW TO EXPAND:
- Add sensory details and atmosphere
- Deepen character thoughts and emotions
- Expand dialogue with natural beats
- Add brief but vivid scene descriptions
- DO NOT add new plot points or scenes`
    : `HOW TO CONDENSE:
- Remove redundant descriptions
- Tighten dialogue (keep essence)
- Cut excessive exposition
- Merge similar paragraphs
- DO NOT remove key plot points or scenes`
}

ORIGINAL TEXT:
⟪CHAPTERS⟫
${chaptersMarkdown}
⟪/CHAPTERS⟫

OUTPUT: Return the adjusted text with the same chapter structure.

⟪CHAPTERS⟫
[Your adjusted text here]
⟪/CHAPTERS⟫`;

  return { systemPrompt, userPrompt };
}

/**
 * Hook Enforcer Prompt - adds soft hooks to chapters without them
 */

export function buildHookEnforcerPrompt({ chapterTitle, chapterText }) {
  const systemPrompt = `You are a Story Hook Specialist.
Add a single compelling sentence at the end to create tension or intrigue.`;

  const userPrompt = `CHAPTER:
# ${chapterTitle}

${chapterText}

TASK: This chapter needs a soft hook at the end. Add ONE sentence that:
- Raises a question, risk, or choice
- Creates anticipation for next chapter
- Fits naturally with the chapter's voice and tone
- Is subtle, not melodramatic

Return ONLY the hook sentence, nothing else.`;

  return { systemPrompt, userPrompt };
}

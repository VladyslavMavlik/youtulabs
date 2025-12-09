/**
 * Specialized Patch Prompts for Quiet Noir / Mature Romance
 * Targets: motif reduction, mid-compression, character anchors, visible price
 */

/**
 * Motif & Mid-Compression Patch
 * Reduces overused motifs and compresses middle chapters
 */
export function buildMotifCompressionPrompt({
  chaptersMarkdown,
  violations,  // { motif, count, limit, excess }[]
  compressionPercent = 6,
  languagePack
}) {
  const motifList = violations.map(v => `"${v.motif}" (appears ${v.count} times, limit: ${v.limit})`).join(', ');

  const systemPrompt = `You are a surgical text editor for mature psychological fiction.
Output ONLY the revised chapters. No analysis, no meta-commentary.`;

  const userPrompt = `TASK: Reduce motif frequency and compress middle chapters.

LANGUAGE RULES:
${languagePack.rules}

MOTIF VIOLATIONS (reduce these):
${motifList}

INSTRUCTIONS:
1. In middle chapters (2-3), replace excess motif mentions with FRESH sensory cues of same tone
   - Keep first and last mentions of each motif
   - Replace middle excess with varied imagery (visual/tactile/auditory)
   - Examples: "timestamp" → "his clenched jaw", "elevator bell" → "fluorescent flicker"

2. Compress chapters 2-3 by ${compressionPercent}%:
   - Remove/merge technical repetitions (logs/times/system messages)
   - Keep ALL plot points and character beats
   - Preserve chapter-end hooks
   - Maintain tone and voice

3. DO NOT change chapter 1 or final chapter
4. Preserve dialogue and character interactions

OUTPUT (exact format):

<<<CHAPTERS>>>
⟪CHAPTERS⟫
# Chapter 1: [Title]
[unchanged]

# Chapter 2: [Title]
[compressed, motifs reduced]

# Chapter 3: [Title]
[compressed, motifs reduced]

[remaining chapters with reduced motifs only]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * Character Anchor Injection Patch
 * Adds memory shards and unflattering gestures for depth
 */
export function buildCharacterAnchorPrompt({
  chaptersMarkdown,
  partnerName = 'the partner',
  antagonistName = 'the other character',
  languagePack
}) {
  const systemPrompt = `You are a character depth specialist for mature fiction.
Output ONLY the revised chapters. No preamble.`;

  const userPrompt = `TASK: Add character anchors (memory/gesture) for psychological depth.

LANGUAGE RULES:
${languagePack.rules}

ANCHORS TO ADD:

1. ${partnerName} ANCHOR (Chapter 4, before emotional turn):
   - Insert ONE 3-4 line "warm memory shard"
   - NOT nostalgic sentimentality
   - Specific sensory detail that reveals vulnerability
   - Example tone: "She remembered the way he'd pause mid-sentence when uncertain, a half-breath of honesty she'd once found endearing."

2. ${antagonistName} UNFLATTERING GESTURE (in dialogue scene):
   - Add ONE micro-gesture that reveals control/insecurity
   - Make it unsympathetic but realistic
   - Add ONE concrete fact without euphemisms
   - Example tone: "His fingers drummed the table edge, counting. 'I checked your location seventeen times today.'"

RULES:
- Subtle, not dramatic
- No new plot points
- Keep chapter structure intact
- Maintain quiet noir tone

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[all chapters with anchors inserted]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * Visible Price Enforcer
 * Adds concrete consequence to finale
 */
export function buildVisiblePricePrompt({
  chaptersMarkdown,
  languagePack,
  priceType = 'therapy' // therapy | move | work_conflict | legal
}) {
  const priceExamples = {
    therapy: 'a weekly therapy appointment he\'d finally scheduled',
    move: 'the lease he\'d signed for a studio across town',
    work_conflict: 'the transfer request sitting on his supervisor\'s desk',
    legal: 'the restraining order paperwork in his briefcase'
  };

  const systemPrompt = `You are a finale specialist for mature fiction.
Output ONLY the chapters. No commentary.`;

  const userPrompt = `TASK: Add concrete visible consequence to final chapter.

LANGUAGE RULES:
${languagePack.rules}

VISIBLE PRICE TO ADD (final chapter only):
Append ONE sentence showing concrete consequence:
- Suggested: ${priceExamples[priceType] || priceExamples.therapy}
- Non-dramatic, matter-of-fact tone
- NO new characters or subplots
- Shows price without melodrama

Example integration:
"He closed the laptop, the truth finally public. ${priceExamples[priceType] || 'The therapy intake form waited on his desk, a small acknowledgment of what he\'d lost along the way.'}

RULES:
- Final chapter only
- One sentence
- Concrete action/object
- Adult acceptance tone
- No preachy conclusions

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[all chapters, with price added to finale]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * Dialogue Ratio Booster
 * Adds short exchanges to increase dialogue percentage
 */
export function buildDialogueBoostPrompt({
  chaptersMarkdown,
  targetChapters = [2, 3, 4, 5, 6],  // chapters needing dialogue
  languagePack
}) {
  const systemPrompt = `You are a dialogue specialist for mature fiction.
Output ONLY the chapters.`;

  const userPrompt = `TASK: Increase dialogue ratio in middle chapters to 28-40%.

LANGUAGE RULES:
${languagePack.rules}

TARGET CHAPTERS: ${targetChapters.join(', ')}

INSTRUCTIONS:
Add 2 SHORT dialogue exchanges per target chapter:
- Each exchange: 2-4 lines maximum
- Pauses/silences included (show tension through what's NOT said)
- No info-dumping or exposition
- Reveals character through subtext
- Fits naturally into existing scenes

Example style:
"Are you checking my phone?"
A pause. "Should I be?"

RULES:
- Minimal additions (2 exchanges per chapter)
- Quiet, tense tone
- No new plot points
- Preserve all existing content

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with dialogue added]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

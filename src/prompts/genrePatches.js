/**
 * Universal Genre-Specific Micro-Patches
 * Minimal, surgical improvements targeted by genre and failed metrics
 */

/**
 * PACING_CONDENSE - Compress chapters by removing repetitions
 * For: thriller, scifi_adventure, comedy
 */
export function buildPacingCondensePatch({
  chaptersMarkdown,
  targetCompression = 8,  // percent
  languagePack
}) {
  const systemPrompt = `You are a pacing specialist for fast-paced fiction.
Output ONLY the revised chapters. No analysis.`;

  const userPrompt = `TASK: Compress pacing by ${targetCompression}% without losing plot.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Merge redundant exposition/description paragraphs
2. Remove atmospheric padding that slows tempo
3. Keep ALL plot points, reveals, and character beats
4. Preserve chapter-end hooks
5. Tighten dialogue (remove filler exchanges)

TARGET: ${targetCompression}% shorter while maintaining story completeness

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[all chapters, compressed]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * REVEAL_TIGHTEN - Sharpen reveals and twists
 * For: thriller, mystery
 */
export function buildRevealTightenPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a plot twist specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Tighten reveals for maximum impact.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find revelation moments (clues, twists, betrayals)
2. Add 1-2 sentences BEFORE reveal to heighten tension
3. Make reveal sentence sharp and concrete (no vague language)
4. Add immediate consequence or reaction AFTER reveal
5. No melodrama - let facts land hard

Example BEFORE:
"He realized Anna was involved."

Example AFTER:
"The access log showed her credentials. Three logins at 2 AM—the exact times Helix had been compromised. Anna."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with tightened reveals]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * ANCHOR_INJECT - Add character depth through memory/gesture
 * For: romance, family_drama, noir_drama
 */
export function buildAnchorInjectPatch({
  chaptersMarkdown,
  characterName = 'the key character',
  anchorType = 'memory',  // 'memory' or 'gesture'
  languagePack
}) {
  const anchorGuidance = anchorType === 'memory'
    ? `3-4 line memory shard showing vulnerability or connection`
    : `1-2 unflattering micro-gestures revealing inner state`;

  const systemPrompt = `You are a character depth specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Add character anchor for ${characterName}.

LANGUAGE RULES:
${languagePack.rules}

ANCHOR TO ADD:
${anchorGuidance}

PLACEMENT:
- In middle chapters (3-5)
- Before key emotional turn or confrontation
- NOT in exposition - weave into active scene

TONE:
- Specific sensory detail
- No sentimentality or melodrama
- Adult restraint
- Reveals psychology through concrete detail

Example memory anchor:
"She remembered the way he'd pause mid-sentence when uncertain, a half-breath of honesty she'd once found endearing."

Example gesture anchor:
"His fingers drummed the table edge, counting. Always counting."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with anchor inserted]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * CHEMISTRY_AMPLIFY - Boost romantic chemistry
 * For: romance
 */
export function buildChemistryAmplifyPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a romantic tension specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Amplify chemistry in 2-3 key scenes.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find 2-3 scenes with both romantic leads present
2. Add ONE physical proximity detail (not sexual - just close)
3. Add ONE line of charged dialogue or charged silence
4. Add ONE sensory detail (scent, warmth, voice tone)
5. Respect policy: no explicit content

Example enhancement:
BEFORE: "They talked about the case."
AFTER: "They talked about the case, her shoulder nearly touching his. He noticed the faint scent of coffee on her breath when she leaned close to see the screen."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with chemistry amplified]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * VISIBLE_PRICE - Add concrete consequence to finale
 * For: romance (quiet noir), family_drama
 */
export function buildVisiblePricePatch({
  chaptersMarkdown,
  priceType = 'therapy',  // therapy | move | work_conflict | legal | family_distance
  languagePack
}) {
  const priceExamples = {
    therapy: 'the therapy intake form on his desk',
    move: 'the lease he\'d signed for a studio across town',
    work_conflict: 'the transfer request he\'d finally submitted',
    legal: 'the restraining order paperwork',
    family_distance: 'his daughter\'s texts, still unanswered'
  };

  const systemPrompt = `You are a finale specialist for mature fiction.
Output ONLY the chapters.`;

  const userPrompt = `TASK: Add visible price to final chapter.

LANGUAGE RULES:
${languagePack.rules}

VISIBLE PRICE:
- Add ONE sentence to finale showing concrete consequence
- Suggested: ${priceExamples[priceType] || priceExamples.therapy}
- Non-dramatic, matter-of-fact tone
- NO new characters or subplots
- Shows adult acceptance of cost

Example integration:
"The truth was finally public. ${priceExamples[priceType] || 'The therapy intake form waited on his desk, a small acknowledgment of what he\'d lost.'}"

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with visible price in finale]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * CLUE_CLARITY - Sharpen mystery clues for fair play
 * For: mystery
 */
export function buildClueClarityPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a mystery structure specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Ensure clues are clear enough for fair play.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Identify 3-5 key clues in the story
2. For each clue, add ONE concrete detail that makes it discoverable
3. Ensure protagonist encounters each clue directly (not hearsay)
4. Add brief detective reasoning after major clues (1 line max)
5. Red herrings should also be concrete (logical in hindsight)

Example:
BEFORE: "Something seemed off about the scene."
AFTER: "The coffee was still warm. Either the victim had made it minutes before dying, or someone else had been here after."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with clarified clues]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * DREAD_INTENSIFIER - Amplify horror atmosphere
 * For: horror
 */
export function buildDreadIntensifierPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a horror atmosphere specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Intensify dread in 3-4 key moments.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find 3-4 unease/threat moments
2. For each, add ONE visceral sensory detail (sound/smell/texture)
3. Add ONE detail showing normalcy violation (something wrong/off)
4. Slow pacing BEFORE horror moment (1-2 mundane details, then shock)
5. Respect policy: no excessive gore, but visceral allowed

Example:
BEFORE: "She heard a noise upstairs."
AFTER: "She heard a noise upstairs—not a creak, but a wet sliding sound, like flesh dragged across tile. The house had been empty for years."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with intensified dread]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * ATMOSPHERE_DEEPEN - Enhance atmospheric tone
 * For: horror, noir_drama
 */
export function buildAtmosphereDeepenPatch({
  chaptersMarkdown,
  atmosphereType = 'noir',  // 'noir' or 'dread'
  languagePack
}) {
  const atmosphereGuidance = atmosphereType === 'noir'
    ? `urban decay, rain, neon, moral weight, cynicism`
    : `wrongness, isolation, creeping unease, violation`;

  const systemPrompt = `You are an atmosphere specialist for ${atmosphereType} fiction.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Deepen ${atmosphereType} atmosphere in 3-5 moments.

LANGUAGE RULES:
${languagePack.rules}

ATMOSPHERE ELEMENTS:
${atmosphereGuidance}

INSTRUCTIONS:
1. Find 3-5 scene-setting moments
2. Add ONE sensory atmosphere detail per moment
3. Tie atmosphere to character psychology (environment reflects inner state)
4. Use weather, lighting, urban/isolated setting details
5. Keep prose tight - one sentence maximum per detail

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with deepened atmosphere]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * SETPIECE_BOOST - Enhance action/magic setpieces
 * For: scifi_adventure, fantasy
 */
export function buildSetpieceBoostPatch({
  chaptersMarkdown,
  setpieceType = 'action',  // 'action' or 'magic'
  languagePack
}) {
  const systemPrompt = `You are a ${setpieceType} setpiece specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Boost 1-2 key ${setpieceType} setpieces.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find 1-2 climactic ${setpieceType} scenes
2. Add clear spatial geography (reader can visualize arena/location)
3. Add rising stakes (what happens if protagonist fails THIS step)
4. Add 1-2 obstacles/complications mid-sequence
5. Show resourcefulness/skill growth
6. Keep pacing kinetic (short paragraphs, active verbs)

${setpieceType === 'magic' ? `
MAGIC RULES:
- Show cost/limitation of magic use
- Make magic visual and specific (not vague energy)
- Tie magic to character emotion or choice
` : `
ACTION RULES:
- Grounded physics (characters take hits, get tired)
- Environment as weapon/obstacle
- Clear win/loss conditions
`}

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with boosted setpieces]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * DIALOGUE_DEEPEN - Enhance character through dialogue
 * For: family_drama
 */
export function buildDialogueDeepenPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a dialogue specialist for character-driven drama.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Deepen character revelation through dialogue.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find 2-3 key dialogue scenes (family confrontation, confession, etc.)
2. Add subtext - characters say one thing, mean another
3. Add pauses/beats showing discomfort or hesitation
4. Add ONE line per scene that reveals core wound or value conflict
5. Show generational difference through speech patterns (if applicable)

Example:
BEFORE:
"I'm sorry I wasn't there."
"It's fine."

AFTER:
"I'm sorry I wasn't there."
A pause. "You said that at mom's funeral too." She stared at her coffee. "And at my graduation."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with deepened dialogue]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * WORLDBUILD_INTEGRATE - Weave worldbuilding into action
 * For: sci_fi, fantasy
 */
export function buildWorldbuildIntegratePatch({
  chaptersMarkdown,
  worldType = 'scifi',  // 'scifi' or 'fantasy'
  languagePack
}) {
  const systemPrompt = `You are a worldbuilding integration specialist for ${worldType}.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Integrate worldbuilding through action, not exposition.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Find 2-3 moments with worldbuilding exposition
2. Convert exposition to action: character uses tech/magic to solve problem
3. Show social/cultural rules through character conflict (not explanation)
4. Add sensory detail that implies world difference (smells, sounds, visuals)
5. Cut any "As you know, Bob" dialogue

Example:
BEFORE: "The neural implants allowed instant communication across the colony."
AFTER: "She tapped her temple twice. His response bloomed behind her eyes, text overlaid on her vision. 'Meet at the hub in ten.'"

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with integrated worldbuilding]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

/**
 * CALLBACK_AMPLIFY - Enhance comedy callbacks and payoffs
 * For: comedy
 */
export function buildCallbackAmplifyPatch({
  chaptersMarkdown,
  languagePack
}) {
  const systemPrompt = `You are a comedy structure specialist.
Output ONLY the revised chapters.`;

  const userPrompt = `TASK: Amplify setup/callback structure for payoffs.

LANGUAGE RULES:
${languagePack.rules}

INSTRUCTIONS:
1. Identify 2-3 recurring gags or setups
2. Ensure each appears 3 times (rule of threes):
   - Setup (introduce)
   - Reminder (callback)
   - Payoff (twist or escalation)
3. Make callbacks escalate in absurdity
4. Add specificity to make callbacks memorable
5. Final payoff should subvert expectation

Example:
Setup: "His car alarm was hyper-sensitive. It went off when a leaf touched it."
Callback: "The car alarm went off during the job interview in the parking lot."
Payoff: "The car alarm went off at his own wedding. He'd forgotten to disable it. It played La Cucaracha."

OUTPUT:

<<<CHAPTERS>>>
⟪CHAPTERS⟫
[chapters with amplified callbacks]
⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>`;

  return { systemPrompt, userPrompt };
}

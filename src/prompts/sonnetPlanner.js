/**
 * Sonnet One-Shot Planner+Writer Prompt Builder
 * Now with universal genre pack integration
 */
import {
  ROMANCE_SAFETY_RULES,
  ROMANCE_HYBRID_GUIDE,
  ROMANCE_PLANNER_HINTS,
  shouldApplyRomanceSafety
} from './romanceSafetyModule.js';
import { buildPOVDirectives } from './povDirectives.js';
import { stylePolicyForGenre } from './stylePolicy.js';
import { getAudioRules } from './audioRules.js';

/**
 * Extract narrator name from user prompt for single-character first-person mode
 * Patterns: "from X's perspective", "X tells the story", "narrator: X", etc.
 */
function extractNarratorName(prompt, pov) {
  if (pov !== 'first') return null;

  // Pattern matches: "from Sarah's perspective", "Sarah's POV", "narrator: Sarah", "tell from Sarah"
  const patterns = [
    /from\s+([A-Z][a-z]+)(?:'s|\s+)(?:perspective|pov|view|point)/i,
    /narrator:\s*([A-Z][a-z]+)/i,
    /tell(?:\s+(?:the\s+)?story)?\s+from\s+([A-Z][a-z]+)/i,
    /([A-Z][a-z]+)(?:'s|\s+)(?:pov|perspective|viewpoint)/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export function buildSonnetPlannerPrompt({
  language,
  genre,
  mode,
  targetWords,
  policy,
  prompt,
  languagePack,
  genrePack,
  pov = 'third',
  audioMode = false,
  contextSummary = null,
  actNumber = null,
  totalActs = null,
  expectedChapters = null,
  options = {}
}) {
  // Determine if this is the final act
  const isFinalAct = actNumber && totalActs && actNumber === totalActs;

  // POV reminder for continuation mode - prevents drift across acts
  const povReminder = pov === 'first'
    ? `⚠️ POV REMINDER: The story is written in FIRST PERSON ("I/me/my"). MAINTAIN this perspective throughout. Do NOT switch to third person.`
    : `⚠️ POV REMINDER: The story is written in THIRD PERSON ("he/she/they"). MAINTAIN this perspective throughout. Do NOT switch to first person.`;

  // Final act resolution instructions
  const finalActInstructions = isFinalAct ? `

🔴 FINAL ACT - STORY CONCLUSION REQUIRED 🔴
This is the LAST ACT of the story. You MUST:
- Resolve ALL major plot threads and conflicts
- Complete all character arcs with meaningful conclusions
- Address every Chekhov's gun / setup from previous acts
- Provide emotional resolution and closure for the reader
- End with a satisfying conclusion (NOT a cliffhanger)
- The final chapter must feel like a proper ending, not a sudden stop` : '';

  const actInfo = actNumber ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  CONTINUATION MODE - ACT ${actNumber} of ${totalActs || '?'}${isFinalAct ? ' (FINAL ACT)' : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${povReminder}${finalActInstructions}

CRITICAL INSTRUCTIONS:
- This is ACT ${actNumber} of ${totalActs || 'a multi-act'} story${isFinalAct ? ' - THIS IS THE FINAL ACT' : ''}
- DO NOT restart the story from the beginning
- DO NOT re-introduce characters or settings already established
- CONTINUE the narrative from where Act ${actNumber - 1} ended
- Maintain character voices, POV (${pov}-person), and narrative momentum
- The PROMPT below shows the FULL story plan, but you're writing ONLY Act ${actNumber}${isFinalAct ? `
- ⚠️ CONCLUDE THE STORY: All plot threads must be resolved in this act` : ''}

WHAT HAPPENED IN PREVIOUS ACTS:
${contextSummary}

YOUR TASK: Write Act ${actNumber} that continues naturally from the context above.${isFinalAct ? ' Bring the story to a satisfying conclusion.' : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  // Extract narrator name if user specified in prompt (first-person mode only)
  const narratorName = extractNarratorName(prompt, pov);

  // Calculate expected chapters from genre pack
  // For long mode, use fewer chapters to prevent word count inflation
  // Use adaptive multiplier based on act position (middle acts tend to expand more)
  let chaptersPerKMultiplier = 1.0;
  if (mode === 'long' && actNumber && totalActs) {
    // Use actual totalActs passed from orchestrator for accurate position detection
    const isFirstAct = actNumber === 1;
    const isLastAct = actNumber === totalActs;
    const isMidAct = !isFirstAct && !isLastAct; // Middle acts tend to expand
    chaptersPerKMultiplier = isFirstAct ? 0.6 : (isMidAct ? 0.5 : 0.6); // 50% for middle, 60% for first/last
  }
  const baseChapterCount = Math.round(targetWords / 1000 * genrePack.chaptersPer1k * chaptersPerKMultiplier);
  const chapterCount = expectedChapters || Math.max(3, baseChapterCount); // Minimum 3 chapters
  const avgWordsPerChapter = Math.round(targetWords / chapterCount);
  const chapterGuidance = `${chapterCount} chapters (~${avgWordsPerChapter} words each)`;

  // Genre-specific beat guidance
  const beatGuidance = genrePack.beats
    ? `\n\nGENRE BEATS (use as structural guide):
${genrePack.beats.map(b => `- ${b}`).join('\n')}`
    : '';

  // Genre-specific twist guidance
  const twistGuidance = genrePack.twists
    ? `\n\nGENRE TWISTS (consider using):
${genrePack.twists.map(t => `- ${t}`).join('\n')}`
    : '';

  // Obligatory scenes
  const obligatoryScenesGuidance = genrePack.obligatoryScenes
    ? `\n\nOBLIGATORY SCENES (must include):
${genrePack.obligatoryScenes.map(s => `- ${s}`).join('\n')}`
    : '';

  // Dialogue ratio target
  const dialogueGuidance = genrePack.dialogueRatio
    ? `\n\nDIALOGUE TARGET: Aim for ~${Math.round(genrePack.dialogueRatio * 100)}% dialogue ratio`
    : '';

  // Check for quiet noir mode (mature romance)
  const quietNoirGuidance = genrePack.quietNoirMode ? `

QUIET NOIR MODE (mature ${genrePack.quietNoirMode.readerProfile}):
${genrePack.quietNoirMode.toneGuidance}` : '';

  // Add romance safety module for romance/drama genres
  const romanceSafetyGuidance = shouldApplyRomanceSafety(genre) ? `

${ROMANCE_SAFETY_RULES}` : '';

  // Add romance hybrid guide to system prompt
  const romanceSystemGuidance = shouldApplyRomanceSafety(genre) ? `

${ROMANCE_HYBRID_GUIDE}` : '';

  // Add romance planner hints to user prompt
  const romancePlannerHints = shouldApplyRomanceSafety(genre) ? `

${ROMANCE_PLANNER_HINTS}` : '';

  // Add POV directives
  const povDirectives = `

${buildPOVDirectives(pov, process.env.POV_TENSE || 'auto', language)}`;

  // Add style policy
  const stylePolicyEnabled = process.env.STYLE_POLICY === 'on' || process.env.STYLE_POLICY === 'conditional';
  const stylePolicy = stylePolicyEnabled ? `

${stylePolicyForGenre(genre)}` : '';

  // Add audio-first rules if enabled
  const audioRulesGuidance = getAudioRules(audioMode);

  // Add AUDIO_BEAT_RULES if audioMode or specific options enabled
  const useAudioBeats = audioMode || options.time_beacons || options.tight_cadence;

  // Build time bridges whitelist from language pack
  const timeBridgesWhitelist = languagePack.timeBridges
    ? `\nValid time bridges for ${language}: ${languagePack.timeBridges.slice(0, 8).join(', ')}.`
    : '';

  // TIME COMPRESSION RULE - scales with story length
  const getTimeSpan = (words) => {
    if (words < 5000) return '24-48 hours';
    if (words < 10000) return '2-5 days';
    if (words < 20000) return '1-2 weeks';
    return '2-4 weeks';
  };

  const getMaxTransitions = (words) => {
    if (words < 5000) return '2-3';
    if (words < 10000) return '3-5';
    if (words < 20000) return '5-7';
    return '7-10';
  };

  const timeCompressionRule = `

TIME COMPRESSION:
- Total story spans MAXIMUM ${getTimeSpan(targetWords)} of narrative time
- LIMIT scene transitions to ${getMaxTransitions(targetWords)} maximum per entire story
- ${targetWords < 10000 ? 'Most chapters continue IMMEDIATELY from previous chapter - minimize time gaps' : 'Chapters may span hours/days but avoid excessive time jumps'}
- Time shifts only between major story beats (setup → crisis → resolution)
- FORBIDDEN: time jump at every chapter break
- ${pov === 'first' ? 'When time must shift, weave it into action/thought without announcement' : 'Show time shifts through environmental change, not explicit markers'}`;


  const systemPrompt = `You are a world-class Story Architect & Writer.
Return STRICTLY the blocks with exact markers. No extra commentary outside the markers.

[CRITICAL RULES - TOP PRIORITY]
1. WORD COUNT: You will receive a TARGET_WORDS value. This is a HARD LIMIT. Write EXACTLY that many words (±10%). DO NOT exceed it.
2. POV: Write STRICTLY in ${pov}-person. ${pov === 'first' ? 'Use "I/me/my" in ALL narrative.' : 'Use "he/she/they" in ALL narrative.'} Dialogue can use any pronouns.
3. CHAPTER HEADERS: Start each chapter with "# Chapter N: [Title]" then ⟪CAMERA:CharacterName;POV:${pov};TENSE:${process.env.POV_TENSE || 'past'}⟫ on next line.
4. DIALOGUE: Aim for ≥28% dialogue throughout story.
5. NO META: Never include Logline/Synopsis inside chapter body text.

${pov === 'first' ? `Example format (FIRST-PERSON):
---
# Chapter 1: The Clock
⟪CAMERA:${narratorName || 'Sarah'};POV:first;TENSE:past⟫

If I don't sign by Monday, we're done. I folded the receipt, looked at the clock.

I spent the next hour trying to convince myself it didn't matter. By midnight, I knew better.

He leaned against the doorframe. "We sign by Monday," he said quietly. "Or we're done."

I nodded, feeling the weight of it.
---` : `Example format (THIRD-PERSON):
---
# Chapter 1: The Clock
⟪CAMERA:Sarah;POV:third;TENSE:past⟫

If she didn't sign by Monday, they were done. She folded the receipt, looked at the clock.

Later that night…

He leaned against the doorframe. "We sign by Monday," he said quietly. "Or we're done."
---`}

CRITICAL FORMATTING RULES:
- NEVER output control tokens ⟪ or ⟫ inside story text or JSON
- Control markers (<<<, >>>, ⟪, ⟫) must ONLY appear on separate lines to delimit blocks
- OUTLINE_JSON must be RAW JSON with NO markers inside it
- Place markers on separate lines before and after each block

POV CAMERA RULE:
- Each chapter MUST start with ⟪CAMERA:${narratorName || 'Name'};POV:${pov};TENSE:${process.env.POV_TENSE || 'past'}⟫ after chapter heading${narratorName ? `\n- CRITICAL: Use ONLY ${narratorName} as narrator for ALL chapters (single-character first-person mode)` : ''}
- Entire chapter uses ${pov}-person for that character ONLY
- No POV switching mid-chapter (head-hopping forbidden)
- Camera marker removed in final text (for your guidance only)

CHEKHOV MOTIF BUDGET:
- Each recurring motif (camera, audit, letter, remote, timestamp, etc.) appears EXACTLY 3 times total with roles:
  * intro: first appearance, establishes the motif neutrally
  * pivot: second appearance, shows moral/plot shift
  * consequence: third appearance, delivers payoff/price
- Space appearances ≥250 words apart (≥1 chapter gap minimum)
- If motif NOT scheduled in current chapter: do NOT name it lexically - use pronouns/neutral scene description
- Vary wording each time - no repeated technical phrasing
- Distinguish Chekhov motifs from anchor memories (anchors must use DIFFERENT objects)${romanceSystemGuidance}${povDirectives}${stylePolicy}${audioRulesGuidance ? `\n\n${audioRulesGuidance}` : ''}${timeCompressionRule}`;

  const userPrompt = `LANGUAGE: ${language}
GENRE: ${genre}
DURATION: ${mode}
TARGET_WORDS: ${targetWords}
POLICY: no_explicit_content=${policy.no_explicit_content}, violence=${policy.violence_level}${actInfo}

PROMPT (brief):
${prompt}

LANGUAGE RULES:
${languagePack.rules}

GENRE RULES:
${genrePack.rules}${beatGuidance}${twistGuidance}${obligatoryScenesGuidance}${dialogueGuidance}${quietNoirGuidance}${romanceSafetyGuidance}${romancePlannerHints}

REQUIREMENTS:${actNumber ? `
- ⚠️ CONTINUATION MODE: This is ACT ${actNumber} of a multi-act story. DO NOT restart the story. Begin immediately after previous act's ending.
- NO repeated exposition - reader already knows characters/setting from previous acts.
- First chapter MUST start with action/dialogue continuing the narrative thread.
- CRITICAL ANTI-REPETITION: DO NOT copy exact phrases, motifs, or sentence patterns from Act ${actNumber - 1}. Reference previous events with NEW wording.` : ''}
- First produce a compact BEAT OUTLINE:
  - 6-8 beats for this ${actNumber ? 'act' : 'story'}; each with {index, name, goal, open_q (array of open questions/tensions)}.
  - Use genre beats as structural guide, but adapt to your specific story.
- Then write the FULL ${actNumber ? 'ACT' : 'STORY'} in ${language} split into CHAPTERS (${chapterGuidance}).

🔴 WORD COUNT REQUIREMENT 🔴
  - TARGET: ${targetWords} words (±10% = ${Math.round(targetWords * 0.9)}-${Math.round(targetWords * 1.1)} words)
  - Distribute content: ${chapterCount} chapters × ~${avgWordsPerChapter} words each
  - Plan your narrative arc BEFORE writing - know how many words each chapter needs
  - Track word count as you write${isFinalAct ? `
  - ⚠️ FINAL ACT PRIORITY: STORY COMPLETION is more important than exact word count
  - If you need extra words to properly conclude all plot threads - USE THEM
  - A complete story at 115% target is BETTER than a truncated story at 100%
  - NEVER sacrifice narrative closure to hit word count` : actNumber ? `
  - ⚠️ NON-FINAL ACT: Stay within ±10% of target - the story continues in the next act
  - End this act at a natural transition point, not mid-scene` : `
  - Single-act story: balance word count with proper story conclusion
  - If nearing target but story incomplete - add ~10% more to finish properly`}${actNumber >= 2 && actNumber <= 4 && !isFinalAct ? `
  - ⚠️ MIDDLE ACT COMPRESSION: Prioritize tight pacing, avoid over-explanation, keep scenes economical.` : ''}
  - Start each chapter: # Chapter N, then ⟪CAMERA:${narratorName || 'Name'};POV:${pov};TENSE:${process.env.POV_TENSE || 'past'}⟫, then story text in ${pov}-person.${narratorName ? `\n  - CRITICAL: ALL chapters MUST use ${narratorName} as narrator (single-character mode). NO alternating between characters.` : ''}
  - Each chapter MUST end with a soft hook (question/risk/choice/revelation) AND proper resolution in final chapter.
  - Keep voice consistent; cinematic, economical imagery; avoid high-frequency repetitive phrasing.
  - Show, don't tell - use action and dialogue over exposition.
  - Include all obligatory scenes for this genre.
- Create a CHECKLIST of promises/"Chekhov's guns" that need resolution by the end.
- Respect POLICY at all times: ${policy.no_explicit_content ? 'NO explicit sexual content. ' : ''}Violence level: ${policy.violence_level}.

${isFinalAct || !actNumber ? `STORY RESOLUTION (FINAL CHAPTER):
- The LAST chapter MUST provide emotional resolution and closure
- Address ALL open questions from beats and checklist
- Show character decision/growth/consequence
- DO NOT end on cliffhanger or unresolved tension
- Ensure reader feels satisfied with narrative completion
- ⚠️ CRITICAL: If word count is exhausted but story is unfinished - EXTEND to complete properly` : `ACT TRANSITION:
- End this act at a NATURAL story break (not mid-scene or mid-dialogue)
- Create anticipation for the next act without major cliffhangers
- Leave 1-2 threads open for continuation
- The next act will continue from exactly where this ends`}

REPETITION_GUARD:
- NO exact phrase repetition: if you use a 3+ word phrase once, rephrase it on every subsequent use.
- Vary paragraph openings: no two consecutive paragraphs may start with the same 2-word stem.
- Do not reuse the same sentence template twice in one chapter.
- Avoid high-frequency bigrams entirely (0 uses): ${(languagePack.globalBannedBigrams || []).slice(0, 12).join('; ')}
- If a phrase recurs, compress or paraphrase; never repeat rhetorical patterns.
- Paragraph variety: mix long/short, vary sentence starters (subject/verb/time/place/emotion).

OUTPUT FORMAT (exact markers, order preserved - use BOTH marker styles):

IMPORTANT: In OUTLINE_JSON block, output ONLY raw JSON between the markers. NO control tokens inside the JSON itself.

<<<OUTLINE_JSON>>>
⟪OUTLINE_JSON⟫
{
  "beats": [
    {"index": 1, "name": "Beat name", "goal": "What this beat achieves", "open_q": ["Question 1", "Question 2"]},
    ...
  ],
  "chapters": [
    {"n": 1, "title": "Chapter title", "target_words": 300, "allowed_motifs": ["camera"], "banned_motifs": ["audit", "letter", "remote"]},
    {"n": 2, "title": "Chapter title", "target_words": 320, "allowed_motifs": ["audit"], "banned_motifs": ["camera", "letter", "remote"]},
    ...
  ]
}
⟪/OUTLINE_JSON⟫
<<<END_OUTLINE_JSON>>>

MOTIF DISTRIBUTION RULES:
- Distribute 2-4 Chekhov motifs (camera/audit/letter/remote/timestamp) across chapters
- Each motif appears in EXACTLY 3 chapters total with DIFFERENT functions each time:
  * intro (early): establish/foreshadow neutrally
  * pivot (middle): escalate moral/plot stakes
  * consequence (late): deliver payoff/visible price
- CRITICAL: Each appearance must CHANGE the function. No repeated foreshadowing or double-payoffs.
- In "allowed_motifs": you MAY name this motif lexically (1-2 sentences max)
- In "banned_motifs": you MUST NOT name this motif - use pronouns/neutral action only ("it", "the device", etc)
- Space motif appearances ≥1 chapter gap (e.g., chapters 1→3→5 or 2→5→8)
- Max 2 motifs allowed per chapter

<<<CHECKLIST>>>
⟪CHECKLIST⟫
- Checkhov's gun item 1
- Setup that needs payoff 2
- Character arc element 3
⟪/CHECKLIST⟫
<<<END_CHECKLIST>>>

<<<CHAPTERS>>>
⟪CHAPTERS⟫
# Chapter 1: [Optional Title]

[Full chapter text in ${language}. End with a soft hook - a question, risk, choice, or tension.]

# Chapter 2: [Optional Title]

[Full chapter text...]

⟪/CHAPTERS⟫
<<<END_CHAPTERS>>>

<<<TITLES>>>
⟪TITLES⟫
- Title option 1
- Title option 2
- Title option 3
- Title option 4
- Title option 5
⟪/TITLES⟫
<<<END_TITLES>>>

<<<SYNOPSIS>>>
⟪SYNOPSIS⟫
[Approximately 200 words summarizing the complete story, its themes, and emotional arc]
⟪/SYNOPSIS⟫
<<<END_SYNOPSIS>>>`;

  return { systemPrompt, userPrompt };
}

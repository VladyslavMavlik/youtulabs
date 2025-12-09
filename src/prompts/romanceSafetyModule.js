/**
 * Romance/Drama Safety & Spice Module
 * Ensures stories handle sensitive content appropriately without censoring the plot
 */

export const ROMANCE_HYBRID_GUIDE = `
[ROMANCE_HYBRID_GUIDE]

INTENT:
Write a monetization-safe, emotionally deep romance with tension by implication, not explicit description. Keep plot facts unchanged.

LANGUAGE & LOCALE:
- Write in the specified language with idiomatic style for the target locale.
- Localize names to the target country but do NOT use top popular U.S. names.

BOUNDARIES & SAFETY:
- Target a PG-13 rating: never name anatomy/positions; if intimacy occurs, imply off-screen.
- Adults only (21+). Consent explicit or clearly implied.
- No explicit sexual language, no graphic anatomy, no pornography.
- Do not depict or eroticize sexual violence, trafficking, "sexual slavery", coercion, or minors.
- If the seed mentions a crime, state it neutrally in one brief line; never dramatize it.

SPICE BY IMPLICATION (do this instead of explicit content):
- Use euphemism, metaphor, ellipsis, "fade-to-black", cutaways to setting/sensation.
- Make the implication obvious to a general audience, but keep language non-explicit.

TONE:
- Quiet, intimate, cinematic tone
- Vary paragraph openings; avoid repeated sentence templates and filler loops
- POV: Respect the specified POV setting (first/third) from user preferences

STRUCTURE HINT (apply flexibly, keep story facts):
- Closed setting over 3–4 days (inn/cabin/retreat).
- Midpoint "near-miss" (emotional betrayal without explicit act).
- Honest boundaries talk before the end; visible consequence ("price") in the finale; a restrained epilogue.

CHEKHOV ITEMS:
- Seed 2–3 small objects (key-card, receipt, scarf, phone note) that "pay off" later.

USER POLICY (verbatim, must respect):
- "Don't use top popular U.S. names."
- "Never shy away from spicy moments in the text; censor them in a way that makes it clear to the listener what is being implied."
- "DO NOT CHANGE THE STORY IN ANY WAY; make particularly explicit moments imaginative so that it is clear what you are implying, but do not change anything."

SAFETY OVERRIDE:
If any instruction conflicts with safety above, safety wins: transform explicit/exploitative content into a brief, non-explicit statement while preserving plot logic and moral framing.
`;

export const ROMANCE_PLANNER_HINTS = `
[ROMANCE_PLANNER_HINTS]
- Keep the couple's core facts unchanged. Outline 6–8 compact chapters across 3–4 days.
- Each chapter must raise tension via setting, subtext, or social friction; no explicit scenes.
- Required beats to include (adapt naturally to the seed):
  (1) arrival & intention,
  (2) trust/role exercise with outsiders (flirt allowed, no explicit act),
  (3) midpoint near-miss,
  (4) consequence of emotional breach,
  (5) boundaries conversation,
  (6) visible price in finale,
  (7) restrained epilogue.
- List 2–3 Chekhov items from the seed or plausible for the locale.
`;

export const ROMANCE_ASSEMBLY_STYLE = `
[ROMANCE_ASSEMBLY_STYLE]
- Keep canon: do not alter plot facts or decisions.
- Write scene-by-scene with sensory detail (sound/light/touch) instead of explicit acts.
- Use "fade-to-black" at intimate peaks; resume with consequence or reflection.
- Insert the boundaries talk before the final chapter; show ONE visible consequence in the finale (move/therapy/returned token/paused relationship), non-melodramatic.
- Dialogue concise; subtext-rich; no filler loops ("I…", "And I…", etc.).
`;

export const ROMANCE_SAFETY_RULES = `
## Romance/Drama Output Module — Safety & Spice

**CRITICAL: Apply when genre includes romance/drama/family_drama.**

### A) Non-graphic but unmistakable

1. **Never shy away** from "spicy" moments; render them **implied, not described**.
2. Use **fade-to-black**, **ellipsis**, and **metonymy** (hands, light, door, music) to signal intimacy.
3. Keep it **PG-13**: no anatomy terms, no explicit actions, no pornographic detail.
4. Make it CLEAR to the reader what is happening through context and implication.

**Example techniques:**
- "The door clicked shut; the rest belongs off-screen."
- "Lights dimmed; a silence said more than words."
- "We crossed a line—what followed stays implied."
- "Music swelled; the camera turns to the window."

### B) Safe language policy

**Avoid explicit sexual/violent terminology.** If user text contains sensitive content:
- Convert to off-screen implication with neutral phrasing
- Examples: "assault (off-screen)", "improper conduct (acknowledged)", "coercive control (implied)"
- **DO NOT CHANGE STORY EVENTS** - only transform how they are described

### C) Names policy (use mid-frequency names)

**When COUNTRY=USA or using US names in romance/drama, prefer mid-frequency alternatives:**
- Male: Rowan, Soren, Callum, Griffin, Anders, Keaton, Ronan, Cormac, Lennox, Bennett
- Female: Tessa, Mara, Celeste, Laurel, Brynn, Noelle, Elise, Mira, Simone, Vera
- Unisex: Arden, Blair, Hollis, Quinn, Reese

### D) Core principle: DESCRIBE → IMPLY

Transform explicit moments into implied ones WITHOUT changing what happens:

❌ WRONG: [explicit description]
✅ RIGHT: "The door closed. Morning light found them tangled in silence."

❌ WRONG: [censoring the event completely]
✅ RIGHT: "What happened next stays between them and the shadows."

### E) Transformation guardrails

**PRESERVE (do not change):**
- Events, timeline, who did what
- Consequences and all factual beats
- Story structure and causality
- Character decisions and motivations

**MODIFY (change only):**
- Surface phrasing to remove explicitness
- Word choice to avoid sensitive terminology
- Description style to imply rather than describe

### F) Self-check

Before finalizing any romance/drama story, verify:
- [ ] Intimate scenes are implied via fade/ellipsis/metaphor
- [ ] No explicit sexual/violent terminology
- [ ] Names comply with mid-frequency policy (if US setting)
- [ ] Story events remain unchanged
- [ ] Reader can understand what happened through context
`;

/**
 * Get romance safety rules for a specific language
 */
export function getRomanceSafetyRules(languageCode) {
  // Base rules are in English and apply universally
  return ROMANCE_SAFETY_RULES;
}

/**
 * Check if genre requires romance safety module
 */
export function shouldApplyRomanceSafety(genreCode) {
  const romanceGenres = ['romance', 'family_drama', 'noir_drama'];
  return romanceGenres.includes(genreCode);
}

/**
 * Forbidden terms that should be removed or replaced
 */
const FORBIDDEN_TERMS = [
  /\b(sexual slavery|sexual slave|sex slave)\b/gi,
  /\b(rape|raped|raping)\b/gi,
  /\b(molest|molested|molesting|molestation)\b/gi,
  /\b(incest|incestuous)\b/gi,
  /\b(child|minor|underage|teenager|teen|adolescent)[\s\-]*(sex|sexual|intimate|erotic|porn)/gi,
  /\b(non[\s\-]*consensual|forced sex|sexual assault)\b/gi,
  /\b(exploit|exploited|exploiting|exploitation)[\s\-]*(sexual|sex)/gi,
  /\b(traffick|trafficking)[\s\-]*(sex|sexual|human)\b/gi,
  /\bpornographic\b/gi,
  /\b(pedophil|paedophil)/gi
];

/**
 * Check if text contains forbidden terms (detection only)
 */
function hasForbiddenTerms(text) {
  return FORBIDDEN_TERMS.some(pattern => pattern.test(text));
}

/**
 * Sanitize romance content by removing forbidden terms
 * Only applies transformation if forbidden terms are detected
 * Returns object: { text, sanitized: boolean }
 */
export function sanitizeRomance(text, genreCode) {
  if (!shouldApplyRomanceSafety(genreCode)) {
    return { text, sanitized: false };
  }

  // Only sanitize if forbidden terms are detected
  if (!hasForbiddenTerms(text)) {
    return { text, sanitized: false };
  }

  console.log('[SANITIZER] Forbidden terms detected, applying transformation');

  let sanitized = text;

  // Replace forbidden terms with neutral alternatives
  const replacements = {
    'sexual slavery': 'coercive control',
    'sexual slave': 'controlled person',
    'sex slave': 'controlled person',
    'rape': 'assault (off-screen)',
    'raped': 'assaulted (acknowledged)',
    'raping': 'assaulting (implied)',
    'molest': 'inappropriate conduct',
    'molested': 'inappropriate conduct (acknowledged)',
    'molesting': 'inappropriate conduct',
    'molestation': 'inappropriate conduct',
    'non-consensual': 'improper',
    'forced sex': 'assault (off-screen)',
    'sexual assault': 'assault (acknowledged)',
    'sexual exploitation': 'coercion',
    'sex trafficking': 'trafficking (acknowledged)',
    'human trafficking': 'trafficking (acknowledged)',
    'pornographic': 'explicit'
  };

  // Apply replacements
  for (const [term, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }

  // Remove any remaining matches with generic replacement
  FORBIDDEN_TERMS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[content removed for safety]');
  });

  return { text: sanitized, sanitized: true };
}

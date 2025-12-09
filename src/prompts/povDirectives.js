/**
 * POV (Point of View) Directives for Story Generation
 * Ensures Claude maintains consistent narrative perspective
 */

/**
 * Build POV-specific directives for prompts
 * @param {string} pov - 'first' or 'third'
 * @param {string} tense - 'past', 'present', or 'auto' (consistent)
 * @param {string} language - Language code for localization
 * @returns {string} POV directive text
 */
export function buildPOVDirectives(pov = 'third', tense = 'auto', language = 'en-US') {
  const TENSE = (tense === 'past' || tense === 'present') ? tense : 'consistent';

  if (pov === 'first') {
    return `
[POV_RULES]
- Narrate strictly in 1st person singular ("I") from the protagonist's interior perspective.
- No out-of-reach information: the narrator knows only what they perceive, remember, or are told.
- Keep ${TENSE} tense consistently across all chapters (dialogue may vary naturally).
- Do not switch to third-person outside dialogue. Free indirect style is allowed but remains 1st-person interiority.
- Paragraph openings should vary; avoid repeated sentence templates.
- Inner thoughts, observations, and narration must all be from "I" perspective.
- PARAGRAPH ANCHORING: Begin paragraphs with light perception verbs from "I" (use sparingly): "I notice...", "I hold my breath...", "I hear..." - this keeps POV tether visible without overuse.`;
  }

  // default: third-limited
  return `
[POV_RULES]
- Narrate strictly in 3rd person limited, tethered to the protagonist's perceptions (no omniscience, no head-hopping).
- No internal thoughts of other characters unless inferred by observable behavior.
- Keep ${TENSE} tense consistently across all chapters (dialogue may vary naturally).
- Do not switch to first-person outside dialogue. Free indirect style is allowed within 3rd-limited bounds.
- Vary paragraph openings; avoid repeated sentence templates.
- Use "he/she/they" for protagonist; stay with their viewpoint throughout.
- PARAGRAPH ANCHORING: Begin paragraphs with CAMERA owner's perception: "Claire notices...", "Graham thinks...", "She feels..." - anchor to the POV character specified in ⟪CAMERA:...⟫. NO internal states of non-CAMERA characters.`;
}

/**
 * Get localized pronoun patterns for POV drift detection
 * @param {string} language - Language code
 * @returns {object} Patterns for first and third person pronouns
 */
export function getPOVPronounPatterns(language = 'en-US') {
  const patterns = {
    'en-US': {
      first: /\b(i|me|my|mine|myself)\b/gi,
      third: /\b(he|him|his|she|her|hers|they|them|their|theirs)\b/gi
    },
    'uk-UA': {
      first: /\b(я|мене|мені|мій|моя|моє|мої|мною|собі)\b/gi,
      third: /\b(він|його|йому|ним|вона|її|їй|нею|вони|їх|їм|ними)\b/gi
    },
    'pl-PL': {
      first: /\b(ja|mnie|mi|mną|mój|moja|moje|moi|moich)\b/gi,
      third: /\b(on|jego|jemu|nim|ona|jej|ją|nią|oni|one|ich|im|nimi)\b/gi
    },
    'de-DE': {
      first: /\b(ich|mir|mich|mein|meine|meines|meiner)\b/gi,
      third: /\b(er|ihn|ihm|sein|sie|ihr|ihnen|es)\b/gi
    }
  };

  return patterns[language] || patterns['en-US'];
}

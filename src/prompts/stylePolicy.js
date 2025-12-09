/**
 * Style Policy for Genres
 * Optimized for audio/listening experience with show-don't-tell principles
 */

export function stylePolicyForGenre(genre, audience = 'audio') {
  // Base rules for all genres
  const BASE = `
[STYLE_POLICY]
- Optimize for listening: avg sentence 12–16 words; active voice.
- Show feelings via action/sensation; avoid "I feel/I realize/seems/just/almost/that" unless pivotal.
- Dialogue ≤20 words per turn; insert action beats/pauses; avoid lecture-style exchanges.
- Scene beats: Goal → Obstacle → Stakes → Small decision at the end.
- Sensory 1-2-3 per scene: one sound, one tactile cue, one spatial detail (specific, non-repeated).
- One irreversible micro-action per scene (hand/return/delete/lock/sign).
- PG-13 suggestiveness; imply intimacy (fade-to-black, metaphor), no explicit description.
`;

  // Genre-specific additions
  const GENRE = {
    romance: `- Tilt toward intimacy-as-subtext; moral ambiguity via choices, not terms.`,
    thriller: `- Maintain tense, claustrophobic tone; understating violence; no gore; keep mystery cues.`,
    drama: `- Emphasize vulnerability via gestures and silences; avoid abstract labels (agency/consent/performance/control) except at pivots.`,
    mystery: `- Plant clues through observable details; fair-play puzzle; show don't explain.`,
    horror: `- Dread through implication and atmosphere; no explicit gore; sensory details create unease.`,
    scifi: `- Ground tech in concrete sensory details; avoid info-dumps; show worldbuilding through action.`,
    fantasy: `- Magic through consequences and cost; avoid exposition; show rules via character experience.`
  }[genre] || '';

  return BASE + '\n' + GENRE + '\n';
}

/**
 * Safe Romance Frame for PG-13 content
 */
export const SAFE_ROMANCE_FRAME = `
[SAFE_ROMANCE_FRAME]
- Adults only; non-explicit intimacy suitable for general audience.
- Imply intimacy via metaphor/ellipsis; do not depict or eroticize criminal/non-consensual activity.
- Adjust surface language only; never change plot facts or decisions.
`;

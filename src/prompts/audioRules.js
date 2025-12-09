/**
 * Audio-First Mode Rules
 * Optimizes narrative for listening (YouTube VO, audiobooks)
 * Target: 55+ male audience, retention-focused
 */
console.log('[LOAD] audioRules.js');

/**
 * Transition beacon lexicons for time/place shifts
 * These help listeners track the story without visual cues
 */
export const TRANSITION_LEXICONS = {
  'en-US': [
    'Later that night.',
    'By Sunday morning.',
    'An hour later.',
    'At dawn.',
    'The next evening.',
    'Two days later.',
    'By midnight.',
    'That same afternoon.',
    'Early the next morning.',
    'A week later.',
    'By Friday.',
    'Around noon.',
    'Just before closing.',
    'When the sun set.',
    'Before dawn.'
  ],
  'uk-UA': [
    "Тієї ж ночі.",
    "Наступного ранку.",
    "За годину потому.",
    "У неділю зранку.",
    "Увечері того ж дня.",
    "Через два дні.",
    "Опівночі.",
    "Того ж дня вдень.",
    "Рано-вранці.",
    "Через тиждень.",
    "У п'ятницю.",
    "Близько полудня.",
    "Перед закриттям.",
    "Коли сонце зайшло.",
    "До світанку."
  ],
  'pl-PL': [
    'Tej samej nocy.',
    'Następnego ranka.',
    'Godzinę później.',
    'W niedzielny poranek.',
    'Wieczorem tego dnia.',
    'Dwa dni później.',
    'O północy.',
    'Tego samego popołudnia.',
    'Wcześnie rano.',
    'Tydzień później.',
    'W piątek.',
    'Około południa.',
    'Przed zamknięciem.',
    'Gdy słońce zaszło.',
    'Przed świtem.'
  ],
  'de-DE': [
    'Später in der Nacht.',
    'Am Sonntagmorgen.',
    'Eine Stunde später.',
    'Bei Sonnenaufgang.',
    'Am nächsten Abend.',
    'Zwei Tage später.',
    'Um Mitternacht.',
    'Am selben Nachmittag.',
    'Früh am nächsten Morgen.',
    'Eine Woche später.',
    'Am Freitag.',
    'Gegen Mittag.',
    'Kurz vor Feierabend.',
    'Als die Sonne unterging.',
    'Vor der Morgendämmerung.'
  ]
};

/**
 * Core audio-first rules for narrative generation
 */
export const AUDIO_RULES = `
[AUDIO_RULES — Write for Listening, Not Reading]

CRITICAL: This story will be voice-acted for YouTube. Optimize for ear, not eye.

## 1) Chunk into Listenable Beats
- Each beat = 80–140 words with ONE small goal (action/revelation/choice)
- Listener needs frequent "checkpoints" to stay oriented
- Avoid dense 300-word paragraphs with no pauses

## 2) Clear Transition Beacons
- When time/place changes, START with explicit marker
- Examples: "Later that night." / "By Sunday morning." / "An hour later."
- Listener can't see chapter breaks — verbal signposts prevent confusion

## 3) Dialogue Attribution Every 1–2 Turns
- Repeat speaker name/tag frequently: "Graham said...", "She nodded..."
- Never run 3+ dialogue lines without attribution or action beat
- Listener can't see quotation marks — must track speakers by sound

## 4) Sentence Rhythm for Voice
- Target: ~70% short sentences (8–14 words), ~30% longer for nuance
- Average sentence length: 12–16 words
- Voice actor needs breath points; avoid 40-word run-ons

## 5) Single Resolution Arc
- ONE clear ending, not two
- No "alternative ending" or double finales — confuses retention
- Resolution = consequence + emotional choice, then stop

## 6) No Meta-Intrusions Inside Narrative
- NO loglines, CTA, marketing taglines mid-story
- Keep "AFTER HOURS:" / "THIS STORY EXPLORES:" out of voice track
- Reserve meta-commentary for video description only

## 7) Intimacy = Cutaway + Consequence
- At peak intimate moments: fade to black, then show aftermath
- Voice-over skips the act, focuses on choice/fallout
- Examples: "The door closed. By morning, he'd deleted the recording. She left the keycard on his desk."
- Listener understands implication, stays monetization-safe

## Why This Matters
- Listener is driving, cooking, or multitasking — can't rewind easily
- Need verbal anchors (time markers, speaker tags, beat checkpoints)
- Retention drops if listener loses narrative thread
- YouTube algorithm penalizes mid-video drop-off
`;

/**
 * Get audio rules for planner (language-agnostic)
 */
export function getAudioRules(audioMode = false) {
  if (!audioMode) return '';
  return AUDIO_RULES;
}

/**
 * Get transition lexicon for specific language
 */
export function getTransitionLexicon(languageCode = 'en-US') {
  return TRANSITION_LEXICONS[languageCode] || TRANSITION_LEXICONS['en-US'];
}

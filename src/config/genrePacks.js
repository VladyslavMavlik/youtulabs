/**
 * Genre-specific storytelling rules, metrics, and patch strategies
 * Universal system for all genres with beats, twists, quality thresholds, and patches
 */
console.log('[LOAD] genrePacks.js');

export const genrePacks = {
  'thriller': {
    name: 'Thriller',
    rules: `- Constant threat and escalating danger
- Tight deadlines and time pressure
- Suspicion, paranoia, shifting trust
- High-tempo pacing with quick revelations
- Cliffhangers at chapter ends
- Plot-driven with action/decision focus`,

    // Genre-specific metrics and structure
    beats: ['inciting_threat', 'first_escalation', 'ally_betrayal', 'point_of_no_return', 'darkest_moment', 'final_confrontation'],
    twists: ['ally_reveal', 'hidden_motive', 'double_cross', 'ticking_clock_accelerates'],
    chaptersPer1k: 3.2,        // ~312 words per chapter - fast pacing
    dialogueRatio: 0.35,       // 35% dialogue for tension
    motifBudgetPer10k: 4,      // Action motifs can repeat more
    obligatoryScenes: ['chase', 'betrayal', 'confrontation'],
    temps: [0.75, 0.80, 0.65], // [opening, middle, finale] - controlled escalation
    patches: ['pacing_condense', 'reveal_tighten']
  },

  'romance': {
    name: 'Romance',
    rules: `- Emotional stakes drive the plot
- Obstacles to union (internal/external)
- Build tension through misunderstanding or conflict
- Climax centers on confession/commitment/choice
- Satisfying emotional resolution required
- Chemistry and attraction shown through action
- Dialogue ratio: 30-45% (minimum 28%)`,

    beats: ['meet_cute', 'attraction_spark', 'emotional_barrier', 'vulnerability_moment', 'crisis_separation', 'earned_reunion'],
    twists: ['hidden_past', 'sacrifice_choice', 'third_party_catalyst'],
    chaptersPer1k: 2.8,        // ~357 words - slower, emotional pacing
    dialogueRatio: { min: 0.28, target: 0.38, max: 0.55 }, // Range instead of fixed 42%
    motifBudget: 3,            // ≤3 appearances per motif per story (not per 10k)
    obligatoryScenes: ['first_touch', 'conflict_reveal', 'grand_gesture'],
    temps: [0.80, 0.78, 0.65], // Reduced from [0.85, 0.90, 0.70] to reduce lexical noise
    patches: ['anchor_inject', 'chemistry_amplify', 'visible_price'],

    // Quiet Noir mode for mature readers
    quietNoirMode: {
      readerProfile: 'male 55+, quiet psychological noir, no melodrama',
      intimacyMode: '"heard not just seen"; trust vs control dynamics',
      motifBudget: 3,  // max 3 appearances per motif per story
      visiblePriceRequired: true,
      characterAnchorsRequired: true,
      midCompressionPercent: 6,  // In middle chapters, compress exposition by 5-8% (remove phrasing repetition & rhetorical questions)
      dialogueRatioMin: 0.28,
      temps: [0.80, 0.75, 0.65], // Lower middle temp for noir control
      toneGuidance: `- "Heard not just seen" intimacy style
- Trust vs control as central tension
- Jealousy → control → self-sabotage arc
- No melodrama or explicit scenes
- Bittersweet, adult acceptance endings
- Concrete visible price in finale (therapy/move/work conflict)
- Each partner needs 1 anchor memory/gesture (3-4 lines)
- In middle chapters, compress exposition by 5-8% (remove phrasing repetition & rhetorical questions)
- Motifs appear max 3 times per story (frame: start + end + 1 middle)`
    }
  },

  'family_drama': {
    name: 'Family Drama',
    rules: `- Conflict rooted in values, expectations, duty
- Generational or relationship tensions
- Ethical dilemmas within family context
- Resolution through reconciliation or separation
- Character-driven, emotional authenticity
- Domestic or family settings
- Dialogue ratio: 35-50% (minimum 30%)`,

    beats: ['family_gathering', 'old_wound_reopened', 'secret_revealed', 'confrontation', 'understanding_moment', 'new_normal'],
    twists: ['parentage_reveal', 'hidden_sacrifice', 'generational_echo'],
    chaptersPer1k: 2.6,        // Slow, contemplative
    dialogueRatio: { min: 0.30, target: 0.42, max: 0.55 }, // Range for character-through-dialogue
    motifBudget: 4,            // ≤4 appearances per motif per story
    obligatoryScenes: ['family_meal', 'private_confession', 'forgiveness_attempt'],
    temps: [0.80, 0.78, 0.70], // Reduced from [0.85, 0.88, 0.75]
    patches: ['anchor_inject', 'dialogue_deepen']
  },

  'mystery': {
    name: 'Mystery',
    rules: `- Central puzzle or crime to solve
- Clues distributed fairly throughout
- Red herrings balanced with real evidence
- Investigative progression and discoveries
- Revelation should be surprising yet logical
- Resolution explains all major questions`,

    beats: ['crime_discovery', 'suspect_introduction', 'first_clue', 'red_herring', 'breakthrough', 'solution_reveal'],
    twists: ['least_likely_suspect', 'double_motive', 'unreliable_witness'],
    chaptersPer1k: 2.9,
    dialogueRatio: 0.40,       // Investigation through dialogue
    motifBudgetPer10k: 3,
    obligatoryScenes: ['crime_scene', 'interrogation', 'reveal_confrontation'],
    temps: [0.70, 0.75, 0.65], // Controlled for logical consistency
    patches: ['clue_clarity', 'reveal_tighten']
  },

  'horror': {
    name: 'Horror',
    rules: `- Building dread and unease
- Threat should feel inevitable and personal
- Reveal horror gradually, not all at once
- Isolation and vulnerability of characters
- Visceral, sensory descriptions
- Ambiguous or unsettling endings acceptable`,

    beats: ['first_unease', 'normalcy_violation', 'isolation', 'reality_fracture', 'confrontation_horror', 'tragic_end_or_escape'],
    twists: ['protagonist_unreliable', 'monster_identity', 'no_escape'],
    chaptersPer1k: 2.8,
    dialogueRatio: 0.25,       // Less dialogue, more atmosphere
    motifBudgetPer10k: 5,      // Dread imagery repeats for effect
    obligatoryScenes: ['first_encounter', 'safe_space_violated', 'final_horror'],
    temps: [0.75, 0.85, 0.80], // Higher variance for unsettling effect
    patches: ['dread_intensifier', 'atmosphere_deepen']
  },

  'scifi_adventure': {
    name: 'Sci-Fi Adventure',
    rules: `- Kinetic action in speculative setting
- Team dynamics & camaraderie
- Exotic locations with sensory detail
- Tech/magic hybrid elements
- Hero underdog → competent arc
- Playful tone with serious stakes
- Puzzle-solving & resourcefulness
- Optimistic worldview despite danger`,

    beats: ['adventure_call', 'team_formation', 'first_obstacle', 'midpoint_reversal', 'all_seems_lost', 'heroic_triumph'],
    twists: ['ally_secret_skill', 'tech_upgrade', 'enemy_becomes_ally'],
    chaptersPer1k: 3.1,        // Adventure pacing
    dialogueRatio: 0.38,
    motifBudgetPer10k: 4,
    obligatoryScenes: ['action_setpiece', 'tech_puzzle', 'team_bonding'],
    temps: [0.85, 0.88, 0.70],
    patches: ['setpiece_boost', 'pacing_condense']
  },

  'noir_drama': {
    name: 'Noir Drama',
    rules: `- Intimate psychological tension, moral ambiguity
- Focus on cost of choices, ethical dilemmas
- Twist or revelation every 1-2 beats
- Dark atmosphere, cynical worldview
- Complex characters with hidden motives
- Urban or confined settings preferred`,

    beats: ['moral_compromise', 'corruption_deepens', 'false_hope', 'betrayal', 'acceptance_of_fate'],
    twists: ['femme_fatale_reveal', 'authority_corruption', 'cyclical_doom'],
    chaptersPer1k: 2.6,        // Atmospheric, slow burn
    dialogueRatio: 0.38,
    motifBudgetPer10k: 4,      // Noir imagery can repeat
    obligatoryScenes: ['moral_choice', 'rain_scene', 'final_compromise'],
    temps: [0.80, 0.85, 0.75],
    patches: ['atmosphere_deepen', 'anchor_inject']
  },

  'sci_fi': {
    name: 'Science Fiction',
    rules: `- Speculative concept or technology central
- Explore consequences of innovation
- World-building integrated naturally
- Character choices reflect tech/society interaction
- Balance exposition with action
- Plausible internal logic`,

    beats: ['tech_discovery', 'system_malfunction', 'ethical_dilemma', 'paradigm_shift', 'human_cost', 'new_equilibrium'],
    twists: ['ai_sentience', 'simulation_reveal', 'time_paradox'],
    chaptersPer1k: 2.9,
    dialogueRatio: 0.32,
    motifBudgetPer10k: 3,
    obligatoryScenes: ['tech_wonder', 'system_failure', 'philosophical_debate'],
    temps: [0.75, 0.80, 0.65],
    patches: ['worldbuild_integrate', 'pacing_condense']
  },

  'fantasy': {
    name: 'Fantasy',
    rules: `- Magic/supernatural elements integral to plot
- Quest or journey structure common
- World-building through character experience
- Clear stakes in magical conflicts
- Hero's growth or transformation
- Balance wonder with grounded emotion`,

    beats: ['call_to_adventure', 'magic_discovery', 'mentor_loss', 'trial_by_magic', 'dark_revelation', 'heroic_sacrifice'],
    twists: ['chosen_one_subversion', 'magic_cost_reveal', 'prophecy_twist'],
    chaptersPer1k: 2.7,        // Slower for world-building
    dialogueRatio: 0.36,
    motifBudgetPer10k: 4,      // Magic/lore can repeat
    obligatoryScenes: ['magic_first_use', 'mentor_teaching', 'final_spell'],
    temps: [0.85, 0.90, 0.70],
    patches: ['worldbuild_integrate', 'setpiece_boost']
  },

  'comedy': {
    name: 'Comedy',
    rules: `- Misunderstandings and escalating absurdity
- Character flaws drive humor
- Timing and pacing crucial
- Subvert expectations cleverly
- Witty dialogue and situational humor
- Satisfying but light-hearted resolution`,

    beats: ['comic_inciting', 'escalation_absurd', 'misunderstanding_peak', 'truth_reveal', 'reconciliation_laugh'],
    twists: ['role_reversal', 'secret_exposed', 'callback_payoff'],
    chaptersPer1k: 3.3,        // Fast pacing for comedy timing
    dialogueRatio: 0.50,       // 50% dialogue for banter
    motifBudgetPer10k: 4,      // Running gags can repeat
    obligatoryScenes: ['setup_payoff', 'comic_setpiece', 'emotional_truth'],
    temps: [0.90, 0.95, 0.85], // High variance for comedic surprise
    patches: ['pacing_condense', 'callback_amplify']
  },

  'military': {
    name: 'Military/War',
    rules: `- Tactical realism and chain of command
- Brotherhood/unit cohesion vs individual cost
- Moral ambiguity in combat decisions
- Physical and psychological toll of warfare
- Mission objectives with human stakes
- Honor, duty, sacrifice themes
- Respect for military culture and procedures`,

    beats: ['deployment', 'first_contact', 'casualty_loss', 'mission_critical', 'sacrifice_choice', 'aftermath_reckoning'],
    twists: ['friendly_fire', 'compromised_intel', 'ethical_dilemma', 'unexpected_ally'],
    chaptersPer1k: 3.0,        // Medium pacing - balance action and reflection
    dialogueRatio: 0.32,       // 32% dialogue - tactical comms and character moments
    motifBudgetPer10k: 3,      // War artifacts/symbols (dog tags, photos, coordinates)
    obligatoryScenes: ['combat_engagement', 'loss_moment', 'moral_choice', 'unit_bond'],
    temps: [0.75, 0.70, 0.65], // Controlled temps for tactical precision
    patches: ['pacing_condense', 'visible_price']
  }
};

export function getGenrePack(genreCode) {
  const pack = genrePacks[genreCode];
  if (!pack) {
    throw new Error(`Genre pack not found: ${genreCode}`);
  }
  return pack;
}

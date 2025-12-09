// Pricing and Crystal Logic Configuration
// 1 crystal = $0.005
// 1 minute = 10 crystals = $0.05
// 25 minute story = 250 crystals = $1.25

export const CRYSTAL_PRICE = 0.005; // $0.005 per crystal
export const CRYSTALS_PER_MINUTE = 10; // 10 crystals per minute of story
export const AVERAGE_STORY_MINUTES = 25; // Average story length
export const CRYSTALS_PER_STORY = AVERAGE_STORY_MINUTES * CRYSTALS_PER_MINUTE; // 250 crystals

// Audio TTS Pricing
// 450 characters = 1 crystal (optimized for ~$90 profit per 10M)
// Based on Voice API cost: 10M symbols = $34
// Crystal value: 2500 crystals = $14 => $0.0056 per crystal
// Target profit: ~$90 per 10M symbols (~72.7% margin)
// Revenue per 10M: ~$124.45, Cost: $34, Profit: ~$90.45
export const CHARS_PER_CRYSTAL_AUDIO = 450; // For audio TTS
export const CHARS_PER_MINUTE_AUDIO = 1000; // ElevenLabs standard: 1000 chars ≈ 1 minute (characters without spaces)

export interface SubscriptionPlan {
  id: 'starter' | 'pro' | 'ultimate';
  name: string;
  price: number;
  crystals: number;
  audioEnabled: boolean;
  features: {
    storiesPerMonth: number;
    audioVoiceover: boolean;
    languages: string;
    generationSpeed: string;
    voices: string;
    export: string;
    support: string;
    extras?: string[];
  };
}

export interface CrystalPack {
  id: string;
  crystals: number;
  price: number;
  bonus: number;
  popular?: boolean;
}

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 8,
    crystals: 2000,
    audioEnabled: false,
    features: {
      storiesPerMonth: 8,
      audioVoiceover: false,
      languages: 'All supported languages',
      generationSpeed: 'Standard',
      voices: 'N/A (text only)',
      export: 'TXT / PDF',
      support: 'Basic email support',
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19.99,
    crystals: 6000,
    audioEnabled: true,
    features: {
      storiesPerMonth: 24,
      audioVoiceover: true,
      languages: 'All supported languages',
      generationSpeed: 'Priority',
      voices: 'All available AI voices',
      export: 'MP3 / WAV / TXT / PDF',
      support: 'Priority support',
    }
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: 49.99,
    crystals: 20000,
    audioEnabled: true,
    features: {
      storiesPerMonth: 80,
      audioVoiceover: true,
      languages: 'All supported languages',
      generationSpeed: 'Maximum & top-priority queue',
      voices: 'Full voice library + future packs',
      export: 'All formats',
      support: '24/7 priority support',
      extras: ['Early access to new features']
    }
  }
];

export const crystalPacks: CrystalPack[] = [
  {
    id: 'pack_500',
    crystals: 500,
    price: 2.50,
    bonus: 0,
  },
  {
    id: 'pack_1000',
    crystals: 1000,
    price: 5,
    bonus: 0,
  },
  {
    id: 'pack_2500',
    crystals: 2500,
    price: 12,
    bonus: 100,
    popular: true,
  },
  {
    id: 'pack_5000',
    crystals: 5000,
    price: 23,
    bonus: 300,
  },
  {
    id: 'pack_10000',
    crystals: 10000,
    price: 45,
    bonus: 1000,
  },
  {
    id: 'pack_25000',
    crystals: 25000,
    price: 110,
    bonus: 3000,
  },
];

/**
 * Calculate crystal cost for a story generation
 * @param minutes - Duration of the story in minutes
 * @returns Number of crystals required
 */
export function calculateCrystalCost(minutes: number): number {
  return minutes * CRYSTALS_PER_MINUTE;
}

/**
 * Check if user has enough crystals for generation
 * @param userBalance - User's current crystal balance
 * @param minutes - Duration of the story in minutes
 * @returns Boolean indicating if user can afford generation
 */
export function canAffordGeneration(userBalance: number, minutes: number): boolean {
  return userBalance >= calculateCrystalCost(minutes);
}

/**
 * Get subscription plan by ID
 * @param planId - Plan identifier
 * @returns SubscriptionPlan or undefined
 */
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return subscriptionPlans.find(plan => plan.id === planId);
}

/**
 * Get crystal pack by ID
 * @param packId - Pack identifier
 * @returns CrystalPack or undefined
 */
export function getPackById(packId: string): CrystalPack | undefined {
  return crystalPacks.find(pack => pack.id === packId);
}

/**
 * Check if user's plan allows audio generation
 * Audio is now available for all users regardless of plan
 * @param planId - User's subscription plan ID
 * @returns Boolean indicating if audio is enabled
 */
export function isAudioEnabled(planId?: string): boolean {
  // Audio is now available for everyone
  return true;
}

/**
 * Calculate crystal cost for audio TTS generation
 * Formula: 450 characters = 1 crystal (rounded up)
 * This gives ~$90 profit per 10M characters (~72.7% margin)
 *
 * Economics:
 * - 10M characters = ~22,223 crystals = ~$124.45 revenue
 * - Voice API cost: $34
 * - Net profit: ~$90.45
 *
 * @param characters - Number of characters in text
 * @returns Number of crystals required
 */
export function calculateAudioCrystalCost(characters: number): number {
  if (characters <= 0) return 0;
  return Math.ceil(characters / CHARS_PER_CRYSTAL_AUDIO);
}

// Subscription tier colors and styles

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'ultimate';

interface SubscriptionStyle {
  gradient: string;
  glow: string;
  badgeGradient: string;
  badgeText: string;
  label: string;
  borderColor: string;
}

export const subscriptionStyles: Record<SubscriptionTier, SubscriptionStyle> = {
  free: {
    gradient: 'linear-gradient(135deg, #ffffff, #eab308)', // Жовтий-білий (як зараз)
    glow: '0 0 15px rgba(234, 179, 8, 0.8)',
    badgeGradient: 'linear-gradient(135deg, #eab308, #ca8a04)',
    badgeText: '#ffffff',
    label: 'Free',
    borderColor: '#eab308'
  },
  starter: {
    gradient: 'linear-gradient(135deg, #10b981, #059669)', // Зелений
    glow: '0 0 15px rgba(16, 185, 129, 0.8)',
    badgeGradient: 'linear-gradient(135deg, #10b981, #059669)',
    badgeText: '#ffffff',
    label: 'Starter',
    borderColor: '#10b981'
  },
  pro: {
    gradient: 'linear-gradient(135deg, #ff7f00, #ffffff)', // Оранжевий-білий
    glow: '0 0 20px rgba(255, 127, 0, 0.9)',
    badgeGradient: 'linear-gradient(135deg, #ff7f00, #ff9500)',
    badgeText: '#ffffff',
    label: 'Pro',
    borderColor: '#ff7f00'
  },
  ultimate: {
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)', // Червоний
    glow: '0 0 25px rgba(239, 68, 68, 1), 0 0 40px rgba(239, 68, 68, 0.6)',
    badgeGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    badgeText: '#ffffff',
    label: 'Ultimate',
    borderColor: '#ef4444'
  }
};

export function getSubscriptionStyle(planId: string | null | undefined): SubscriptionStyle {
  if (!planId) return subscriptionStyles.free;

  const tier = planId.toLowerCase() as SubscriptionTier;
  return subscriptionStyles[tier] || subscriptionStyles.free;
}

export function getSubscriptionTier(planId: string | null | undefined): SubscriptionTier {
  if (!planId) return 'free';

  const tier = planId.toLowerCase();
  if (tier === 'starter' || tier === 'pro' || tier === 'ultimate') {
    return tier as SubscriptionTier;
  }

  return 'free';
}

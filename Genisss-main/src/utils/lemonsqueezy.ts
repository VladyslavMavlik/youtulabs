/**
 * LemonSqueezy Checkout Integration
 *
 * Unlike Paddle/Stripe, LemonSqueezy uses simple redirect URLs
 * No SDK needed - just redirect to checkout URL with custom data
 */

import { supabase } from '../lib/supabase';

// Variant IDs from LemonSqueezy dashboard
export const LEMONSQUEEZY_VARIANTS = {
  starter: import.meta.env.VITE_LEMONSQUEEZY_VARIANT_STARTER || '720643',
  pro: import.meta.env.VITE_LEMONSQUEEZY_VARIANT_PRO || '720649',
  ultimate: import.meta.env.VITE_LEMONSQUEEZY_VARIANT_ULTIMATE || '720658',
};

// Plan info mapping
export const PLAN_INFO = {
  starter: { name: 'Starter', price: 8, crystals: 2000 },
  pro: { name: 'Pro', price: 19.99, crystals: 6000 },
  ultimate: { name: 'Ultimate', price: 49.99, crystals: 20000 },
};

/**
 * Get variant ID for a plan
 */
export function getVariantId(planId: string): string {
  const mapping: Record<string, string> = {
    'starter': LEMONSQUEEZY_VARIANTS.starter,
    'pro': LEMONSQUEEZY_VARIANTS.pro,
    'ultimate': LEMONSQUEEZY_VARIANTS.ultimate,
  };

  return mapping[planId] || LEMONSQUEEZY_VARIANTS.starter;
}

// Custom error types for subscription operations
export interface SubscriptionError {
  error: string;
  message: string;
  current_plan?: string;
  requested_plan?: string;
  expires_at?: string;
}

export class DowngradeNotAllowedError extends Error {
  current_plan: string;
  requested_plan: string;
  expires_at?: string;

  constructor(data: SubscriptionError) {
    super(data.message);
    this.name = 'DowngradeNotAllowedError';
    this.current_plan = data.current_plan || '';
    this.requested_plan = data.requested_plan || '';
    this.expires_at = data.expires_at;
  }
}

export class SamePlanError extends Error {
  current_plan: string;

  constructor(data: SubscriptionError) {
    super(data.message);
    this.name = 'SamePlanError';
    this.current_plan = data.current_plan || '';
  }
}

/**
 * Open LemonSqueezy checkout
 * Calls backend API to generate checkout URL with user_id
 */
export async function openLemonSqueezyCheckout(
  planId: string,
  user: { id: string; email?: string }
): Promise<void> {
  const API_URL = import.meta.env.VITE_API_URL ?? '';

  // Get session token
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const variantId = getVariantId(planId);

  console.log('[LEMONSQUEEZY] Opening checkout for plan:', planId, 'variant:', variantId);

  try {
    // Call backend to generate checkout URL with custom data
    const response = await fetch(`${API_URL}/api/lemonsqueezy/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ variantId })
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Handle specific error types
      if (errorData.error === 'downgrade_not_allowed') {
        throw new DowngradeNotAllowedError(errorData);
      }
      if (errorData.error === 'same_plan') {
        throw new SamePlanError(errorData);
      }

      throw new Error(errorData.message || errorData.error || 'Failed to create checkout');
    }

    const { checkoutUrl } = await response.json();

    console.log('[LEMONSQUEEZY] Redirecting to checkout:', checkoutUrl);

    // Redirect to LemonSqueezy checkout
    window.location.href = checkoutUrl;
  } catch (error) {
    console.error('[LEMONSQUEEZY] Checkout error:', error);
    throw error;
  }
}

/**
 * Get user's LemonSqueezy subscription status
 */
export async function getLemonSqueezySubscription(): Promise<{
  has_subscription: boolean;
  subscription_id?: string;
  plan_type?: string;
  status?: string;
  credits_per_period?: number;
  renews_at?: string;
  ends_at?: string;
}> {
  const API_URL = import.meta.env.VITE_API_URL ?? '';

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.access_token) {
    return { has_subscription: false };
  }

  try {
    const response = await fetch(`${API_URL}/api/lemonsqueezy/subscription`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      return { has_subscription: false };
    }

    return await response.json();
  } catch (error) {
    console.error('[LEMONSQUEEZY] Get subscription error:', error);
    return { has_subscription: false };
  }
}

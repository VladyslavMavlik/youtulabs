/**
 * Admin API - Функції для управління підписками та кредитами через Paddle
 */

import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Отримати JWT токен поточного користувача
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Отримати інформацію про підписку користувача
 */
export async function getUserSubscription(userId: string) {
  const token = await getAuthToken();
  if (!token) {
    return { data: null, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/subscription`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error || 'Failed to get subscription' };
    }

    return { data, error: null };
  } catch (error: any) {
    console.error('[ADMIN API] Error getting subscription:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Змінити план підписки користувача через Paddle API
 */
export async function changeUserSubscriptionPlan(
  userId: string,
  newPlan: 'starter' | 'pro' | 'ultimate',
  effectiveFrom: 'immediately' | 'next_billing_period' = 'immediately'
) {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/subscription/change-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ newPlan, effectiveFrom })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to change plan' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[ADMIN API] Error changing plan:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Відмінити підписку користувача
 */
export async function cancelUserSubscription(
  userId: string,
  effectiveFrom: 'immediately' | 'next_billing_period' = 'next_billing_period',
  reason?: string,
  forceRemove: boolean = false
) {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ effectiveFrom, reason, forceRemove })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to cancel subscription' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[ADMIN API] Error canceling subscription:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Нарахувати кредити користувачу
 */
export async function grantUserCredits(
  userId: string,
  amount: number,
  reason: string = 'Admin grant',
  expiresInDays: number = 30
) {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/credits/grant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount, reason, expiresInDays })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to grant credits' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[ADMIN API] Error granting credits:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Зняти кредити у користувача
 */
export async function deductUserCredits(
  userId: string,
  amount: number,
  reason: string = 'Admin deduction'
) {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/credits/deduct`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount, reason })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to deduct credits' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[ADMIN API] Error deducting credits:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Встановити точний баланс користувача
 */
export async function setUserBalance(
  userId: string,
  balance: number,
  reason: string = 'Manual balance adjustment'
) {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/balance/set`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ balance, reason })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to set balance' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[ADMIN API] Error setting balance:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Отримати детальну інформацію про кредити користувача
 */
export async function getUserCredits(userId: string) {
  const token = await getAuthToken();
  if (!token) {
    return { data: null, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/credits`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error || 'Failed to get credits' };
    }

    return { data, error: null };
  } catch (error: any) {
    console.error('[ADMIN API] Error getting credits:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Отримати список всіх користувачів (використовуємо стару RPC функцію)
 */
export async function getAllUsersWithDetails() {
  try {
    console.log('[ADMIN API] Getting all users via RPC');

    // Використовуємо стару RPC функцію яка вже працює
    const { data, error } = await supabase.rpc('get_all_users_with_subscriptions');

    if (error) {
      console.error('[ADMIN API] Failed to fetch users:', error);
      return { data: null, error: error.message };
    }

    console.log('[ADMIN API] Users fetched successfully:', data?.length, 'users');
    return { data, error: null };
  } catch (error: any) {
    console.error('[ADMIN API] Error getting users:', error);
    return { data: null, error: error.message };
  }
}

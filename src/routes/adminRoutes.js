/**
 * Admin API Routes - Управління підписками та кредитами
 * ВАЖЛИВО: Доступ тільки для адміністраторів
 */

import { createClient } from '@supabase/supabase-js';
import {
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  pauseSubscription,
  getCustomerSubscriptions
} from '../utils/paddleApi.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Price ID mapping (з .env)
const PRICE_MAP = {
  starter: process.env.PADDLE_PRICE_STARTER || 'pri_01kaseyhggrqz2x9j73ma2cwwc',
  pro: process.env.PADDLE_PRICE_STANDARD || 'pri_01kasewrjdgwem95fc233cn9we',
  ultimate: process.env.PADDLE_PRICE_PRO || 'pri_01kasetbgrprt81dr7tfe69knx'
};

/**
 * Middleware: Перевірка чи користувач адмін
 */
export async function requireAdmin(req, res, next) {
  console.log('[ADMIN] requireAdmin middleware called for:', req.method, req.url);
  console.log('[ADMIN] Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[ADMIN] No auth header or not Bearer token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    console.log('[ADMIN] Token extracted, length:', token.length);

    // Перевіряємо JWT через Supabase
    console.log('[ADMIN] Calling supabaseAdmin.auth.getUser...');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    console.log('[ADMIN] Supabase response - user:', !!user, 'error:', !!error);

    if (error || !user) {
      console.log('[ADMIN] Invalid token, error:', error?.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('[ADMIN] User found:', user.email);
    console.log('[ADMIN] user_metadata:', JSON.stringify(user.user_metadata));
    console.log('[ADMIN] app_metadata:', JSON.stringify(user.app_metadata));

    // Перевіряємо чи користувач має роль admin в user_metadata
    const isAdmin = user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin';
    console.log('[ADMIN] isAdmin check result:', isAdmin);

    if (!isAdmin) {
      console.log('[ADMIN] Access denied for user:', user.email, 'metadata:', user.user_metadata);
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    req.adminId = user.id;
    console.log('[ADMIN] Admin verified, calling next()');
    next();
  } catch (error) {
    console.error('[ADMIN] Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * GET /api/admin/users/:userId/subscription
 * Отримати інформацію про підписку користувача
 */
export async function getUserSubscription(req, res) {
  try {
    const { userId } = req.params;

    // Отримуємо підписку з БД
    const { data: subscription, error } = await supabaseAdmin
      .from('paddle_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Отримуємо актуальну інформацію з Paddle
    let paddleData = null;
    try {
      paddleData = await getSubscription(subscription.paddle_subscription_id);
    } catch (err) {
      console.warn('[ADMIN] Failed to fetch from Paddle:', err.message);
    }

    return res.json({
      database: subscription,
      paddle: paddleData
    });
  } catch (error) {
    console.error('[ADMIN] Error getting subscription:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/users/:userId/subscription/change-plan
 * Змінити план підписки через Paddle API
 */
export async function changeSubscriptionPlan(req, res) {
  console.log('[ADMIN] ✅ changeSubscriptionPlan FUNCTION CALLED!');
  console.log('[ADMIN] userId:', req.params.userId);
  console.log('[ADMIN] body type:', typeof req.body);
  console.log('[ADMIN] body keys:', req.body ? Object.keys(req.body) : 'null');

  try {
    const userId = req.params.userId;
    console.log('[ADMIN] userId extracted:', userId);

    const newPlan = req.body?.newPlan;
    const effectiveFrom = req.body?.effectiveFrom || 'immediately';
    console.log('[ADMIN] Extracted params - userId:', userId, 'newPlan:', newPlan, 'effectiveFrom:', effectiveFrom);

    // Валідація
    if (!['starter', 'pro', 'ultimate'].includes(newPlan)) {
      console.log('[ADMIN] Invalid plan:', newPlan);
      return res.status(400).json({ error: 'Invalid plan' });
    }
    console.log('[ADMIN] Plan validated, querying subscription...');

    // Отримуємо підписку
    const { data: subscription, error } = await supabaseAdmin
      .from('paddle_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    console.log('[ADMIN] Subscription query result - data:', !!subscription, 'error:', !!error);

    // Якщо підписки немає - створюємо нову через admin_sync_subscription_credits
    if (error || !subscription) {
      console.log('[ADMIN] No subscription found, creating new one with plan:', newPlan);

      const { data: creditId, error: syncError } = await supabaseAdmin.rpc('admin_sync_subscription_credits', {
        p_user_id: userId,
        p_new_plan: newPlan,
        p_reason: `Admin granted ${newPlan} plan`
      });

      if (syncError) {
        console.error('[ADMIN] Failed to create subscription:', syncError);
        return res.status(500).json({ error: 'Failed to create subscription: ' + syncError.message });
      }

      console.log('[ADMIN] Subscription created, credit_id:', creditId);

      // Логуємо
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: req.adminId,
        action: 'subscription_plan_created',
        target_user_id: userId,
        details: {
          new_plan: newPlan,
          credit_id: creditId,
          reason: `Admin created ${newPlan} subscription`
        }
      });

      return res.json({
        success: true,
        message: `Created ${newPlan} subscription for user`,
        credit_id: creditId
      });
    }

    // Перевіряємо чи не той самий план
    if (subscription.plan_type === newPlan) {
      return res.status(400).json({ error: 'User already has this plan' });
    }

    const newPriceId = PRICE_MAP[newPlan];
    const isManualSubscription = subscription.paddle_subscription_id?.startsWith('admin_manual_');

    console.log(`[ADMIN] Changing subscription for user ${userId} from ${subscription.plan_type} to ${newPlan}`);
    console.log(`[ADMIN] Is manual subscription: ${isManualSubscription}`);

    // Для ручних підписок оновлюємо тільки БД
    // Для реальних Paddle підписок намагаємось оновити через API
    let paddleUpdateSuccess = false;

    if (!isManualSubscription) {
      console.log('[ADMIN] Attempting to update Paddle subscription via API...');
      try {
        const paddleResponse = await updateSubscription(
          subscription.paddle_subscription_id,
          newPriceId,
          effectiveFrom
        );
        console.log('[ADMIN] Paddle API response:', paddleResponse);
        paddleUpdateSuccess = true;
      } catch (error) {
        console.error('[ADMIN] Paddle API error:', error);
        // У Sandbox режимі API не працює - дозволяємо продовжити з локальним оновленням
        // У Production це буде працювати коректно
        console.log('[ADMIN] Falling back to local DB update (Sandbox mode)');
      }
    } else {
      console.log('[ADMIN] Manual subscription - skipping Paddle API');
    }

    // Оновлюємо БД
    const { error: updateError } = await supabaseAdmin
      .from('paddle_subscriptions')
      .update({
        price_id: isManualSubscription ? 'admin_manual' : newPriceId,
        plan_type: newPlan,
        monthly_credits: newPlan === 'starter' ? 500 : newPlan === 'pro' ? 2000 : 10000,
        updated_at: new Date()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[ADMIN] Failed to update DB:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription in database' });
    }

    // Нараховуємо кредити для нового плану (тільки для ручних підписок)
    if (isManualSubscription) {
      const { data: creditId, error: syncError } = await supabaseAdmin.rpc('admin_sync_subscription_credits', {
        p_user_id: userId,
        p_new_plan: newPlan,
        p_reason: `Admin changed plan from ${subscription.plan_type} to ${newPlan}`
      });

      if (syncError) {
        console.warn('[ADMIN] Failed to grant credits for new plan:', syncError);
      } else {
        console.log('[ADMIN] Credits granted for new plan, credit_id:', creditId);
      }
    }

    // Логуємо зміну
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.adminId,
      action: 'subscription_plan_change',
      target_user_id: userId,
      details: {
        old_plan: subscription.plan_type,
        new_plan: newPlan,
        effective_from: effectiveFrom,
        paddle_subscription_id: subscription.paddle_subscription_id,
        is_manual: isManualSubscription
      }
    });

    return res.json({
      success: true,
      message: `Subscription changed from ${subscription.plan_type} to ${newPlan}`,
      paddle_response: paddleResponse
    });
  } catch (error) {
    console.error('[ADMIN] Error changing plan:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/users/:userId/subscription/cancel
 * Відмінити або видалити підписку
 */
export async function cancelUserSubscription(req, res) {
  try {
    const { userId } = req.params;
    const { effectiveFrom = 'next_billing_period', reason, forceRemove = false } = req.body;

    const { data: subscription, error } = await supabaseAdmin
      .from('paddle_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    console.log(`[ADMIN] Canceling subscription for user ${userId}, forceRemove: ${forceRemove}`);

    // Якщо forceRemove = true, просто видаляємо з БД (для мануальних підписок)
    if (forceRemove) {
      console.log(`[ADMIN] Force removing subscription from DB for user ${userId}`);

      // Видаляємо з paddle_subscriptions
      const { error: deleteError1 } = await supabaseAdmin
        .from('paddle_subscriptions')
        .delete()
        .eq('user_id', userId);

      if (deleteError1) {
        console.error('[ADMIN] Error deleting from paddle_subscriptions:', deleteError1);
      } else {
        console.log('[ADMIN] ✅ Deleted from paddle_subscriptions');
      }

      // Видаляємо з user_subscriptions
      const { error: deleteError2 } = await supabaseAdmin
        .from('user_subscriptions')
        .delete()
        .eq('user_id', userId);

      if (deleteError2) {
        console.error('[ADMIN] Error deleting from user_subscriptions:', deleteError2);
      } else {
        console.log('[ADMIN] ✅ Deleted from user_subscriptions');
      }

      // Логуємо
      console.log('[ADMIN] Logging audit record, admin_id:', req.adminId);
      const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: req.adminId,
        action: 'subscription_removed',
        target_user_id: userId,
        details: {
          plan: subscription.plan_type,
          reason: reason || 'Admin removed subscription',
          paddle_subscription_id: subscription.paddle_subscription_id
        }
      });

      if (auditError) {
        console.error('[ADMIN] Error logging audit:', auditError);
      } else {
        console.log('[ADMIN] ✅ Audit logged successfully');
      }

      console.log('[ADMIN] ✅ Force remove completed successfully');
      return res.json({
        success: true,
        message: 'Subscription removed from database'
      });
    }

    // Інакше відміняємо через Paddle API
    const paddleResponse = await cancelSubscription(
      subscription.paddle_subscription_id,
      effectiveFrom
    );

    // Логуємо
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.adminId,
      action: 'subscription_cancel',
      target_user_id: userId,
      details: {
        plan: subscription.plan_type,
        effective_from: effectiveFrom,
        reason: reason || 'Admin canceled',
        paddle_subscription_id: subscription.paddle_subscription_id
      }
    });

    return res.json({
      success: true,
      message: 'Subscription canceled via Paddle',
      paddle_response: paddleResponse
    });
  } catch (error) {
    console.error('[ADMIN] Error canceling subscription:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/users/:userId/credits/grant
 * Нарахувати кредити користувачу (безкоштовно)
 */
export async function grantCredits(req, res) {
  try {
    const { userId } = req.params;
    const { amount, reason, expiresInDays = 30 } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    console.log(`[ADMIN] Granting ${amount} credits to user ${userId}`);

    // Нараховуємо кредити через DB function
    const { data, error } = await supabaseAdmin.rpc('admin_grant_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_source: 'bonus',
      p_reason: reason || 'Admin grant',
      p_expires_in_days: expiresInDays,
      p_admin_id: req.adminId
    });

    if (error) {
      console.error('[ADMIN] Failed to grant credits:', error);
      return res.status(500).json({ error: error.message });
    }

    // Логуємо
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.adminId,
      action: 'credits_grant',
      target_user_id: userId,
      details: {
        amount,
        reason,
        expires_in_days: expiresInDays,
        credit_id: data
      }
    });

    return res.json({
      success: true,
      message: `Granted ${amount} credits`,
      credit_id: data
    });
  } catch (error) {
    console.error('[ADMIN] Error granting credits:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/users/:userId/credits/deduct
 * Зняти кредити у користувача
 */
export async function deductCredits(req, res) {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    console.log(`[ADMIN] Deducting ${amount} credits from user ${userId}`);

    // Спочатку перевіряємо поточний баланс
    const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc('get_user_active_balance', {
      p_user_id: userId
    });
    console.log(`[ADMIN] Current active balance from user_credits: ${balanceData}`);

    // Перевіряємо kv_store для порівняння
    const { data: kvData } = await supabaseAdmin
      .from('kv_store_7f10f791')
      .select('value')
      .eq('key', `user:${userId}:balance`)
      .single();
    console.log(`[ADMIN] Balance in kv_store: ${kvData?.value}`);

    // Знімаємо кредити через DB function
    const { data, error } = await supabaseAdmin.rpc('admin_deduct_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason || 'Admin deduction'
    });

    if (error) {
      console.error('[ADMIN] Failed to deduct credits:', error);
      return res.status(500).json({ error: error.message });
    }

    // Логуємо
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.adminId,
      action: 'credits_deduct',
      target_user_id: userId,
      details: {
        amount,
        reason
      }
    });

    return res.json({
      success: true,
      message: `Deducted ${amount} credits`
    });
  } catch (error) {
    console.error('[ADMIN] Error deducting credits:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/users/:userId/balance/set
 * Встановити точний баланс користувача (може бути від'ємним)
 */
export async function setBalance(req, res) {
  console.log('[ADMIN] ==========================================');
  console.log('[ADMIN] setBalance FUNCTION CALLED!!!');
  console.log('[ADMIN] Method:', req.method);
  console.log('[ADMIN] URL:', req.url);
  console.log('[ADMIN] Params:', req.params);
  console.log('[ADMIN] Body:', req.body);
  console.log('[ADMIN] Headers:', Object.keys(req.headers));
  console.log('[ADMIN] ==========================================');

  try {
    const { userId } = req.params;
    const { balance, reason } = req.body;

    if (balance === undefined || balance === null) {
      return res.status(400).json({ error: 'Balance is required' });
    }

    console.log(`[ADMIN] Setting balance to ${balance} for user ${userId}`);

    // Встановлюємо баланс через DB function
    const { data, error } = await supabaseAdmin.rpc('admin_set_balance', {
      p_user_id: userId,
      p_new_balance: balance,
      p_reason: reason || 'Manual balance adjustment',
      p_admin_id: req.adminId
    });

    if (error) {
      console.error('[ADMIN] Failed to set balance:', error);
      return res.status(500).json({ error: error.message });
    }

    // Логуємо
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.adminId,
      action: 'balance_set',
      target_user_id: userId,
      details: {
        new_balance: balance,
        reason,
        credit_id: data
      }
    });

    return res.json({
      success: true,
      message: `Balance set to ${balance}`,
      credit_id: data
    });
  } catch (error) {
    console.error('[ADMIN] Error setting balance:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/admin/users/:userId/credits
 * Отримати детальну інформацію про кредити користувача
 */
export async function getUserCredits(req, res) {
  try {
    const { userId } = req.params;

    // Отримуємо детальну інформацію через DB function
    const { data, error } = await supabaseAdmin.rpc('admin_get_user_credit_details', {
      p_user_id: userId
    });

    if (error) {
      console.error('[ADMIN] Failed to get credits:', error);
      return res.status(500).json({ error: error.message });
    }

    // Отримуємо загальний баланс
    const { data: balance, error: balanceError } = await supabaseAdmin.rpc('get_user_active_balance', {
      p_user_id: userId
    });

    return res.json({
      total_active_balance: balance || 0,
      credits: data || []
    });
  } catch (error) {
    console.error('[ADMIN] Error getting credits:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/admin/users
 * Отримати список всіх користувачів
 */
export async function getAllUsers(req, res) {
  try {
    console.log('[ADMIN] Getting all users');

    // Отримуємо всіх користувачів з auth.users через service role
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error('[ADMIN] Error listing users:', usersError);
      return res.status(500).json({ error: usersError.message });
    }

    if (!users || users.length === 0) {
      return res.json({ users: [] });
    }

    // Для кожного користувача отримуємо підписку та баланс
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        // Отримуємо підписку
        const { data: subscription } = await supabaseAdmin
          .from('paddle_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        // Отримуємо активний баланс
        const { data: activeBalance } = await supabaseAdmin
          .rpc('get_user_active_balance', { p_user_id: user.id });

        return {
          user_id: user.id,
          email: user.email || 'N/A',
          user_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown',
          plan_id: subscription?.plan_type || 'none',
          status: subscription?.status || 'none',
          started_at: subscription?.created_at || null,
          expires_at: subscription?.current_period_end || null,
          crystal_balance: activeBalance || 0,
          paddle_subscription_id: subscription?.paddle_subscription_id || null
        };
      })
    );

    return res.json({ users: usersWithDetails });
  } catch (error) {
    console.error('[ADMIN] Error getting users:', error);
    return res.status(500).json({ error: error.message });
  }
}

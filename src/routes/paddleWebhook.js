/**
 * Paddle Webhook Handler - Безпечна обробка платежів
 *
 * Захист:
 * - Signature verification
 * - Idempotency (захист від дублювання)
 * - Transaction logging
 * - Credit expiration (30 днів)
 * - Subscription monthly renewal
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

// Parse JSON env variables
let PRICE_MAP = {};
let CREDITS_MAP = {};

try {
  PRICE_MAP = JSON.parse(process.env.PADDLE_PRICE_MAP || '{}');
  CREDITS_MAP = JSON.parse(process.env.PADDLE_CREDITS_MAP || '{}');
} catch (error) {
  console.error('[PADDLE] Failed to parse env maps:', error);
}

// Mapping Price IDs до планів та кредитів
const SUBSCRIPTION_PLANS = {
  [PRICE_MAP.starter_month || 'pri_01kaseyhggrqz2x9j73ma2cwwc']: {
    plan: 'starter',
    credits: 500
  },
  [PRICE_MAP.standard_month || 'pri_01kasewrjdgwem95fc233cn9we']: {
    plan: 'pro',
    credits: 2000
  },
  [PRICE_MAP.pro_month || 'pri_01kasetbgrprt81dr7tfe69knx']: {
    plan: 'ultimate',
    credits: 10000
  }
};

const CREDIT_PACKS = {
  [CREDITS_MAP.pack_500 || 'pri_01kasjcz3c4zzk84jfhn18pen9']: {
    credits: 500,
    bonus: 0
  },
  [CREDITS_MAP.pack_2500 || 'pri_01kasjsv3wdxcbjjr8731skn88']: {
    credits: 2500,
    bonus: 100
  },
  [CREDITS_MAP.pack_5000 || 'pri_01kasjyt0kh2cw523fvp207dpd']: {
    credits: 5000,
    bonus: 300
  },
  [CREDITS_MAP.pack_10000 || 'pri_01kasjg4rf5j0qgmxsxqzv2f90']: {
    credits: 10000,
    bonus: 1000
  }
};

console.log('[PADDLE] Loaded subscription plans:', Object.keys(SUBSCRIPTION_PLANS));
console.log('[PADDLE] Loaded credit packs:', Object.keys(CREDIT_PACKS));

/**
 * Безпечне порівняння (timing attack protection)
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Paddle signature verification
 */
function verifyPaddleSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !PADDLE_WEBHOOK_SECRET) {
    console.error('[PADDLE] Missing signature or secret');
    return false;
  }

  try {
    const parts = Object.fromEntries(
      signatureHeader.split(';').map(p => {
        const [key, value] = p.trim().split('=');
        return [key, value];
      })
    );

    const ts = parts.ts;
    const h1 = parts.h1;

    if (!ts || !h1) {
      console.error('[PADDLE] Invalid signature format');
      return false;
    }

    const signedPayload = `${ts}:${rawBody}`;
    const computed = crypto
      .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
      .update(signedPayload, 'utf8')
      .digest('hex');

    return safeEqual(computed, h1);
  } catch (error) {
    console.error('[PADDLE] Signature verification error:', error);
    return false;
  }
}

/**
 * Перевірка та логування транзакції (idempotency)
 */
async function logTransaction(transactionId, eventType, userId, data) {
  const { data: existing } = await supabase
    .from('paddle_transactions')
    .select('id')
    .eq('id', transactionId)
    .single();

  if (existing) {
    console.log('[PADDLE] Transaction already processed:', transactionId);
    return false; // Вже оброблена
  }

  const { error } = await supabase
    .from('paddle_transactions')
    .insert({
      id: transactionId,
      event_type: eventType,
      user_id: userId,
      amount: data.details?.totals?.total / 100 || 0,
      currency: data.currency_code || 'USD',
      status: data.status,
      paddle_data: data
    });

  if (error) {
    console.error('[PADDLE] Failed to log transaction:', error);
    throw error;
  }

  return true; // Нова транзакція
}

/**
 * Обробка subscription.created - створення підписки
 */
async function handleSubscriptionCreated(data) {
  const subscriptionId = data.id;
  const customData = data.custom_data || {};
  const userId = customData.user_id;

  if (!userId) {
    console.error('[PADDLE] No user_id in subscription');
    return;
  }

  const items = data.items || [];
  if (items.length === 0) {
    console.error('[PADDLE] No items in subscription');
    return;
  }

  const priceId = items[0].price.id;
  const planInfo = SUBSCRIPTION_PLANS[priceId];

  if (!planInfo) {
    console.error('[PADDLE] Unknown subscription price:', priceId);
    return;
  }

  const periodStart = new Date(data.current_billing_period?.starts_at || Date.now());
  const periodEnd = new Date(data.current_billing_period?.ends_at || Date.now());

  console.log('[PADDLE] Creating subscription:', {
    userId,
    subscriptionId,
    plan: planInfo.plan,
    monthlyCredits: planInfo.credits
  });

  // SECURITY: Перевірка на downgrade attack
  const { data: existingSub } = await supabase
    .from('paddle_subscriptions')
    .select('plan_type')
    .eq('user_id', userId)
    .single();

  if (existingSub) {
    const planPriority = { 'starter': 1, 'pro': 2, 'ultimate': 3 };
    const existingPriority = planPriority[existingSub.plan_type] || 0;
    const newPriority = planPriority[planInfo.plan] || 0;

    if (newPriority < existingPriority) {
      console.error('[PADDLE] SECURITY: Potential downgrade attack detected', {
        existing: existingSub.plan_type,
        new: planInfo.plan,
        userId
      });
      // Дозволяємо тільки якщо це легітимний downgrade через Paddle UI
      // У production тут має бути додаткова перевірка через Paddle API
    }
  }

  // Створюємо/оновлюємо підписку в paddle_subscriptions (UPSERT по user_id)
  const { error: subError } = await supabase
    .from('paddle_subscriptions')
    .upsert({
      user_id: userId,
      paddle_subscription_id: subscriptionId,
      paddle_customer_id: data.customer_id,
      price_id: priceId,
      plan_type: planInfo.plan,
      status: data.status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      monthly_credits: planInfo.credits,
      last_credits_granted_at: null,
      metadata: { subscription_data: data }
    }, {
      onConflict: 'user_id'
    });

  if (subError) {
    console.error('[PADDLE] Failed to create paddle_subscription:', subError);
    throw subError;
  }

  // Синхронізуємо з user_subscriptions (для UI)
  const { error: userSubError } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_id: planInfo.plan,
      status: 'active',
      started_at: periodStart,
      expires_at: periodEnd
    }, {
      onConflict: 'user_id'
    });

  if (userSubError) {
    console.error('[PADDLE] Failed to sync user_subscription:', userSubError);
    throw userSubError;
  }

  console.log('[PADDLE] Subscription created and synced successfully');
}

/**
 * Обробка subscription.updated - оновлення статусу
 */
async function handleSubscriptionUpdated(data) {
  const subscriptionId = data.id;
  const status = data.status;
  const periodStart = data.current_billing_period?.starts_at;
  const periodEnd = data.current_billing_period?.ends_at;

  console.log('[PADDLE] Updating subscription:', {
    subscriptionId,
    status,
    periodStart,
    periodEnd
  });

  const { error } = await supabase
    .from('paddle_subscriptions')
    .update({
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at: data.scheduled_change?.action === 'cancel' ? data.scheduled_change.effective_at : null,
      canceled_at: status === 'canceled' ? new Date() : null,
      updated_at: new Date()
    })
    .eq('paddle_subscription_id', subscriptionId);

  if (error) {
    console.error('[PADDLE] Failed to update subscription:', error);
    throw error;
  }

  console.log('[PADDLE] Subscription updated successfully');
}

/**
 * Обробка transaction.completed - оплата пройшла
 */
async function handleTransactionCompleted(data) {
  const transactionId = data.id;
  const customData = data.custom_data || {};
  const userId = customData.user_id;

  if (!userId) {
    console.error('[PADDLE] No user_id in transaction');
    return;
  }

  // Логуємо транзакцію (idempotency check)
  const isNew = await logTransaction(transactionId, 'transaction.completed', userId, data);
  if (!isNew) {
    console.log('[PADDLE] Skipping already processed transaction');
    return;
  }

  const items = data.items || [];

  for (const item of items) {
    const priceId = item.price.id;
    const quantity = item.quantity || 1;

    // Перевіряємо чи це підписка
    if (SUBSCRIPTION_PLANS[priceId]) {
      await handleSubscriptionPayment(data, priceId, userId);
    }
    // Перевіряємо чи це одноразова покупка кредитів
    else if (CREDIT_PACKS[priceId]) {
      await handleCreditPurchase(transactionId, priceId, userId, quantity);
    }
    else {
      console.warn('[PADDLE] Unknown price ID:', priceId);
    }
  }
}

/**
 * Обробка оплати підписки - нарахування місячних кредитів
 */
async function handleSubscriptionPayment(data, priceId, userId) {
  const subscriptionId = data.subscription_id;

  if (!subscriptionId) {
    console.error('[PADDLE] No subscription_id in transaction');
    return;
  }

  const planInfo = SUBSCRIPTION_PLANS[priceId];
  const periodStart = new Date(data.billing_period?.starts_at || Date.now());
  const periodEnd = new Date(data.billing_period?.ends_at || Date.now());

  console.log('[PADDLE] Processing subscription payment:', {
    subscriptionId,
    userId,
    plan: planInfo.plan,
    credits: planInfo.credits,
    periodStart,
    periodEnd
  });

  // Нараховуємо кредити через DB function
  const { data: result, error } = await supabase.rpc('grant_subscription_credits', {
    p_paddle_subscription_id: subscriptionId,
    p_user_id: userId,
    p_plan_type: planInfo.plan,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString()
  });

  if (error) {
    console.error('[PADDLE] Failed to grant subscription credits:', error);
    throw error;
  }

  console.log('[PADDLE] Subscription credits granted:', result);
}

/**
 * Обробка одноразової покупки кредитів
 */
async function handleCreditPurchase(transactionId, priceId, userId, quantity = 1) {
  const packInfo = CREDIT_PACKS[priceId];

  console.log('[PADDLE] Processing credit purchase:', {
    transactionId,
    userId,
    credits: packInfo.credits,
    bonus: packInfo.bonus,
    quantity
  });

  // Обробляємо через DB function
  const { data: result, error } = await supabase.rpc('process_credit_purchase', {
    p_paddle_transaction_id: transactionId,
    p_user_id: userId,
    p_credits: packInfo.credits * quantity,
    p_bonus: packInfo.bonus * quantity,
    p_metadata: {
      price_id: priceId,
      quantity,
      purchase_date: new Date().toISOString()
    }
  });

  if (error) {
    console.error('[PADDLE] Failed to process credit purchase:', error);
    throw error;
  }

  console.log('[PADDLE] Credits purchased successfully:', result);
}

/**
 * Main webhook handler
 */
export async function handlePaddleWebhook(req, res) {
  const rawBody = req.rawBody;
  const sig = req.headers['paddle-signature'];

  // Перевірка підпису
  if (!verifyPaddleSignature(rawBody, sig)) {
    console.error('[PADDLE] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    console.error('[PADDLE] Failed to parse event:', e);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event.event_type;
  const data = event.data;

  console.log('[PADDLE WEBHOOK] Received event:', eventType, 'ID:', data.id);

  try {
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;

      case 'transaction.completed':
        await handleTransactionCompleted(data);
        break;

      case 'subscription.canceled':
        await handleSubscriptionUpdated(data);
        break;

      case 'transaction.payment_failed':
        console.log('[PADDLE] Payment failed:', data.id);
        break;

      default:
        console.log('[PADDLE] Unhandled event type:', eventType);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[PADDLE] Handler error:', error);
    return res.status(500).json({ error: 'Handler error' });
  }
}

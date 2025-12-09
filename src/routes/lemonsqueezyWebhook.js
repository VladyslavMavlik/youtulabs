/**
 * LemonSqueezy Webhook Handler
 *
 * Features:
 * - HMAC SHA256 signature verification
 * - Idempotency (duplicate prevention)
 * - Subscription lifecycle handling
 * - Auto-renewal credit grants
 * - Integration with Supabase
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// LemonSqueezy webhook signing secret (set in dashboard)
const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

// Variant IDs mapping (for webhook processing)
// Supports both Live Mode and Test Mode variant IDs
const VARIANT_PLANS = {
  // Live Mode IDs
  '720643': { plan: 'starter', credits: 2000, price: 8.00 },
  '720649': { plan: 'pro', credits: 6000, price: 19.99 },
  '720658': { plan: 'ultimate', credits: 20000, price: 49.99 },
  // Test Mode IDs
  '1134259': { plan: 'starter', credits: 2000, price: 8.00 },
  '1134267': { plan: 'pro', credits: 6000, price: 19.99 },
  '1134281': { plan: 'ultimate', credits: 20000, price: 49.99 }
};

// Checkout UUIDs for each plan (from LemonSqueezy dashboard "Share" button)
const CHECKOUT_UUIDS = {
  'starter': 'dcb0d828-011b-4d13-8488-657f944e680a',
  'pro': '4fdea4e7-2f14-465c-ade3-39c092b1f507',
  'ultimate': '560747c8-774d-48d0-860f-1a307f4e8f5c'
};

// Map variant IDs to plan names for checkout
const VARIANT_TO_PLAN = {
  '720643': 'starter',
  '720649': 'pro',
  '720658': 'ultimate'
};

console.log('[LEMONSQUEEZY] Loaded variant plans:', Object.keys(VARIANT_PLANS));

/**
 * Verify LemonSqueezy webhook signature
 * Uses HMAC SHA256 with X-Signature header
 */
function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader || !LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error('[LEMONSQUEEZY] Missing signature or secret');
    return false;
  }

  try {
    const computed = crypto
      .createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Timing-safe comparison
    const sigBuffer = Buffer.from(signatureHeader, 'utf8');
    const computedBuffer = Buffer.from(computed, 'utf8');

    if (sigBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, computedBuffer);
  } catch (error) {
    console.error('[LEMONSQUEEZY] Signature verification error:', error);
    return false;
  }
}

/**
 * Extract user_id from custom data
 */
function getUserId(payload) {
  // LemonSqueezy passes custom data in meta.custom_data
  const customData = payload.meta?.custom_data || {};
  return customData.user_id || null;
}

/**
 * Generate unique event ID for idempotency
 */
function generateEventId(payload, eventName) {
  // Use subscription_id + event_name + timestamp for uniqueness
  const subscriptionId = payload.data?.id || 'unknown';
  const timestamp = payload.meta?.event_name || eventName;
  const created = payload.data?.attributes?.created_at || Date.now();
  return `${subscriptionId}_${timestamp}_${created}`;
}

/**
 * Handle subscription_created event
 */
async function handleSubscriptionCreated(payload) {
  const eventId = generateEventId(payload, 'subscription_created');
  const attributes = payload.data?.attributes || {};
  const userId = getUserId(payload);

  if (!userId) {
    console.error('[LEMONSQUEEZY] No user_id in custom_data');
    return { success: false, error: 'Missing user_id' };
  }

  const subscriptionId = String(payload.data?.id);
  const variantId = String(attributes.variant_id);
  const status = attributes.status || 'active';

  // Record webhook first
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_created',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process subscription
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_subscription_created', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_variant_id: variantId,
    p_order_id: String(attributes.order_id || ''),
    p_customer_id: String(attributes.customer_id || ''),
    p_product_id: String(attributes.product_id || ''),
    p_status: status,
    p_renews_at: attributes.renews_at || null,
    p_ends_at: attributes.ends_at || null,
    p_current_period_start: attributes.created_at || null,
    p_current_period_end: attributes.renews_at || null,
    p_card_brand: attributes.card_brand || null,
    p_card_last_four: attributes.card_last_four || null,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_subscription_created error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Subscription created:', result);
  return result;
}

/**
 * Handle subscription_updated event
 */
async function handleSubscriptionUpdated(payload) {
  const eventId = generateEventId(payload, 'subscription_updated');
  const attributes = payload.data?.attributes || {};
  const subscriptionId = String(payload.data?.id);
  const userId = getUserId(payload);

  // Record webhook
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_updated',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process update
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_subscription_updated', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_status: attributes.status || 'active',
    p_renews_at: attributes.renews_at || null,
    p_ends_at: attributes.ends_at || null,
    p_current_period_start: attributes.created_at || null,
    p_current_period_end: attributes.renews_at || null,
    p_cancelled_at: attributes.cancelled ? new Date().toISOString() : null,
    p_pause_mode: attributes.pause?.mode || null,
    p_resumes_at: attributes.pause?.resumes_at || null,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_subscription_updated error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Subscription updated:', result);
  return result;
}

/**
 * Handle subscription_payment_success event (renewal)
 */
async function handlePaymentSuccess(payload) {
  const eventId = generateEventId(payload, 'subscription_payment_success');
  const attributes = payload.data?.attributes || {};
  const subscriptionId = String(attributes.subscription_id || payload.data?.id);
  const userId = getUserId(payload);

  // Record webhook
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_payment_success',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process payment success (grant credits)
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_payment_success', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_payment_success error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Payment success processed:', result);
  return result;
}

/**
 * Handle subscription_payment_failed event
 */
async function handlePaymentFailed(payload) {
  const eventId = generateEventId(payload, 'subscription_payment_failed');
  const attributes = payload.data?.attributes || {};
  const subscriptionId = String(attributes.subscription_id || payload.data?.id);
  const userId = getUserId(payload);

  // Record webhook
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_payment_failed',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process payment failure
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_payment_failed', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_payment_failed error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Payment failed processed:', result);
  return result;
}

/**
 * Handle subscription_cancelled event
 */
async function handleSubscriptionCancelled(payload) {
  const eventId = generateEventId(payload, 'subscription_cancelled');
  const attributes = payload.data?.attributes || {};
  const subscriptionId = String(payload.data?.id);
  const userId = getUserId(payload);

  // Record webhook
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_cancelled',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process cancellation
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_subscription_cancelled', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_ends_at: attributes.ends_at || null,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_subscription_cancelled error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Subscription cancelled:', result);
  return result;
}

/**
 * Handle subscription_expired event
 */
async function handleSubscriptionExpired(payload) {
  const eventId = generateEventId(payload, 'subscription_expired');
  const subscriptionId = String(payload.data?.id);
  const userId = getUserId(payload);

  // Record webhook
  await supabase.rpc('record_lemonsqueezy_webhook', {
    p_event_id: eventId,
    p_event_name: 'subscription_expired',
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_payload: payload
  });

  // Process expiration
  const { data: result, error } = await supabase.rpc('process_lemonsqueezy_subscription_expired', {
    p_event_id: eventId,
    p_subscription_id: subscriptionId,
    p_raw_data: payload
  });

  if (error) {
    console.error('[LEMONSQUEEZY] process_subscription_expired error:', error);
    return { success: false, error: error.message };
  }

  console.log('[LEMONSQUEEZY] Subscription expired:', result);
  return result;
}

/**
 * Main webhook handler
 */
export async function handleLemonSqueezyWebhook(req, res) {
  const rawBody = req.rawBody;
  const signature = req.headers['x-signature'];

  // Verify signature
  if (!verifySignature(rawBody, signature)) {
    console.error('[LEMONSQUEEZY] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    console.error('[LEMONSQUEEZY] Failed to parse payload:', e);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = payload.meta?.event_name;
  const subscriptionId = payload.data?.id;

  console.log('[LEMONSQUEEZY WEBHOOK] Received:', eventName, 'ID:', subscriptionId);

  try {
    let result;

    switch (eventName) {
      case 'subscription_created':
        result = await handleSubscriptionCreated(payload);
        break;

      case 'subscription_updated':
        result = await handleSubscriptionUpdated(payload);
        break;

      case 'subscription_payment_success':
        result = await handlePaymentSuccess(payload);
        break;

      case 'subscription_payment_failed':
        result = await handlePaymentFailed(payload);
        break;

      case 'subscription_cancelled':
        result = await handleSubscriptionCancelled(payload);
        break;

      case 'subscription_expired':
        result = await handleSubscriptionExpired(payload);
        break;

      case 'subscription_paused':
        // Handle as update
        result = await handleSubscriptionUpdated(payload);
        break;

      case 'subscription_unpaused':
        // Handle as update
        result = await handleSubscriptionUpdated(payload);
        break;

      case 'subscription_resumed':
        // Handle as update
        result = await handleSubscriptionUpdated(payload);
        break;

      default:
        console.log('[LEMONSQUEEZY] Unhandled event:', eventName);
        result = { success: true, note: 'Unhandled event type' };
    }

    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('[LEMONSQUEEZY] Handler error:', error);
    return res.status(500).json({ error: 'Handler error', message: error.message });
  }
}

/**
 * Generate checkout URL for LemonSqueezy
 * Uses UUID from dashboard "Share" button, not variant ID
 */
export function generateCheckoutUrl(variantId, userId, userEmail) {
  const storeSlug = process.env.LEMONSQUEEZY_STORE_SLUG || 'youtu-labs';

  // Get plan name from variant ID, then get checkout UUID
  const planName = VARIANT_TO_PLAN[variantId];
  if (!planName) {
    console.error('[LEMONSQUEEZY] Unknown variant ID:', variantId);
    throw new Error(`Unknown variant ID: ${variantId}`);
  }

  const checkoutUuid = CHECKOUT_UUIDS[planName];
  if (!checkoutUuid) {
    console.error('[LEMONSQUEEZY] No checkout UUID for plan:', planName);
    throw new Error(`No checkout UUID for plan: ${planName}`);
  }

  // Build checkout URL with custom data
  // Format: https://store.lemonsqueezy.com/buy/UUID?checkout[custom][user_id]=xxx
  const params = new URLSearchParams({
    'checkout[custom][user_id]': userId,
    'checkout[email]': userEmail || ''
  });

  const url = `https://${storeSlug}.lemonsqueezy.com/buy/${checkoutUuid}?${params.toString()}`;
  console.log('[LEMONSQUEEZY] Generated checkout URL for', planName, ':', url);

  return url;
}

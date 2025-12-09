import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();

// ============================================================================
// SECURITY: NOWPayments Signature Verification
// ============================================================================
/**
 * Verify IPN signature using Web Crypto API
 * NOWPayments використовує HMAC SHA512
 */
async function verifyNowpaymentsSignature(
  ipnData: any,
  receivedSignature: string,
  ipnSecret: string
): Promise<boolean> {
  try {
    // Сортуємо ключі та створюємо JSON string
    const sortedData = JSON.stringify(ipnData, Object.keys(ipnData).sort());

    // Конвертуємо secret та data в Uint8Array
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ipnSecret);
    const messageData = encoder.encode(sortedData);

    // Імпортуємо ключ для HMAC
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );

    // Обчислюємо HMAC
    const signature = await crypto.subtle.sign('HMAC', key, messageData);

    // Конвертуємо в hex string
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex === receivedSignature;
  } catch (error) {
    console.error('[SECURITY] Error verifying signature:', error);
    return false;
  }
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7f10f791/health", (c) => {
  return c.json({ status: "ok" });
});

// Get user balance
app.get("/make-server-7f10f791/balance", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Authorization error while getting balance:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let balance = await kv.get(`user:${user.id}:balance`);

    // Initialize balance if not exists (new user gets 100 credits)
    if (balance === null || balance === undefined) {
      balance = 100;
      await kv.set(`user:${user.id}:balance`, balance);
    }

    return c.json({ balance: balance || 0 });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Generate story
app.post("/make-server-7f10f791/generate", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Please login to generate stories' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Authorization error while generating story:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check balance
    const balance = await kv.get(`user:${user.id}:balance`) || 0;
    if (balance < 1) {
      return c.json({ error: 'Insufficient credits' }, 403);
    }

    const body = await c.req.json();

    // Simulate story generation (replace with actual API call)
    // This is a placeholder - you would integrate with your actual story generation API here
    const mockResults = {
      story: generateMockStory(body),
      titles: generateMockTitles(body),
      synopsis: generateMockSynopsis(body),
      quality: generateMockQualityReport(body.audioMode),
    };

    // Deduct 1 credit
    await kv.set(`user:${user.id}:balance`, balance - 1);

    return c.json(mockResults);
  } catch (error) {
    console.error('Error generating story:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Helper functions to generate mock data
function generateMockStory(params: any): string {
  return `In the realm of ${params.genre}, a tale unfolds in ${params.storyLanguage}.\n\nThe story begins with a mysterious atmosphere, setting the stage for what's to come. Characters emerge from the shadows, each with their own motivations and secrets.\n\nAs the narrative progresses, tensions rise and conflicts emerge. The protagonist faces challenges that test their resolve and character. Unexpected twists keep the reader engaged.\n\nIn the climactic moments, all threads come together. Revelations are made, and the true nature of the conflict becomes clear.\n\nThe story concludes with a resolution that reflects the journey undertaken, leaving a lasting impression on the reader.`;
}

function generateMockTitles(params: any): string[] {
  return [
    `The ${params.genre} Chronicles`,
    `Echoes of Destiny`,
    `Beyond the Veil`,
    `Whispers in the Dark`,
    `The Last Frontier`,
  ];
}

function generateMockSynopsis(params: any): string {
  return `A captivating ${params.genre} tale that explores the depths of human nature. Through compelling characters and intricate plot developments, this story weaves together themes of courage, redemption, and the eternal struggle between light and darkness. Set against a richly detailed backdrop, the narrative unfolds with emotional depth and dramatic intensity, leaving readers spellbound until the final page.`;
}

function generateMockQualityReport(audioMode: boolean) {
  const baseReport = {
    overall: 'good' as const,
    wordCount: {
      actual: 850,
      target: 900,
    },
    repetitionRate: 1.2,
    pacing: {
      good: true,
      issues: 0,
    },
  };

  if (audioMode) {
    return {
      ...baseReport,
      audioMetrics: {
        sentenceLength: 18,
        beatCompliance: 75,
        transitions: {
          count: 12,
          density: 1.4,
        },
        dialogueAttribution: 68,
      },
    };
  }

  return baseReport;
}

// ============================================================================
// NOWPayments Crypto Integration
// ============================================================================

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

// Credits mapping for subscription plans (matches frontend pricing)
const PLAN_CREDITS = {
  'starter': 2000,
  'pro': 6000,
  'ultimate': 20000,
} as const;

/**
 * Create cryptocurrency payment
 * POST /make-server-7f10f791/crypto-payment
 */
app.post("/make-server-7f10f791/crypto-payment", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      console.error('[CRYPTO] Authorization error:', authError);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    console.log('[CRYPTO] Creating payment for user:', user.id, 'plan:', body.plan_type || 'credits');

    // ✋ VALIDATION: NOWPayments minimum amount is $19.18 due to payment gateway fees
    const CRYPTO_MIN_AMOUNT = 19.18;
    if (body.price_amount < CRYPTO_MIN_AMOUNT) {
      console.error('[CRYPTO] BLOCKED: Payment amount too low:', {
        amount: body.price_amount,
        minimum: CRYPTO_MIN_AMOUNT,
        user_id: user.id,
        plan: body.plan_type
      });
      return c.json({
        error: 'Minimum payment amount not met',
        message: `Cryptocurrency payment requires minimum $${CRYPTO_MIN_AMOUNT} due to payment gateway fees. Please choose a higher plan or use card payment.`,
        minimum_amount: CRYPTO_MIN_AMOUNT,
        provided_amount: body.price_amount
      }, 400);
    }

    // Create payment in NOWPayments
    const nowpaymentsKey = Deno.env.get('NOWPAYMENTS_API_KEY');
    if (!nowpaymentsKey) {
      console.error('[CRYPTO] NOWPAYMENTS_API_KEY not configured');
      return c.json({ error: 'Payment system not configured' }, 500);
    }

    // Формуємо payload для NOWPayments (без plan_type та credits_amount)
    const nowpaymentsPayload = {
      price_amount: body.price_amount,
      price_currency: body.price_currency,
      pay_currency: body.pay_currency,
      ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-7f10f791/nowpayments-webhook`,
      order_id: body.order_id || `${user.id}-${Date.now()}`,
      order_description: body.order_description || 'Genisss Subscription'
    };

    console.log('[CRYPTO] NOWPayments payload:', nowpaymentsPayload);

    const response = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': nowpaymentsKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nowpaymentsPayload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[CRYPTO] NOWPayments API error:', errorData);
      return c.json({
        message: errorData.message || 'Failed to create payment',
        error: errorData
      }, response.status);
    }

    const paymentData = await response.json();
    console.log('[CRYPTO] Payment created:', paymentData.payment_id);

    // Store payment in Supabase
    const { error: dbError } = await supabase
      .from('crypto_payments')
      .insert({
        payment_id: paymentData.payment_id,
        user_id: user.id,
        amount_usd: body.price_amount,
        crypto_currency: body.pay_currency,
        crypto_amount: paymentData.pay_amount,
        payment_address: paymentData.pay_address,
        plan_type: body.plan_type,
        credits_amount: body.credits_amount,
        order_id: paymentData.order_id,
        status: 'waiting',
        processed: false,
        nowpayments_data: paymentData
      });

    if (dbError) {
      console.error('[CRYPTO] Database error:', dbError);
      // Continue anyway - payment is created in NOWPayments
    }

    return c.json(paymentData);
  } catch (error) {
    console.error('[CRYPTO] Create payment error:', error);
    return c.json({
      message: 'Internal server error',
      error: error.message
    }, 500);
  }
});

/**
 * NOWPayments webhook handler
 * POST /make-server-7f10f791/nowpayments-webhook
 *
 * Security: NOWPayments sends IPN callbacks when payment status changes
 * This endpoint must be publicly accessible (no auth required)
 */
app.post("/make-server-7f10f791/nowpayments-webhook", async (c) => {
  try {
    const payment = await c.req.json();
    const receivedSignature = c.req.header('x-nowpayments-sig');

    console.log('[CRYPTO WEBHOOK] Received notification:', {
      payment_id: payment.payment_id,
      status: payment.payment_status,
      amount: payment.pay_amount,
      currency: payment.pay_currency,
      has_signature: !!receivedSignature
    });

    // SECURITY: Verify NOWPayments signature
    const IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET');

    if (IPN_SECRET && receivedSignature) {
      const isValid = await verifyNowpaymentsSignature(payment, receivedSignature, IPN_SECRET);
      if (!isValid) {
        console.error('[CRYPTO WEBHOOK] ❌ INVALID SIGNATURE - Possible fraud attempt!');
        return c.json({ error: 'Invalid signature' }, 401);
      }
      console.log('[CRYPTO WEBHOOK] ✅ Signature verified');
    } else if (!IPN_SECRET) {
      console.warn('[CRYPTO WEBHOOK] ⚠️ IPN_SECRET not configured - skipping signature verification (UNSAFE!)');
    } else if (!receivedSignature) {
      console.error('[CRYPTO WEBHOOK] ❌ No signature provided - rejecting request');
      return c.json({ error: 'Missing signature' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Update payment status in database
    const { data: existingPayment, error: fetchError } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('payment_id', payment.payment_id)
      .single();

    if (fetchError || !existingPayment) {
      console.error('[CRYPTO WEBHOOK] Payment not found in database:', payment.payment_id);
      return c.json({ message: 'OK' }); // Still return OK to NOWPayments
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from('crypto_payments')
      .update({
        status: payment.payment_status,
        nowpayments_data: payment,
        updated_at: new Date().toISOString()
      })
      .eq('payment_id', payment.payment_id);

    if (updateError) {
      console.error('[CRYPTO WEBHOOK] Failed to update payment status:', updateError);
    }

    // Process confirmed payments (idempotency - check if already processed)
    if ((payment.payment_status === 'finished' || payment.payment_status === 'confirmed') && !existingPayment.processed) {
      console.log('[CRYPTO WEBHOOK] Processing confirmed payment:', payment.payment_id);

      let creditsToGrant = 0;
      let isSubscription = false;

      // ПІДПИСКА: кредити згорають через 30 днів
      if (existingPayment.plan_type) {
        isSubscription = true;
        creditsToGrant = PLAN_CREDITS[existingPayment.plan_type as keyof typeof PLAN_CREDITS] || 0;
        console.log('[CRYPTO WEBHOOK] 📅 Subscription payment detected:', existingPayment.plan_type);
      }
      // ОКРЕМА ПОКУПКА: кредити вічні (не згорають)
      else if (existingPayment.credits_amount) {
        isSubscription = false;
        creditsToGrant = existingPayment.credits_amount;
        console.log('[CRYPTO WEBHOOK] 💎 One-time credits purchase detected');
      }

      if (creditsToGrant > 0) {
        // Get current balance from KV store
        const currentBalance = await kv.get(`user:${existingPayment.user_id}:balance`) || 0;
        const newBalance = currentBalance + creditsToGrant;

        // Update balance in KV store
        await kv.set(`user:${existingPayment.user_id}:balance`, newBalance);

        if (isSubscription) {
          // ПІДПИСКА: використовуємо SQL функцію для обробки
          // Це створить запис в crypto_subscription_credits з expires_at
          const { error: subscriptionError } = await supabase.rpc('process_crypto_subscription_payment', {
            p_payment_id: payment.payment_id,
            p_user_id: existingPayment.user_id,
            p_plan_type: existingPayment.plan_type,
            p_credits_amount: creditsToGrant
          });

          if (subscriptionError) {
            console.error('[CRYPTO WEBHOOK] ❌ Failed to process subscription:', subscriptionError);
            // Відкат балансу
            await kv.set(`user:${existingPayment.user_id}:balance`, currentBalance);
            return c.json({ message: 'OK' }); // Все одно повертаємо OK для NOWPayments
          }

          console.log('[CRYPTO WEBHOOK] ✅ Subscription processed (30 days expiration):', {
            payment_id: payment.payment_id,
            user_id: existingPayment.user_id,
            plan_type: existingPayment.plan_type,
            credits_granted: creditsToGrant,
            new_balance: newBalance,
            expires_in_days: 30
          });
        } else {
          // ОКРЕМА ПОКУПКА: просто маркуємо як оброблену
          // Кредити вже додані в kv_store, вони вічні
          await supabase
            .from('crypto_payments')
            .update({
              processed: true,
              processed_at: new Date().toISOString()
            })
            .eq('payment_id', payment.payment_id);

          console.log('[CRYPTO WEBHOOK] ✅ One-time purchase processed (permanent credits):', {
            payment_id: payment.payment_id,
            user_id: existingPayment.user_id,
            credits_granted: creditsToGrant,
            new_balance: newBalance,
            permanent: true
          });
        }
      } else {
        console.error('[CRYPTO WEBHOOK] ❌ No credits to grant for payment:', payment.payment_id);
      }
    } else if (existingPayment.processed) {
      console.log('[CRYPTO WEBHOOK] Payment already processed (idempotency):', payment.payment_id);
    }

    // Обробка PARTIALLY_PAID статусу (недоплата)
    if (payment.payment_status === 'partially_paid') {
      console.warn('[CRYPTO WEBHOOK] ⚠️ PARTIALLY PAID:', {
        payment_id: payment.payment_id,
        user_id: existingPayment.user_id,
        expected: payment.price_amount,
        received: payment.actually_paid,
        currency: payment.pay_currency,
        message: 'User underpaid! Credits NOT granted. Waiting for full payment or refund.'
      });
      // НЕ даємо кредити - чекаємо повної оплати або повернення
    }

    // Обробка EXPIRED статусу (час оплати вийшов)
    if (payment.payment_status === 'expired') {
      console.warn('[CRYPTO WEBHOOK] ⏰ EXPIRED:', {
        payment_id: payment.payment_id,
        user_id: existingPayment.user_id,
        message: 'Payment window expired. User did not send funds in time.'
      });
    }

    // Обробка FAILED статусу
    if (payment.payment_status === 'failed') {
      console.error('[CRYPTO WEBHOOK] ❌ FAILED:', {
        payment_id: payment.payment_id,
        user_id: existingPayment.user_id,
        message: 'Payment failed. Check NOWPayments dashboard for details.'
      });
    }

    // Обробка REFUNDED статусу
    if (payment.payment_status === 'refunded') {
      console.warn('[CRYPTO WEBHOOK] 🔄 REFUNDED:', {
        payment_id: payment.payment_id,
        user_id: existingPayment.user_id,
        was_processed: existingPayment.processed,
        message: 'Payment was refunded. If credits were granted, they should be manually revoked by admin.'
      });
      // TODO: Автоматично віднімати кредити при refund (якщо були надані)
      // Зараз просто логуємо - адмін має вручну перевірити
    }

    return c.json({ message: 'OK' });
  } catch (error) {
    console.error('[CRYPTO WEBHOOK] Webhook processing error:', error);
    // Always return OK to NOWPayments to prevent retries
    return c.json({ message: 'OK' });
  }
});

/**
 * Get payment status
 * GET /make-server-7f10f791/crypto-payment/:paymentId
 */
app.get("/make-server-7f10f791/crypto-payment/:paymentId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const paymentId = c.req.param('paymentId');
    console.log('[CRYPTO] Getting payment status:', paymentId);

    // Get from Supabase database
    const { data: dbPayment, error: dbError } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('payment_id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (dbError || !dbPayment) {
      // If not in database, query NOWPayments directly
      const nowpaymentsKey = Deno.env.get('NOWPAYMENTS_API_KEY');
      if (!nowpaymentsKey) {
        return c.json({ error: 'Payment system not configured' }, 500);
      }

      const response = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
        headers: {
          'x-api-key': nowpaymentsKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return c.json({
          message: errorData.message || 'Failed to get payment status',
          error: errorData
        }, response.status);
      }

      const paymentData = await response.json();
      return c.json(paymentData);
    }

    // Return from database
    return c.json({
      payment_id: dbPayment.payment_id,
      payment_status: dbPayment.status,
      pay_address: dbPayment.payment_address,
      pay_amount: dbPayment.crypto_amount,
      pay_currency: dbPayment.crypto_currency,
      price_amount: dbPayment.amount_usd,
      price_currency: 'usd',
      order_id: dbPayment.order_id,
      created_at: dbPayment.created_at,
      updated_at: dbPayment.updated_at,
      processed: dbPayment.processed,
      ...dbPayment.nowpayments_data
    });
  } catch (error) {
    console.error('[CRYPTO] Get status error:', error);
    return c.json({
      message: 'Internal server error',
      error: error.message
    }, 500);
  }
});

Deno.serve(app.fetch);

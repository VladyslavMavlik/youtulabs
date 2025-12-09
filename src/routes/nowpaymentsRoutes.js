/**
 * NOWPayments Crypto Routes
 * Handles cryptocurrency payments via NOWPayments API
 *
 * Endpoints:
 * - POST /api/crypto/create-payment - Create new payment
 * - GET /api/crypto/payment/:orderId - Get payment status
 * - POST /api/crypto/webhook - Handle NOWPayments IPN callbacks
 * - GET /api/crypto/payments - Get user's payments
 */

import express from 'express';
import { authenticateUser, supabaseAdmin } from '../server.js';
import {
  createPayment,
  createInvoice,
  getPaymentStatus,
  getInvoiceStatus,
  verifyIpnSignature,
  parseIpnData,
  isPaymentSuccessful,
  isPaymentPending,
  PAYMENT_STATUSES
} from '../utils/nowpaymentsClient.js';

const router = express.Router();

// Payment plans configuration (synchronized with Paddle prices)
// FOR SUBSCRIPTIONS (credits expire after 30 days)
const PAYMENT_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    price_usd: 8,
    crystals: 2000,
    description: '2,000 crystals for $8'
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price_usd: 19.99,
    crystals: 6000,
    description: '6,000 crystals for $19.99'
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate Plan',
    price_usd: 49.99,
    crystals: 20000,
    description: '20,000 crystals for $49.99'
  }
};

// Credit packs configuration (synchronized with CreditsPage.tsx)
// FOR ONE-TIME PURCHASES (permanent credits - never expire)
const CREDIT_PACKS = {
  pack_500: {
    id: 'pack_500',
    name: '500 Crystals',
    price_usd: 3.00,
    crystals: 500,
    bonus: 0,
    total: 500, // crystals + bonus
    description: '500 crystals for $3.00'
  },
  pack_1000: {
    id: 'pack_1000',
    name: '1,000 Crystals',
    price_usd: 5.00,
    crystals: 1000,
    bonus: 0,
    total: 1000,
    description: '1,000 crystals for $5.00'
  },
  pack_2500: {
    id: 'pack_2500',
    name: '2,500 Crystals',
    price_usd: 14.40,
    crystals: 2500,
    bonus: 100,
    total: 2600,
    description: '2,600 crystals (2,500 + 100 bonus) for $14.40'
  },
  pack_5000: {
    id: 'pack_5000',
    name: '5,000 Crystals',
    price_usd: 27.60,
    crystals: 5000,
    bonus: 300,
    total: 5300,
    description: '5,300 crystals (5,000 + 300 bonus) for $27.60'
  },
  pack_10000: {
    id: 'pack_10000',
    name: '10,000 Crystals',
    price_usd: 54.00,
    crystals: 10000,
    bonus: 1000,
    total: 11000,
    description: '11,000 crystals (10,000 + 1,000 bonus) for $54.00'
  },
  pack_25000: {
    id: 'pack_25000',
    name: '25,000 Crystals',
    price_usd: 110.00,
    crystals: 25000,
    bonus: 3000,
    total: 28000,
    description: '28,000 crystals (25,000 + 3,000 bonus) for $110.00'
  }
};

// NOWPayments API configuration
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const CALLBACK_URL = process.env.NOWPAYMENTS_CALLBACK_URL || 'https://youtulabs.com/api/crypto/webhook';

if (!NOWPAYMENTS_API_KEY) {
  console.warn('[NOWPAYMENTS] ⚠️  NOWPAYMENTS_API_KEY not configured. Crypto payments will be unavailable.');
}

/**
 * POST /api/crypto/create-payment
 * Create new cryptocurrency payment
 *
 * Body:
 * {
 *   plan_id: 'starter' | 'pro' | 'ultimate',
 *   pay_currency: 'btc' | 'eth' | 'usdt' | ... (optional, empty = any crypto)
 * }
 */
router.post('/create-payment', authenticateUser, async (req, res) => {
  try {
    console.log('[NOWPAYMENTS] Received create-payment request:', req.body);
    const { plan_id, pay_currency } = req.body;
    const userId = req.user.id;
    console.log('[NOWPAYMENTS] User ID:', userId);
    console.log('[NOWPAYMENTS] API Key configured:', !!NOWPAYMENTS_API_KEY);

    if (!NOWPAYMENTS_API_KEY) {
      console.error('[NOWPAYMENTS] API Key not configured!');
      return res.status(503).json({
        error: 'Crypto payments unavailable',
        detail: 'NOWPAYMENTS_API_KEY not configured'
      });
    }

    // Validate plan_id
    if (!PAYMENT_PLANS[plan_id]) {
      return res.status(400).json({
        error: 'Invalid plan',
        detail: `Plan must be one of: ${Object.keys(PAYMENT_PLANS).join(', ')}`
      });
    }

    const plan = PAYMENT_PLANS[plan_id];

    // Generate unique order ID
    const orderId = `YTL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('[NOWPAYMENTS] Creating payment:', {
      userId: userId.substring(0, 8),
      planId: plan_id,
      orderId,
      amount: plan.price_usd,
      crystals: plan.crystals,
      payCurrency: pay_currency || 'any'
    });

    // Create payment record in database
    const { data: paymentRecord, error: dbError } = await supabaseAdmin
      .from('crypto_payments')
      .insert({
        payment_id: orderId, // Will be updated with NOWPayments payment_id after invoice creation
        user_id: userId,
        order_id: orderId,
        plan_type: plan_id,
        amount_usd: plan.price_usd,
        credits_amount: plan.crystals, // ВАЖЛИВО: для підписок теж треба!
        crypto_currency: pay_currency || 'any',
        crypto_amount: 0, // Will be updated by webhook
        payment_address: '', // Will be updated by webhook
        status: 'waiting',
        nowpayments_data: {
          payment_type: 'subscription',
          plan_id: plan_id,
          crystals: plan.crystals
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error('[NOWPAYMENTS] Database error:', dbError);
      return res.status(500).json({
        error: 'Failed to create payment record',
        detail: dbError.message
      });
    }

    // Create payment in NOWPayments
    try {
      const payment = await createPayment({
        price_amount: plan.price_usd,
        price_currency: 'USD',
        pay_currency: pay_currency, // REQUIRED for /payment endpoint
        order_id: orderId,
        order_description: `${plan.name} - ${plan.crystals} crystals`,
        ipn_callback_url: CALLBACK_URL
      }, NOWPAYMENTS_API_KEY);

      // Update payment record with NOWPayments data
      // MERGE: зберігаємо початкові дані (payment_type, pack_id) + додаємо дані від API
      await supabaseAdmin
        .from('crypto_payments')
        .update({
          payment_id: payment.payment_id.toString(),
          payment_address: payment.pay_address,
          crypto_amount: payment.pay_amount,
          nowpayments_data: {
            ...paymentRecord.nowpayments_data, // Зберігаємо payment_type, pack_id, base_crystals, etc
            ...payment // Додаємо дані від NOWPayments API
          }
        })
        .eq('order_id', orderId);

      console.log('[NOWPAYMENTS] ✅ Payment created:', {
        orderId,
        paymentId: payment.payment_id,
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount
      });

      // Return payment data to frontend
      res.json({
        success: true,
        payment: {
          order_id: orderId,
          payment_id: payment.payment_id,
          pay_address: payment.pay_address,
          pay_amount: payment.pay_amount,
          pay_currency: payment.pay_currency,
          amount_usd: plan.price_usd,
          crystals_amount: plan.crystals,
          plan_id: plan_id,
          plan_name: plan.name,
          status: 'waiting'
        }
      });
    } catch (apiError) {
      console.error('[NOWPAYMENTS] API error:', apiError);

      // Delete payment record on API error
      await supabaseAdmin
        .from('crypto_payments')
        .delete()
        .eq('order_id', orderId);

      return res.status(500).json({
        error: 'Failed to create payment invoice',
        detail: apiError.message
      });
    }
  } catch (error) {
    console.error('[NOWPAYMENTS] ❌ Error creating payment:', error);
    console.error('[NOWPAYMENTS] Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * POST /api/crypto/create-credit-pack-payment
 * Create new cryptocurrency payment for CREDIT PACKS (permanent credits)
 *
 * Body:
 * {
 *   pack_id: 'pack_500' | 'pack_1000' | 'pack_2500' | ...
 *   pay_currency: 'btc' | 'eth' | 'usdt' | ... (optional, empty = any crypto)
 * }
 */
router.post('/create-credit-pack-payment', authenticateUser, async (req, res) => {
  try {
    console.log('[NOWPAYMENTS] Received create-credit-pack-payment request:', req.body);
    const { pack_id, pay_currency } = req.body;
    const userId = req.user.id;
    console.log('[NOWPAYMENTS] User ID:', userId);
    console.log('[NOWPAYMENTS] API Key configured:', !!NOWPAYMENTS_API_KEY);

    if (!NOWPAYMENTS_API_KEY) {
      console.error('[NOWPAYMENTS] API Key not configured!');
      return res.status(503).json({
        error: 'Crypto payments unavailable',
        detail: 'NOWPAYMENTS_API_KEY not configured'
      });
    }

    // Validate pack_id
    if (!CREDIT_PACKS[pack_id]) {
      return res.status(400).json({
        error: 'Invalid credit pack',
        detail: `Pack must be one of: ${Object.keys(CREDIT_PACKS).join(', ')}`
      });
    }

    const pack = CREDIT_PACKS[pack_id];

    // Generate unique order ID
    const orderId = `YTL-PACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('[NOWPAYMENTS] Creating credit pack payment:', {
      userId: userId.substring(0, 8),
      packId: pack_id,
      orderId,
      amount: pack.price_usd,
      totalCrystals: pack.total,
      baseCrystals: pack.crystals,
      bonus: pack.bonus,
      payCurrency: pay_currency || 'any'
    });

    // Create payment record in database
    const { data: paymentRecord, error: dbError } = await supabaseAdmin
      .from('crypto_payments')
      .insert({
        payment_id: orderId, // Will be updated with NOWPayments payment_id
        user_id: userId,
        order_id: orderId,
        plan_type: null, // NULL for credit packs (plan_type is only for subscriptions)
        amount_usd: pack.price_usd,
        credits_amount: pack.total, // TOTAL including bonus
        crypto_currency: pay_currency || 'any',
        crypto_amount: 0, // Will be updated by webhook
        payment_address: '', // Will be updated by webhook
        status: 'waiting',
        nowpayments_data: {
          payment_type: 'credit_pack',
          pack_id: pack_id,
          base_crystals: pack.crystals,
          bonus_crystals: pack.bonus,
          total_crystals: pack.total,
          is_permanent: true // ВАЖЛИВО: ці кредити не згорають
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error('[NOWPAYMENTS] Database error:', dbError);
      return res.status(500).json({
        error: 'Failed to create payment record',
        detail: dbError.message
      });
    }

    // Create payment in NOWPayments
    try {
      const payment = await createPayment({
        price_amount: pack.price_usd,
        price_currency: 'USD',
        pay_currency: pay_currency,
        order_id: orderId,
        order_description: `${pack.name} - ${pack.total} crystals (${pack.crystals} + ${pack.bonus} bonus)`,
        ipn_callback_url: CALLBACK_URL
      }, NOWPAYMENTS_API_KEY);

      // Update payment record with NOWPayments data
      // MERGE: зберігаємо початкові дані (payment_type, pack_id) + додаємо дані від API
      await supabaseAdmin
        .from('crypto_payments')
        .update({
          payment_id: payment.payment_id.toString(),
          payment_address: payment.pay_address,
          crypto_amount: payment.pay_amount,
          nowpayments_data: {
            ...paymentRecord.nowpayments_data, // Зберігаємо payment_type, pack_id, base_crystals, etc
            ...payment // Додаємо дані від NOWPayments API
          }
        })
        .eq('order_id', orderId);

      console.log('[NOWPAYMENTS] ✅ Credit pack payment created:', {
        orderId,
        paymentId: payment.payment_id,
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        totalCrystals: pack.total
      });

      // Return payment data to frontend
      res.json({
        success: true,
        payment: {
          order_id: orderId,
          payment_id: payment.payment_id,
          pay_address: payment.pay_address,
          pay_amount: payment.pay_amount,
          pay_currency: payment.pay_currency,
          amount_usd: pack.price_usd,
          credits_amount: pack.total, // TOTAL including bonus
          base_crystals: pack.crystals,
          bonus_crystals: pack.bonus,
          pack_id: pack_id,
          pack_name: pack.name,
          status: 'waiting',
          is_permanent: true
        }
      });
    } catch (apiError) {
      console.error('[NOWPAYMENTS] API error:', apiError);

      // Delete payment record on API error
      await supabaseAdmin
        .from('crypto_payments')
        .delete()
        .eq('order_id', orderId);

      return res.status(500).json({
        error: 'Failed to create payment invoice',
        detail: apiError.message
      });
    }
  } catch (error) {
    console.error('[NOWPAYMENTS] ❌ Error creating credit pack payment:', error);
    console.error('[NOWPAYMENTS] Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * GET /api/crypto/payment/:orderId
 * Get payment status by order ID
 */
router.get('/payment/:orderId', authenticateUser, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Get payment from database
    const { data: payment, error: dbError } = await supabaseAdmin
      .from('crypto_payments')
      .select('*')
      .eq('order_id', orderId)
      .eq('user_id', userId) // Ensure user owns this payment
      .single();

    if (dbError || !payment) {
      return res.status(404).json({
        error: 'Payment not found',
        detail: 'No payment found with this order ID'
      });
    }

    res.json({
      success: true,
      payment: {
        order_id: payment.order_id,
        payment_id: payment.payment_id,
        amount_usd: payment.amount_usd,
        crypto_currency: payment.crypto_currency,
        crypto_amount: payment.crypto_amount,
        payment_address: payment.payment_address,
        plan_type: payment.plan_type,
        status: payment.status,
        processed: payment.processed,
        created_at: payment.created_at
      }
    });
  } catch (error) {
    console.error('[NOWPAYMENTS] Error getting payment:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * POST /api/crypto/webhook
 * Handle IPN callback from NOWPayments
 * This endpoint is called by NOWPayments when payment status changes
 *
 * NO AUTHENTICATION - Called by NOWPayments servers
 *
 * Improvements:
 * - Stores all webhooks in crypto_webhooks table (audit trail)
 * - Idempotent processing (duplicate detection)
 * - Immediate response to NOWPayments (async processing)
 * - Better error handling
 */
router.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  let webhookId = null;

  try {
    const ipnData = req.body;
    const receivedSignature = req.headers['x-nowpayments-sig'];

    console.log('[NOWPAYMENTS IPN] 📥 Received webhook:', {
      orderId: ipnData.order_id,
      paymentId: ipnData.payment_id,
      status: ipnData.payment_status,
      signature: receivedSignature?.substring(0, 10) + '...'
    });

    // ========================================================================
    // STEP 1: Validate configuration
    // ========================================================================
    if (!NOWPAYMENTS_API_KEY) {
      console.error('[NOWPAYMENTS IPN] ❌ NOWPAYMENTS_API_KEY not configured');
      return res.status(503).json({ error: 'Crypto payments not configured' });
    }

    // ========================================================================
    // STEP 2: Verify signature (HMAC SHA512)
    // ========================================================================
    let signatureVerified = false;

    if (NOWPAYMENTS_IPN_SECRET && receivedSignature) {
      const isValid = verifyIpnSignature(ipnData, receivedSignature, NOWPAYMENTS_IPN_SECRET);
      if (!isValid) {
        console.error('[NOWPAYMENTS IPN] ❌ Invalid signature');

        // Store failed webhook attempt
        await supabaseAdmin
          .from('crypto_webhooks')
          .insert({
            payment_id: ipnData.payment_id || 'unknown',
            order_id: ipnData.order_id,
            payment_status: ipnData.payment_status || 'unknown',
            signature: receivedSignature,
            signature_verified: false,
            raw_data: ipnData,
            processed: false,
            processing_error: 'Invalid HMAC signature'
          });

        return res.status(401).json({ error: 'Invalid signature' });
      }
      signatureVerified = true;
      console.log('[NOWPAYMENTS IPN] ✅ Signature verified');
    } else if (!NOWPAYMENTS_IPN_SECRET) {
      console.warn('[NOWPAYMENTS IPN] ⚠️  IPN_SECRET not configured - skipping signature verification');
      signatureVerified = false; // Not verified, but we'll process anyway
    }

    const parsedData = parseIpnData(ipnData);

    // ========================================================================
    // STEP 3: Process webhook using RPC function (idempotent)
    // ========================================================================
    try {
      const { data: processedWebhookId, error: rpcError } = await supabaseAdmin
        .rpc('process_nowpayments_webhook', {
          p_payment_id: parsedData.paymentId,
          p_order_id: parsedData.orderId,
          p_payment_status: parsedData.paymentStatus,
          p_signature: receivedSignature || null,
          p_signature_verified: signatureVerified,
          p_raw_data: ipnData
        });

      if (rpcError) {
        console.error('[NOWPAYMENTS IPN] ❌ RPC error:', rpcError);

        // If payment not found, respond with 404
        if (rpcError.message?.includes('Payment not found')) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        throw rpcError;
      }

      webhookId = processedWebhookId;
      console.log('[NOWPAYMENTS IPN] ✅ Webhook stored:', webhookId);

    } catch (rpcError) {
      console.error('[NOWPAYMENTS IPN] ❌ Failed to process webhook:', rpcError);

      // Respond to NOWPayments even on error (to prevent retries)
      return res.status(200).json({
        success: false,
        error: rpcError.message
      });
    }

    // ========================================================================
    // STEP 4: Respond to NOWPayments IMMEDIATELY
    // ========================================================================
    const processingTime = Date.now() - startTime;
    res.json({ success: true });
    console.log('[NOWPAYMENTS IPN] ✅ Response sent to NOWPayments (' + processingTime + 'ms)');
    console.log('[NOWPAYMENTS IPN] ✅ Webhook processing complete (credits granted via RPC)');

  } catch (error) {
    console.error('[NOWPAYMENTS IPN] ❌ Critical error:', error);
    console.error('[NOWPAYMENTS IPN] Stack:', error.stack);

    // Only send error response if we haven't responded yet
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        detail: error.message
      });
    }
  }
});

/**
 * GET /api/crypto/plans
 * Get available payment plans
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: Object.values(PAYMENT_PLANS)
  });
});

/**
 * GET /api/crypto/currencies
 * Get list of supported cryptocurrencies
 */
router.get('/currencies', (req, res) => {
  // Top cryptocurrencies supported by NOWPayments
  const currencies = [
    { code: 'btc', name: 'Bitcoin', network: 'bitcoin' },
    { code: 'eth', name: 'Ethereum', network: 'ethereum' },
    { code: 'usdttrc20', name: 'Tether (TRC20)', network: 'tron' },
    { code: 'usdterc20', name: 'Tether (ERC20)', network: 'ethereum' },
    { code: 'bnb', name: 'BNB', network: 'bsc' }
  ];

  res.json({
    success: true,
    currencies
  });
});

export default router;

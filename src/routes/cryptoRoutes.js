/**
 * Crypto Payment Routes
 * Handles cryptocurrency payments via Cryptomus API
 *
 * Endpoints:
 * - POST /api/crypto/create-payment - Create new payment
 * - GET /api/crypto/payment/:orderId - Get payment status
 * - POST /api/crypto/webhook - Handle Cryptomus webhooks
 * - GET /api/crypto/payments - Get user's payments
 */

import express from 'express';
import { authenticateUser, supabaseAdmin } from '../server.js';
import {
  createPaymentInvoice,
  getPaymentInfo,
  verifyWebhookSignature,
  getAvailableCryptocurrencies,
  parseWebhookData
} from '../utils/cryptomusClient.js';

const router = express.Router();

// Payment plans configuration
const PAYMENT_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    price_usd: 10,
    crystals: 2000,
    description: '2,000 crystals for $10'
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price_usd: 25,
    crystals: 6000,
    description: '6,000 crystals for $25'
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate Plan',
    price_usd: 75,
    crystals: 20000,
    description: '20,000 crystals for $75'
  }
};

// Cryptomus API configuration
const CRYPTOMUS_API_KEY = process.env.CRYPTOMUS_API_KEY;
const WEBHOOK_URL = process.env.CRYPTOMUS_WEBHOOK_URL || 'https://youtulabs.com/api/crypto/webhook';

if (!CRYPTOMUS_API_KEY) {
  console.warn('[CRYPTO] ⚠️  CRYPTOMUS_API_KEY not configured. Crypto payments will be unavailable.');
}

/**
 * POST /api/crypto/create-payment
 * Create new cryptocurrency payment
 *
 * Body:
 * {
 *   plan_id: 'starter' | 'pro' | 'ultimate'
 * }
 */
router.post('/create-payment', authenticateUser, async (req, res) => {
  try {
    const { plan_id } = req.body;
    const userId = req.user.id;

    if (!CRYPTOMUS_API_KEY) {
      return res.status(503).json({
        error: 'Crypto payments unavailable',
        detail: 'CRYPTOMUS_API_KEY not configured'
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

    console.log('[CRYPTO] Creating payment:', {
      userId: userId.substring(0, 8),
      planId: plan_id,
      orderId,
      amount: plan.price_usd,
      crystals: plan.crystals
    });

    // Create payment record in database
    const { data: paymentRecord, error: dbError } = await supabaseAdmin
      .from('cryptomus_payments')
      .insert({
        user_id: userId,
        order_id: orderId,
        plan_id: plan_id,
        amount_usd: plan.price_usd,
        crystals_amount: plan.crystals,
        status: 'pending'
      })
      .select()
      .single();

    if (dbError) {
      console.error('[CRYPTO] Database error:', dbError);
      return res.status(500).json({
        error: 'Failed to create payment record',
        detail: dbError.message
      });
    }

    // Create payment invoice in Cryptomus
    try {
      const invoice = await createPaymentInvoice({
        amount: plan.price_usd.toFixed(2),
        currency: 'USD',
        orderId,
        urlCallback: WEBHOOK_URL,
        urlReturn: 'https://youtulabs.com/subscription',
        urlSuccess: 'https://youtulabs.com/subscription?payment=success',
        lifetime: 3600 // 1 hour
      }, CRYPTOMUS_API_KEY);

      // Update payment record with Cryptomus data
      await supabaseAdmin
        .from('cryptomus_payments')
        .update({
          payment_uuid: invoice.uuid,
          payment_url: invoice.url,
          expires_at: invoice.expired_at
        })
        .eq('order_id', orderId);

      console.log('[CRYPTO] ✅ Payment created:', {
        orderId,
        paymentUuid: invoice.uuid,
        url: invoice.url
      });

      // Return payment data to frontend
      res.json({
        success: true,
        payment: {
          order_id: orderId,
          payment_uuid: invoice.uuid,
          payment_url: invoice.url,
          amount_usd: plan.price_usd,
          crystals_amount: plan.crystals,
          plan_id: plan_id,
          plan_name: plan.name,
          expires_at: invoice.expired_at,
          status: 'pending'
        }
      });
    } catch (apiError) {
      console.error('[CRYPTO] Cryptomus API error:', apiError);

      // Delete payment record on API error
      await supabaseAdmin
        .from('cryptomus_payments')
        .delete()
        .eq('order_id', orderId);

      return res.status(500).json({
        error: 'Failed to create payment invoice',
        detail: apiError.message
      });
    }
  } catch (error) {
    console.error('[CRYPTO] Error creating payment:', error);
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
      .from('cryptomus_payments')
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
        payment_uuid: payment.payment_uuid,
        payment_url: payment.payment_url,
        amount_usd: payment.amount_usd,
        crystals_amount: payment.crystals_amount,
        plan_id: payment.plan_id,
        status: payment.status,
        cryptocurrency: payment.cryptocurrency,
        wallet_address: payment.wallet_address,
        network: payment.network,
        expires_at: payment.expires_at,
        paid_at: payment.paid_at,
        crystals_granted: payment.crystals_granted,
        created_at: payment.created_at
      }
    });
  } catch (error) {
    console.error('[CRYPTO] Error getting payment:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * GET /api/crypto/payments
 * Get all payments for authenticated user
 */
router.get('/payments', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const { data: payments, error: dbError } = await supabaseAdmin
      .from('cryptomus_payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (dbError) {
      console.error('[CRYPTO] Database error:', dbError);
      return res.status(500).json({
        error: 'Failed to fetch payments',
        detail: dbError.message
      });
    }

    res.json({
      success: true,
      payments: payments.map(p => ({
        order_id: p.order_id,
        payment_uuid: p.payment_uuid,
        amount_usd: p.amount_usd,
        crystals_amount: p.crystals_amount,
        plan_id: p.plan_id,
        status: p.status,
        payment_url: p.payment_url,
        expires_at: p.expires_at,
        paid_at: p.paid_at,
        crystals_granted: p.crystals_granted,
        created_at: p.created_at
      }))
    });
  } catch (error) {
    console.error('[CRYPTO] Error fetching payments:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * POST /api/crypto/webhook
 * Handle webhook from Cryptomus
 * This endpoint is called by Cryptomus when payment status changes
 *
 * NO AUTHENTICATION - Called by Cryptomus servers
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    const receivedSignature = req.headers['sign'];
    const clientIp = req.ip || req.connection.remoteAddress;

    console.log('[CRYPTO WEBHOOK] Received webhook:', {
      orderId: webhookData.order_id,
      status: webhookData.status,
      signature: receivedSignature?.substring(0, 10) + '...',
      ip: clientIp
    });

    if (!CRYPTOMUS_API_KEY) {
      console.error('[CRYPTO WEBHOOK] ❌ CRYPTOMUS_API_KEY not configured');
      return res.status(503).json({ error: 'Crypto payments not configured' });
    }

    // SECURITY: IP Whitelist - Cryptomus webhooks come from 91.227.144.54
    const CRYPTOMUS_IP = '91.227.144.54';
    const normalizedIp = clientIp?.replace('::ffff:', ''); // Remove IPv6 prefix

    if (normalizedIp !== CRYPTOMUS_IP && normalizedIp !== '127.0.0.1' && normalizedIp !== 'localhost') {
      console.error('[CRYPTO WEBHOOK] ❌ Unauthorized IP:', normalizedIp);
      return res.status(403).json({ error: 'Forbidden - Invalid IP' });
    }

    // SECURITY: Verify webhook signature
    if (!verifyWebhookSignature(webhookData, receivedSignature, CRYPTOMUS_API_KEY.split(':')[1])) {
      console.error('[CRYPTO WEBHOOK] ❌ Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const parsedData = parseWebhookData(webhookData);

    // Find payment in database
    const { data: payment, error: findError } = await supabaseAdmin
      .from('cryptomus_payments')
      .select('*')
      .eq('order_id', parsedData.orderId)
      .single();

    if (findError || !payment) {
      console.error('[CRYPTO WEBHOOK] ❌ Payment not found:', parsedData.orderId);
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log('[CRYPTO WEBHOOK] Processing payment:', {
      orderId: parsedData.orderId,
      currentStatus: payment.status,
      newStatus: parsedData.status,
      userId: payment.user_id.substring(0, 8),
      expectedAmount: payment.amount_usd,
      receivedAmount: parsedData.paymentAmountUsd
    });

    // CRITICAL SECURITY: Verify payment amount matches expected
    if (parsedData.status === 'paid') {
      const expectedAmount = parseFloat(payment.amount_usd);
      const receivedAmount = parseFloat(parsedData.paymentAmountUsd || parsedData.merchantAmount || 0);

      // Allow 1% tolerance for exchange rate fluctuations
      const tolerance = expectedAmount * 0.01;
      const minAcceptable = expectedAmount - tolerance;
      const maxAcceptable = expectedAmount + tolerance;

      if (receivedAmount < minAcceptable || receivedAmount > maxAcceptable) {
        console.error('[CRYPTO WEBHOOK] ❌ AMOUNT MISMATCH - FRAUD ATTEMPT?', {
          orderId: parsedData.orderId,
          expected: expectedAmount,
          received: receivedAmount,
          difference: receivedAmount - expectedAmount,
          tolerance: tolerance
        });

        await supabaseAdmin
          .from('cryptomus_payments')
          .update({
            status: 'wrong_amount',
            error_message: `Amount mismatch: expected $${expectedAmount}, received $${receivedAmount}`,
            webhook_data: webhookData
          })
          .eq('order_id', parsedData.orderId);

        return res.status(400).json({
          error: 'Payment amount mismatch',
          expected: expectedAmount,
          received: receivedAmount
        });
      }

      console.log('[CRYPTO WEBHOOK] ✅ Amount verified:', {
        expected: expectedAmount,
        received: receivedAmount,
        withinTolerance: true
      });
    }

    // Now process payment update
    const updateData = {
      status: parsedData.status,
      webhook_data: webhookData,
      cryptocurrency: parsedData.payerCurrency,
      network: parsedData.network,
      wallet_address: parsedData.address
    };

    // CRITICAL: Only set paid_at for exact 'paid' status
    if (parsedData.status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('cryptomus_payments')
      .update(updateData)
      .eq('order_id', parsedData.orderId);

    // IMPORTANT: Respond to Cryptomus IMMEDIATELY after security checks
    // Process credits grant asynchronously to avoid timeout
    res.json({ success: true });
    console.log('[CRYPTO WEBHOOK] ✅ Response sent to Cryptomus');

    // CRITICAL SECURITY: Only grant crystals for exact 'paid' status
    // Reject paid_over (overpayment), wrong_amount, partial payments, etc.
    if (parsedData.status === 'paid' && !payment.crystals_granted) {
      console.log('[CRYPTO WEBHOOK] Granting subscription credits:', {
        orderId: parsedData.orderId,
        plan: payment.plan_id,
        crystals: payment.crystals_amount,
        userId: payment.user_id.substring(0, 8)
      });

      try {
        const { data: grantResult, error: grantError } = await supabaseAdmin
          .rpc('grant_crystals_from_cryptomus_payment', { p_payment_id: payment.id });

        if (grantError) {
          console.error('[CRYPTO WEBHOOK] ❌ RPC error:', grantError);
          await supabaseAdmin
            .from('cryptomus_payments')
            .update({ error_message: `Grant failed: ${grantError.message}` })
            .eq('order_id', parsedData.orderId);
        } else if (grantResult && grantResult[0]?.success) {
          console.log('[CRYPTO WEBHOOK] ✅ Subscription credits granted:', {
            orderId: parsedData.orderId,
            message: grantResult[0].message,
            newBalance: grantResult[0].new_balance,
            expiresIn: '30 days'
          });
        } else {
          console.error('[CRYPTO WEBHOOK] ❌ Failed to grant credits:', grantResult);
        }
      } catch (error) {
        console.error('[CRYPTO WEBHOOK] ❌ Error granting credits:', error);
        await supabaseAdmin
          .from('cryptomus_payments')
          .update({ error_message: `Exception: ${error.message}` })
          .eq('order_id', parsedData.orderId);
      }
    } else if (parsedData.status !== 'paid' && !payment.crystals_granted) {
      // Log rejected statuses for security audit
      console.warn('[CRYPTO WEBHOOK] ⚠️  Payment rejected - invalid status:', {
        orderId: parsedData.orderId,
        status: parsedData.status,
        reason: 'Only "paid" status accepted. Rejecting paid_over, wrong_amount, partial payments.'
      });

      await supabaseAdmin
        .from('cryptomus_payments')
        .update({
          error_message: `Rejected: Invalid status "${parsedData.status}". Only exact "paid" accepted.`
        })
        .eq('order_id', parsedData.orderId);
    }

    console.log('[CRYPTO WEBHOOK] ✅ Webhook processed successfully');
    // Response already sent at the beginning for fast reply

  } catch (error) {
    console.error('[CRYPTO WEBHOOK] Error processing webhook:', error);
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
  res.json({
    success: true,
    currencies: getAvailableCryptocurrencies()
  });
});

export default router;

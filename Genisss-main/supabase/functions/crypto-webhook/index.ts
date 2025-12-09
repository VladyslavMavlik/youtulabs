import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * NOWPayments IPN Webhook Handler
 * Обробляє callback'и від NOWPayments при зміні статусу платежу
 *
 * Endpoint: https://[project-ref].supabase.co/functions/v1/crypto-webhook
 * Method: POST
 * Headers: x-nowpayments-sig (HMAC SHA512 signature)
 */

// Payment plans configuration (synchronized with frontend)
const PAYMENT_PLANS: Record<string, { crystals: number }> = {
  starter: { crystals: 2000 },
  pro: { crystals: 6000 },
  ultimate: { crystals: 20000 }
};

// Payment statuses
const PAYMENT_STATUSES = {
  WAITING: 'waiting',
  CONFIRMING: 'confirming',
  CONFIRMED: 'confirmed',
  SENDING: 'sending',
  FINISHED: 'finished',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  EXPIRED: 'expired'
};

/**
 * Check if payment is successful
 */
function isPaymentSuccessful(status: string): boolean {
  return status === PAYMENT_STATUSES.FINISHED || status === PAYMENT_STATUSES.CONFIRMED;
}

/**
 * Parse IPN callback data
 */
function parseIpnData(ipnData: any) {
  return {
    paymentId: ipnData.payment_id?.toString() || '',
    invoiceId: ipnData.invoice_id,
    orderId: ipnData.order_id,
    paymentStatus: ipnData.payment_status,
    payAmount: ipnData.pay_amount,
    payCurrency: ipnData.pay_currency,
    priceAmount: ipnData.price_amount,
    priceCurrency: ipnData.price_currency,
    purchaseId: ipnData.purchase_id,
    actuallyPaid: ipnData.actually_paid,
    outcomeAmount: ipnData.outcome_amount,
    outcomeCurrency: ipnData.outcome_currency
  };
}

/**
 * Verify IPN signature using Web Crypto API
 * NOWPayments використовує HMAC SHA512
 */
async function verifyIpnSignature(
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
    console.error('[WEBHOOK] Error verifying signature:', error);
    return false;
  }
}

/**
 * CORS headers для webhook
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nowpayments-sig'
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
      status: 200
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Parse request body
    const ipnData = await req.json();
    const receivedSignature = req.headers.get('x-nowpayments-sig');

    console.log('[NOWPAYMENTS IPN] Received webhook:', {
      orderId: ipnData.order_id,
      paymentId: ipnData.payment_id,
      status: ipnData.payment_status,
      signature: receivedSignature?.substring(0, 10) + '...'
    });

    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const NOWPAYMENTS_IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[NOWPAYMENTS IPN] ❌ Supabase credentials not configured');
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SECURITY: Verify IPN signature
    if (NOWPAYMENTS_IPN_SECRET && receivedSignature) {
      const isValid = await verifyIpnSignature(ipnData, receivedSignature, NOWPAYMENTS_IPN_SECRET);
      if (!isValid) {
        console.error('[NOWPAYMENTS IPN] ❌ Invalid signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log('[NOWPAYMENTS IPN] ✅ Signature verified');
    } else if (!NOWPAYMENTS_IPN_SECRET) {
      console.warn('[NOWPAYMENTS IPN] ⚠️  IPN_SECRET not configured - skipping signature verification');
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse IPN data
    const parsedData = parseIpnData(ipnData);

    // Find payment in database
    const { data: payment, error: findError } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('order_id', parsedData.orderId)
      .single();

    if (findError || !payment) {
      console.error('[NOWPAYMENTS IPN] ❌ Payment not found:', parsedData.orderId);
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[NOWPAYMENTS IPN] Processing payment:', {
      orderId: parsedData.orderId,
      userId: payment.user_id.substring(0, 8),
      currentStatus: payment.status,
      newStatus: parsedData.paymentStatus,
      processed: payment.processed
    });

    // Update payment status
    const { error: updateError } = await supabase
      .from('crypto_payments')
      .update({
        payment_id: parsedData.paymentId,
        status: parsedData.paymentStatus,
        crypto_currency: parsedData.payCurrency,
        crypto_amount: parsedData.payAmount,
        nowpayments_data: ipnData,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', parsedData.orderId);

    if (updateError) {
      console.error('[NOWPAYMENTS IPN] ❌ Error updating payment:', updateError);
      return new Response(JSON.stringify({
        error: 'Failed to update payment',
        details: updateError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process credits grant if payment is successful and not yet processed
    if (isPaymentSuccessful(parsedData.paymentStatus) && !payment.processed) {
      console.log('[NOWPAYMENTS IPN] Granting subscription credits:', {
        orderId: parsedData.orderId,
        plan: payment.plan_type,
        userId: payment.user_id.substring(0, 8)
      });

      try {
        // Call Supabase RPC function to grant subscription credits
        const { data: grantResult, error: grantError } = await supabase
          .rpc('process_crypto_subscription_payment', {
            p_payment_id: parsedData.orderId,
            p_user_id: payment.user_id,
            p_plan_type: payment.plan_type,
            p_credits_amount: PAYMENT_PLANS[payment.plan_type]?.crystals || 0
          });

        if (grantError) {
          console.error('[NOWPAYMENTS IPN] ❌ RPC error:', grantError);
        } else {
          console.log('[NOWPAYMENTS IPN] ✅ Subscription credits granted:', {
            orderId: parsedData.orderId,
            creditId: grantResult
          });
        }
      } catch (error) {
        console.error('[NOWPAYMENTS IPN] ❌ Error granting credits:', error);
      }
    } else if (payment.processed) {
      console.log('[NOWPAYMENTS IPN] ⚠️  Payment already processed, skipping credit grant');
    }

    console.log('[NOWPAYMENTS IPN] ✅ Webhook processed successfully');

    // IMPORTANT: Respond to NOWPayments immediately
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[NOWPAYMENTS IPN] Error processing webhook:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      detail: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

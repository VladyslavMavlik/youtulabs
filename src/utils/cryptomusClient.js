/**
 * Cryptomus API Client
 * Handles cryptocurrency payments via Cryptomus API
 *
 * Documentation: https://doc.cryptomus.com/
 *
 * API Key format: MERCHANT_ID:API_KEY
 * Example: N751VMD-QHVME3E-PDZXD4B-BMTKD22
 */

import crypto from 'crypto';

const CRYPTOMUS_API_URL = 'https://api.cryptomus.com/v1';

// Parse API key to get merchant ID and payment key
// Format: "MERCHANT_ID:PAYMENT_KEY"
function parseApiKey(apiKey) {
  const parts = apiKey.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid Cryptomus API key format. Expected: MERCHANT_ID:PAYMENT_KEY');
  }

  return {
    merchantId: parts[0],
    paymentKey: parts.slice(1).join(':') // In case key contains ':'
  };
}

/**
 * Generate signature for Cryptomus API request
 * @param {Object} data - Request body
 * @param {string} apiKey - Payment API key
 * @returns {string} MD5 signature
 */
function generateSignature(data, apiKey) {
  // Convert data to JSON and encode in base64
  const jsonString = JSON.stringify(data);
  const base64Data = Buffer.from(jsonString).toString('base64');

  // Create MD5 hash of base64 + API key
  const sign = crypto
    .createHash('md5')
    .update(base64Data + apiKey)
    .digest('hex');

  return sign;
}

/**
 * Verify webhook signature from Cryptomus
 * @param {Object} webhookData - Webhook payload
 * @param {string} receivedSignature - Signature from webhook header
 * @param {string} apiKey - Payment API key
 * @returns {boolean} Whether signature is valid
 */
export function verifyWebhookSignature(webhookData, receivedSignature, apiKey) {
  const expectedSignature = generateSignature(webhookData, apiKey);
  return expectedSignature === receivedSignature;
}

/**
 * Create payment invoice in Cryptomus
 * @param {Object} params - Payment parameters
 * @param {string} params.amount - Payment amount (string with decimal)
 * @param {string} params.currency - Currency code (USD, EUR, etc.)
 * @param {string} params.orderId - Unique order identifier
 * @param {string} params.urlCallback - Webhook URL
 * @param {string} params.urlReturn - Return URL after payment
 * @param {string} params.urlSuccess - Success redirect URL
 * @param {number} params.lifetime - Invoice expiration in seconds (default: 3600)
 * @param {string} apiKey - Full API key (MERCHANT_ID:PAYMENT_KEY)
 * @returns {Promise<Object>} Payment invoice data
 */
export async function createPaymentInvoice({
  amount,
  currency = 'USD',
  orderId,
  urlCallback,
  urlReturn,
  urlSuccess,
  lifetime = 3600
}, apiKey) {
  try {
    const { merchantId, paymentKey } = parseApiKey(apiKey);

    // Request body
    const requestBody = {
      amount: String(amount),
      currency,
      order_id: orderId,
      url_callback: urlCallback,
      url_return: urlReturn || urlCallback,
      url_success: urlSuccess || urlCallback,
      lifetime: Math.min(Math.max(lifetime, 300), 43200) // Clamp between 300-43200
    };

    console.log('[CRYPTOMUS] Creating payment invoice:', {
      orderId,
      amount,
      currency,
      lifetime: requestBody.lifetime
    });

    // Generate signature
    const signature = generateSignature(requestBody, paymentKey);

    // Make API request
    const response = await fetch(`${CRYPTOMUS_API_URL}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant': merchantId,
        'sign': signature
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[CRYPTOMUS] API error:', responseData);
      throw new Error(responseData.message || responseData.error || 'Failed to create payment invoice');
    }

    console.log('[CRYPTOMUS] ✅ Payment invoice created:', {
      uuid: responseData.result?.uuid,
      url: responseData.result?.url,
      orderId: responseData.result?.order_id
    });

    return responseData.result;
  } catch (error) {
    console.error('[CRYPTOMUS] Error creating payment invoice:', error);
    throw error;
  }
}

/**
 * Get payment info by UUID
 * @param {string} paymentUuid - Payment UUID from Cryptomus
 * @param {string} apiKey - Full API key
 * @returns {Promise<Object>} Payment information
 */
export async function getPaymentInfo(paymentUuid, apiKey) {
  try {
    const { merchantId, paymentKey } = parseApiKey(apiKey);

    const requestBody = {
      uuid: paymentUuid
    };

    const signature = generateSignature(requestBody, paymentKey);

    const response = await fetch(`${CRYPTOMUS_API_URL}/payment/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant': merchantId,
        'sign': signature
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to get payment info');
    }

    return responseData.result;
  } catch (error) {
    console.error('[CRYPTOMUS] Error getting payment info:', error);
    throw error;
  }
}

/**
 * Get list of available cryptocurrencies
 * This is a static list based on Cryptomus documentation
 * @returns {Array} List of supported cryptocurrencies
 */
export function getAvailableCryptocurrencies() {
  return [
    { code: 'BTC', name: 'Bitcoin', network: 'bitcoin' },
    { code: 'ETH', name: 'Ethereum', network: 'ethereum' },
    { code: 'USDT', name: 'Tether (TRC20)', network: 'tron' },
    { code: 'USDT', name: 'Tether (ERC20)', network: 'ethereum' },
    { code: 'USDC', name: 'USD Coin', network: 'ethereum' },
    { code: 'LTC', name: 'Litecoin', network: 'litecoin' },
    { code: 'BCH', name: 'Bitcoin Cash', network: 'bitcoin-cash' },
    { code: 'TRX', name: 'Tron', network: 'tron' },
    { code: 'BNB', name: 'BNB', network: 'bsc' },
    { code: 'DAI', name: 'Dai', network: 'ethereum' }
  ];
}

/**
 * Parse Cryptomus webhook data
 * @param {Object} webhookBody - Raw webhook body
 * @returns {Object} Parsed webhook data
 */
export function parseWebhookData(webhookBody) {
  return {
    uuid: webhookBody.uuid,
    orderId: webhookBody.order_id,
    amount: webhookBody.amount,
    paymentAmount: webhookBody.payment_amount,
    paymentAmountUsd: webhookBody.payment_amount_usd,
    currency: webhookBody.currency,
    status: webhookBody.status, // 'paid', 'paid_over', 'wrong_amount', etc.
    payer: webhookBody.payer_currency,
    network: webhookBody.network,
    address: webhookBody.address,
    txid: webhookBody.txid,
    from: webhookBody.from,
    isPhoneRequired: webhookBody.is_phone_required,
    merchantAmount: webhookBody.merchant_amount,
    discountPercent: webhookBody.discount_percent,
    discount: webhookBody.discount,
    payerAmount: webhookBody.payer_amount,
    payerCurrency: webhookBody.payer_currency,
    additionalData: webhookBody.additional_data,
    expiresAt: webhookBody.expires_at,
    createdAt: webhookBody.created_at,
    updatedAt: webhookBody.updated_at
  };
}

export default {
  createPaymentInvoice,
  getPaymentInfo,
  verifyWebhookSignature,
  getAvailableCryptocurrencies,
  parseWebhookData
};

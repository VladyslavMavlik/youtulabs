/**
 * NOWPayments API Client
 * Handles cryptocurrency payments via NOWPayments API
 *
 * Documentation: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 *
 * API Key: N751VMD-QHVME3E-PDZXD4B-BMTKD22
 */

import crypto from 'crypto';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

/**
 * Make authenticated request to NOWPayments API
 * @param {string} endpoint - API endpoint (e.g., '/invoice')
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Response data
 */
async function makeRequest(endpoint, method, body, apiKey) {
  const url = `${NOWPAYMENTS_API_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `NOWPayments API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Create direct payment with specific pay_address
 * @param {Object} params - Payment parameters
 * @param {number} params.price_amount - Amount in fiat currency
 * @param {string} params.price_currency - Fiat currency (USD, EUR, etc.)
 * @param {string} params.pay_currency - Crypto currency to receive (btc, eth, etc.) - REQUIRED
 * @param {string} params.order_id - Your internal order ID
 * @param {string} params.order_description - Order description
 * @param {string} params.ipn_callback_url - Webhook URL for payment notifications
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Payment data with pay_address
 */
export async function createPayment(params, apiKey) {
  const {
    price_amount,
    price_currency = 'USD',
    pay_currency, // REQUIRED for /payment endpoint
    order_id,
    order_description,
    ipn_callback_url
  } = params;

  const paymentData = {
    price_amount: parseFloat(price_amount),
    price_currency,
    pay_currency,
    order_id,
    order_description,
    ipn_callback_url
  };

  console.log('[NOWPAYMENTS] Creating payment:', {
    order_id,
    amount: price_amount,
    currency: price_currency,
    pay_currency
  });

  const response = await makeRequest('/payment', 'POST', paymentData, apiKey);

  console.log('[NOWPAYMENTS] Payment created:', {
    payment_id: response.payment_id,
    pay_address: response.pay_address,
    pay_amount: response.pay_amount,
    pay_currency: response.pay_currency
  });

  return response;
}

/**
 * Create payment invoice (redirects user to NOWPayments page)
 * @param {Object} params - Invoice parameters
 * @param {number} params.price_amount - Amount in fiat currency
 * @param {string} params.price_currency - Fiat currency (USD, EUR, etc.)
 * @param {string} params.pay_currency - Crypto currency to receive (btc, eth, etc.) or empty for any
 * @param {string} params.order_id - Your internal order ID
 * @param {string} params.order_description - Order description
 * @param {string} params.ipn_callback_url - Webhook URL for payment notifications
 * @param {string} params.success_url - Redirect URL after successful payment
 * @param {string} params.cancel_url - Redirect URL if payment cancelled
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Invoice data
 */
export async function createInvoice(params, apiKey) {
  const {
    price_amount,
    price_currency = 'USD',
    pay_currency = '', // Empty = any crypto
    order_id,
    order_description,
    ipn_callback_url,
    success_url,
    cancel_url
  } = params;

  const invoiceData = {
    price_amount: parseFloat(price_amount),
    price_currency,
    order_id,
    order_description,
    ipn_callback_url,
    success_url,
    cancel_url
  };

  // Add pay_currency only if specified (for specific crypto)
  if (pay_currency) {
    invoiceData.pay_currency = pay_currency;
  }

  console.log('[NOWPAYMENTS] Creating invoice:', {
    order_id,
    amount: price_amount,
    currency: price_currency,
    pay_currency: pay_currency || 'any'
  });

  const response = await makeRequest('/invoice', 'POST', invoiceData, apiKey);

  console.log('[NOWPAYMENTS] Invoice created:', {
    id: response.id,
    invoice_url: response.invoice_url
  });

  return response;
}

/**
 * Get payment status
 * @param {string} paymentId - Payment ID
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Payment status
 */
export async function getPaymentStatus(paymentId, apiKey) {
  return await makeRequest(`/payment/${paymentId}`, 'GET', null, apiKey);
}

/**
 * Get invoice status
 * @param {string} invoiceId - Invoice ID
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Invoice status
 */
export async function getInvoiceStatus(invoiceId, apiKey) {
  return await makeRequest(`/invoice/${invoiceId}`, 'GET', null, apiKey);
}

/**
 * Verify IPN (webhook) signature from NOWPayments
 * @param {Object} ipnData - IPN callback data
 * @param {string} receivedSignature - Signature from x-nowpayments-sig header
 * @param {string} ipnSecret - IPN Secret Key (from NOWPayments dashboard)
 * @returns {boolean} True if signature is valid
 */
export function verifyIpnSignature(ipnData, receivedSignature, ipnSecret) {
  // NOWPayments uses HMAC SHA512
  const sortedData = JSON.stringify(ipnData, Object.keys(ipnData).sort());

  const hmac = crypto
    .createHmac('sha512', ipnSecret)
    .update(sortedData)
    .digest('hex');

  return hmac === receivedSignature;
}

/**
 * Get available cryptocurrencies
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Array>} List of available currencies
 */
export async function getAvailableCurrencies(apiKey) {
  return await makeRequest('/currencies', 'GET', null, apiKey);
}

/**
 * Get minimum payment amount for specific currency
 * @param {string} currency - Crypto currency code
 * @param {string} apiKey - NOWPayments API key
 * @returns {Promise<Object>} Minimum amount info
 */
export async function getMinimumAmount(currency, apiKey) {
  return await makeRequest(`/min-amount?currency_from=${currency}&currency_to=${currency}`, 'GET', null, apiKey);
}

/**
 * Parse IPN callback data
 * @param {Object} ipnData - Raw IPN data from NOWPayments
 * @returns {Object} Parsed payment data
 */
export function parseIpnData(ipnData) {
  return {
    paymentId: ipnData.payment_id,
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
 * NOWPayments payment statuses:
 * - waiting: Waiting for payment
 * - confirming: Payment is being confirmed on blockchain
 * - confirmed: Payment confirmed
 * - sending: Coins are being sent to your wallet
 * - finished: Payment completed successfully
 * - failed: Payment failed
 * - refunded: Payment refunded
 * - expired: Payment expired
 */
export const PAYMENT_STATUSES = {
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
 * @param {string} status - Payment status
 * @returns {boolean} True if payment is finished
 */
export function isPaymentSuccessful(status) {
  return status === PAYMENT_STATUSES.FINISHED || status === PAYMENT_STATUSES.CONFIRMED;
}

/**
 * Check if payment is pending
 * @param {string} status - Payment status
 * @returns {boolean} True if payment is pending
 */
export function isPaymentPending(status) {
  return [
    PAYMENT_STATUSES.WAITING,
    PAYMENT_STATUSES.CONFIRMING,
    PAYMENT_STATUSES.SENDING
  ].includes(status);
}

export default {
  createPayment,
  createInvoice,
  getPaymentStatus,
  getInvoiceStatus,
  verifyIpnSignature,
  getAvailableCurrencies,
  getMinimumAmount,
  parseIpnData,
  PAYMENT_STATUSES,
  isPaymentSuccessful,
  isPaymentPending
};

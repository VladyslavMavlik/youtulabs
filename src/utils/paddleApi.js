/**
 * Paddle API Client - Server-side operations
 * Використовується для admin панелі для зміни підписок
 */

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || 'sandbox';
const PADDLE_API_BASE = PADDLE_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';

/**
 * Paddle API Request Helper
 */
async function paddleApiRequest(method, endpoint, body = null) {
  if (!PADDLE_API_KEY) {
    throw new Error('PADDLE_API_KEY not configured');
  }

  const url = `${PADDLE_API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[PADDLE API] ${method} ${url}`);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error('[PADDLE API] Error:', data);
    throw new Error(data.error?.detail || 'Paddle API request failed');
  }

  return data;
}

/**
 * Отримати інформацію про підписку
 */
export async function getSubscription(subscriptionId) {
  return paddleApiRequest('GET', `/subscriptions/${subscriptionId}`);
}

/**
 * Оновити підписку (змінити ціну/план)
 */
export async function updateSubscription(subscriptionId, priceId, effectiveFrom = 'immediately') {
  return paddleApiRequest('PATCH', `/subscriptions/${subscriptionId}`, {
    items: [
      {
        price_id: priceId,
        quantity: 1
      }
    ],
    proration_billing_mode: effectiveFrom === 'immediately' ? 'prorated_immediately' : 'full_next_billing_period'
  });
}

/**
 * Відмінити підписку
 */
export async function cancelSubscription(subscriptionId, effectiveFrom = 'next_billing_period') {
  return paddleApiRequest('POST', `/subscriptions/${subscriptionId}/cancel`, {
    effective_from: effectiveFrom // 'immediately' or 'next_billing_period'
  });
}

/**
 * Поновити відмінену підписку
 */
export async function resumeSubscription(subscriptionId, effectiveFrom = 'immediately') {
  return paddleApiRequest('POST', `/subscriptions/${subscriptionId}/resume`, {
    effective_from: effectiveFrom
  });
}

/**
 * Призупинити підписку
 */
export async function pauseSubscription(subscriptionId, resumeAt = null) {
  const body = {};
  if (resumeAt) {
    body.resume_at = resumeAt; // ISO 8601 date string
  }
  return paddleApiRequest('POST', `/subscriptions/${subscriptionId}/pause`, body);
}

/**
 * Отримати URL для Paddle Customer Portal (управління підпискою)
 */
export async function getSubscriptionManagementUrl(subscriptionId) {
  // Paddle не має прямого API для customer portal URL
  // Замість цього використовуємо transaction API для отримання management URL
  const subscription = await paddleApiRequest('GET', `/subscriptions/${subscriptionId}`);

  // Для sandbox повертаємо sandbox URL
  const isSandbox = process.env.PADDLE_ENVIRONMENT === 'sandbox';
  const baseUrl = isSandbox
    ? 'https://sandbox-subscription-management.paddle.com'
    : 'https://subscription-management.paddle.com';

  return `${baseUrl}/subscriptions/${subscriptionId}`;
}

/**
 * Отримати список підписок користувача
 */
export async function getCustomerSubscriptions(customerId) {
  return paddleApiRequest('GET', `/subscriptions?customer_id=${customerId}`);
}

/**
 * Створити одноразовий checkout для додаткових кредитів
 */
export async function createOneTimeTransaction(customerId, priceId, quantity = 1) {
  return paddleApiRequest('POST', '/transactions', {
    items: [
      {
        price_id: priceId,
        quantity
      }
    ],
    customer_id: customerId
  });
}

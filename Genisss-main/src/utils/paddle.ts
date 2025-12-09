/**
 * Paddle Checkout Integration
 */

// Ініціалізація Paddle (викликати один раз при завантаженні сторінки)
export function initializePaddle(token: string, environment: 'sandbox' | 'production' = 'production') {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Paddle can only be initialized in browser'));
      return;
    }

    console.log('[PADDLE] Initializing with token:', token?.substring(0, 10) + '...', 'environment:', environment);

    // Якщо Paddle вже завантажений
    if ((window as any).Paddle) {
      try {
        (window as any).Paddle.Environment.set(environment);
        (window as any).Paddle.Initialize({
          token,
          eventCallback: function (data: any) {
            console.log('[PADDLE] Event:', data);
          }
        });
        console.log('[PADDLE] Already loaded, re-initialized');
        resolve();
      } catch (error) {
        console.error('[PADDLE] Re-initialization error:', error);
        reject(error);
      }
      return;
    }

    // Завантажуємо Paddle.js
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;

    script.onload = () => {
      if ((window as any).Paddle) {
        try {
          (window as any).Paddle.Environment.set(environment);
          (window as any).Paddle.Initialize({
            token,
            eventCallback: function (data: any) {
              console.log('[PADDLE] Event:', data);
            }
          });
          console.log('[PADDLE] Script loaded and initialized successfully');
          resolve();
        } catch (error) {
          console.error('[PADDLE] Initialization error:', error);
          reject(error);
        }
      } else {
        console.error('[PADDLE] Script loaded but Paddle object not found');
        reject(new Error('Paddle failed to load'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load Paddle script'));
    };

    document.head.appendChild(script);
  });
}

// Відкрити Paddle Checkout
export function openPaddleCheckout(priceId: string, user?: { id: string; email?: string }) {
  if (typeof window === 'undefined' || !(window as any).Paddle) {
    console.error('[PADDLE] Paddle not initialized');
    return;
  }

  const Paddle = (window as any).Paddle;

  const checkoutOptions: any = {
    items: [
      {
        priceId: priceId,
        quantity: 1
      }
    ]
  };

  // ВАЖЛИВО: Передаємо user_id для webhook
  if (user?.id) {
    checkoutOptions.customData = {
      user_id: user.id
    };
  }

  // Опціонально: prefill email
  if (user?.email) {
    checkoutOptions.customer = {
      email: user.email
    };
  }

  console.log('[PADDLE] Opening checkout:', {
    priceId,
    userId: user?.id,
    email: user?.email
  });

  try {
    Paddle.Checkout.open(checkoutOptions);
  } catch (error) {
    console.error('[PADDLE] Checkout open error:', error);
    alert('Failed to open checkout: ' + (error as Error).message);
  }
}

// Price ID маппінг (з .env)
export const PADDLE_PRICES = {
  // Subscriptions
  starter_month: import.meta.env.VITE_PADDLE_PRICE_STARTER,
  standard_month: import.meta.env.VITE_PADDLE_PRICE_STANDARD,
  pro_month: import.meta.env.VITE_PADDLE_PRICE_PRO,

  // Crystal Packs
  pack_500: import.meta.env.VITE_PADDLE_PRICE_PACK_500,
  pack_2500: import.meta.env.VITE_PADDLE_PRICE_PACK_2500,
  pack_5000: import.meta.env.VITE_PADDLE_PRICE_PACK_5000,
  pack_10000: import.meta.env.VITE_PADDLE_PRICE_PACK_10000,
};

// Отримати priceId по plan ID (для підписок)
export function getPriceId(planId: string): string {
  const mapping: Record<string, string> = {
    'starter': PADDLE_PRICES.starter_month,
    'pro': PADDLE_PRICES.standard_month,
    'ultimate': PADDLE_PRICES.pro_month,
  };

  return mapping[planId] || PADDLE_PRICES.starter_month;
}

// Отримати priceId по pack ID (для кредитів)
export function getCreditPackPriceId(packId: string): string {
  const mapping: Record<string, string> = {
    'pack_500': PADDLE_PRICES.pack_500,
    'pack_2500': PADDLE_PRICES.pack_2500,
    'pack_5000': PADDLE_PRICES.pack_5000,
    'pack_10000': PADDLE_PRICES.pack_10000,
  };

  return mapping[packId] || PADDLE_PRICES.pack_500;
}

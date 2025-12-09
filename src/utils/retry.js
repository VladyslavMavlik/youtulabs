/**
 * Retry utility with exponential backoff and jitter
 * Handles transient errors (429, 503, 524) from Anthropic API
 */

/**
 * Retry a function with exponential backoff and jitter
 */
export async function withRetry(fn, { retries = 8, baseDelay = 2000 } = {}) {
  let lastErr;

  for (let idx = 0; idx <= retries; idx++) {
    try {
      return await fn();
    } catch (e) {
      const code = e?.status || e?.response?.status;
      const errorType = e?.error?.type || e?.type;
      const errorMessage = e?.message || e?.error?.message || '';

      const isOverloaded = errorType === 'overloaded_error' ||
                          errorMessage.toLowerCase().includes('overloaded') ||
                          errorMessage.toLowerCase().includes('overload');
      const transient = code === 429 || code === 503 || code === 524 || code === 529 || isOverloaded;

      if (!transient || idx === retries) {
        throw e;
      }

      // Much longer backoff for overloaded errors (API is stressed)
      // 529 errors need more patience: 2s, 6s, 18s, 54s, 162s...
      const backoffMultiplier = isOverloaded ? 3 : 2;
      const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, idx);
      const jitter = Math.floor(Math.random() * 500);
      const wait = exponentialDelay + jitter;

      console.log(`[RETRY] Attempt ${idx + 1}/${retries} after ${wait}ms | Code: ${code} | Type: ${errorType}`);

      await new Promise(r => setTimeout(r, wait));
      lastErr = e;
    }
  }

  throw lastErr;
}

export async function withRetryAndFallback(fn, fallbackFn, options = {}) {
  try {
    return await withRetry(fn, options);
  } catch (e) {
    console.warn('Primary function failed after retries, using fallback:', e?.error?.type || e?.message);
    return await fallbackFn();
  }
}

/**
 * Story Generator API Server
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCurrentCount, startCounterService } from './utils/counterSimulator.js';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { storyQueue } from './queue/storyQueue.js';
import { nanoid } from 'nanoid';
import voiceRoutes from './routes/voiceRoutes.js';
import bonusCodesRoutes from './routes/bonusCodesRoutes.js';
import audioRoutes from './routes/audioRoutes.js';
import nowpaymentsRoutes from './routes/nowpaymentsRoutes.js';
import { handlePaddleWebhook } from './routes/paddleWebhook.js';
import { handleLemonSqueezyWebhook, generateCheckoutUrl } from './routes/lemonsqueezyWebhook.js';
import * as adminRoutes from './routes/adminRoutes.js';

console.log('[SERVER] Admin routes imported:', Object.keys(adminRoutes));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://youtulabs.com',
      'https://www.youtulabs.com'
    ],
    credentials: true
  }
});
const PORT = process.env.PORT || 3000;

// Initialize Supabase clients for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ CRITICAL: Supabase credentials not found in environment variables!');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY not found. Queue operations may fail.');
  console.warn('Please add SUPABASE_SERVICE_ROLE_KEY to your .env file for backend operations.');
}

if (process.env.NODE_ENV === 'development') {
  console.log('[SUPABASE] URL:', supabaseUrl);
  console.log('[SUPABASE] Anon Key length:', supabaseAnonKey.length);
  console.log('[SUPABASE] Service Key length:', supabaseServiceKey?.length || 0);
}

// Client for user operations (with anon key)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for backend operations (bypasses RLS)
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase; // Fallback to regular client if no service key

// Pricing constants
const CRYSTALS_PER_MINUTE = 10; // Text story generation: 1 minute = 10 crystals
const CHARS_PER_CRYSTAL_AUDIO = 450; // Audio TTS: 450 characters = 1 crystal
const CHARS_PER_MINUTE_AUDIO = 1000; // ElevenLabs standard: 1000 chars ≈ 1 minute (characters without spaces)

// Helper function to calculate audio cost
// Formula: crystals = ceil(characters / 450)
// Economics: 10M chars = ~22,223 crystals = ~$124.45 revenue
// Cost: $34, Profit: ~$90.45 (~72.7% margin)
// Crystal value: 2500 crystals = $14 => $0.0056 per crystal
function calculateAudioCost(characters) {
  return Math.ceil(characters / CHARS_PER_CRYSTAL_AUDIO);
}

// Trust proxy - required for Express behind nginx/cloudflare
app.set('trust proxy', 1);

// Security Middleware
// Apply helmet for security headers (XSS, clickjacking, MIME sniffing protection)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'", "https://cdn.paddle.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://xcqjtdfvsgvuglllxgzc.supabase.co", "https://sandbox-checkout-service.paddle.com", "https://checkout-service.paddle.com"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["https://sandbox-buy.paddle.com", "https://buy.paddle.com"],
      childSrc: ["https://sandbox-buy.paddle.com", "https://buy.paddle.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
}));

// Middleware для збереження raw body (потрібно для webhook signature verification)
app.use('/api/paddle/webhook', express.raw({ type: 'application/json' }));
app.use('/api/lemonsqueezy/webhook', express.raw({ type: 'application/json' }));

// Middleware
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CORS middleware for React frontend - SECURE
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5173', // Development
    'http://localhost:5174',
    'http://localhost:3000',
    'https://yourdomain.com', // Production - замініть на ваш домен
    'https://www.yourdomain.com'
  ];

  const origin = req.headers.origin;

  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting configuration
// General API rate limit - 100 requests per 15 minutes (500 in development)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for public endpoints and job polling
  skip: (req) => {
    const path = req.path;
    return path === '/api/languages' ||
           path === '/api/genres' ||
           path === '/api/counter' ||
           path.startsWith('/api/job/');
  }
});

// Apply general rate limiter to all API routes (with skip function for public endpoints)
app.use('/api/', generalLimiter);

// Voice API Routes (для синтезу мовлення)
app.use('/api/voice', voiceRoutes);
app.use('/api/bonus-codes', bonusCodesRoutes);

// Crypto Payment Routes (NOWPayments API)
app.use('/api/crypto', nowpaymentsRoutes);

// Audio Generation Routes (requires authentication)
app.use('/api/audio', authenticateUser, audioRoutes);

// Admin Routes (require authentication + admin role)
console.log('[SERVER] Registering admin routes...');
console.log('[SERVER] adminRoutes.changeSubscriptionPlan:', typeof adminRoutes.changeSubscriptionPlan);

// TEST ROUTE - without middleware
app.post('/api/admin/test', (req, res) => {
  console.log('[TEST] Test route called!');
  res.json({ success: true, message: 'Test route works!' });
});

app.get('/api/admin/users', adminRoutes.requireAdmin, adminRoutes.getAllUsers);
app.get('/api/admin/users/:userId/subscription', adminRoutes.requireAdmin, adminRoutes.getUserSubscription);
app.post('/api/admin/users/:userId/subscription/change-plan', adminRoutes.requireAdmin, adminRoutes.changeSubscriptionPlan);
app.post('/api/admin/users/:userId/subscription/cancel', adminRoutes.requireAdmin, adminRoutes.cancelUserSubscription);
app.post('/api/admin/users/:userId/credits/grant', adminRoutes.requireAdmin, adminRoutes.grantCredits);
app.post('/api/admin/users/:userId/credits/deduct', adminRoutes.requireAdmin, adminRoutes.deductCredits);
app.post('/api/admin/users/:userId/balance/set', adminRoutes.requireAdmin, adminRoutes.setBalance);
app.get('/api/admin/users/:userId/credits', adminRoutes.requireAdmin, adminRoutes.getUserCredits);

// Paddle Webhook Route (без rate limiting і auth - Paddle сам відправляє запити)
app.post('/api/paddle/webhook', async (req, res) => {
  // Додаємо rawBody для перевірки підпису
  req.rawBody = req.body.toString('utf8');
  await handlePaddleWebhook(req, res);
});

// LemonSqueezy Webhook Route (без rate limiting і auth - LemonSqueezy сам відправляє запити)
app.post('/api/lemonsqueezy/webhook', async (req, res) => {
  // Додаємо rawBody для перевірки підпису
  req.rawBody = req.body.toString('utf8');
  await handleLemonSqueezyWebhook(req, res);
});

// LemonSqueezy Checkout URL Generator (requires authentication)
app.post('/api/lemonsqueezy/checkout', async (req, res) => {
  try {
    // SECURITY CHECK: Verify authentication token
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!token) {
      console.warn('[LEMONSQUEEZY CHECKOUT] Unauthorized attempt - no token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.warn('[LEMONSQUEEZY CHECKOUT] Invalid authentication token');
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({ error: 'Missing variantId' });
    }

    // Generate checkout URL with user_id in custom data
    const checkoutUrl = generateCheckoutUrl(variantId, user.id, user.email);

    console.log('[LEMONSQUEEZY CHECKOUT] Generated URL for user:', user.id, 'variant:', variantId);

    return res.json({ checkoutUrl });
  } catch (error) {
    console.error('[LEMONSQUEEZY CHECKOUT] Error:', error);
    return res.status(500).json({ error: 'Failed to generate checkout URL' });
  }
});

// Get user's LemonSqueezy subscription status (requires authentication)
app.get('/api/lemonsqueezy/subscription', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Get subscription from database
    const { data: result, error } = await supabaseAdmin.rpc('get_user_lemonsqueezy_subscription', {
      p_user_id: user.id
    });

    if (error) {
      console.error('[LEMONSQUEEZY] get_subscription error:', error);
      return res.status(500).json({ error: 'Failed to get subscription' });
    }

    return res.json(result);
  } catch (error) {
    console.error('[LEMONSQUEEZY] subscription error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get Paddle Customer Portal URL (requires authentication)
app.get('/api/paddle/management-url', async (req, res) => {
  try {
    // SECURITY CHECK 1: Verify authentication token
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.cookies?.['supabase-auth-token'];

    if (!token) {
      console.warn('[PADDLE PORTAL] Unauthorized attempt - no token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SECURITY CHECK 2: Verify user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.warn('[PADDLE PORTAL] Invalid authentication token');
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    console.log('[PADDLE PORTAL] Request from user:', user.id);

    // SECURITY CHECK 3: Get user's subscription from database
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('paddle_subscriptions')
      .select('paddle_subscription_id')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      console.warn('[PADDLE PORTAL] No subscription found for user:', user.id);
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Import getSubscriptionManagementUrl function
    const { getSubscriptionManagementUrl } = await import('./utils/paddleApi.js');

    // Get portal URL
    const portalUrl = await getSubscriptionManagementUrl(subscription.paddle_subscription_id);

    console.log('[PADDLE PORTAL] ✅ Portal URL generated for user:', user.id);

    res.json({
      success: true,
      url: portalUrl
    });
  } catch (error) {
    console.error('[PADDLE PORTAL] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to get portal URL' });
  }
});

// Cancel subscription endpoint (requires authentication)
app.post('/api/paddle/cancel-subscription', async (req, res) => {
  try {
    // SECURITY CHECK 1: Verify authentication token
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.cookies?.['supabase-auth-token'];

    if (!token) {
      console.warn('[PADDLE CANCEL] Unauthorized attempt - no token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SECURITY CHECK 2: Verify user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.warn('[PADDLE CANCEL] Invalid authentication token');
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    console.log('[PADDLE CANCEL] Request from user:', user.id);

    // SECURITY CHECK 3: Get user's subscription from database (ensuring user owns this subscription)
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('paddle_subscriptions')
      .select('paddle_subscription_id, status, user_id, cancel_at')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      console.warn('[PADDLE CANCEL] No subscription found for user:', user.id);
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // SECURITY CHECK 4: Verify subscription belongs to authenticated user (double check)
    if (subscription.user_id !== user.id) {
      console.error('[PADDLE CANCEL] SECURITY VIOLATION: User', user.id, 'tried to cancel subscription of user', subscription.user_id);
      return res.status(403).json({ error: 'Forbidden' });
    }

    // SECURITY CHECK 5: Verify subscription is active
    if (subscription.status !== 'active') {
      console.warn('[PADDLE CANCEL] Subscription not active:', subscription.paddle_subscription_id, 'Status:', subscription.status);
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    // SECURITY CHECK 6: Verify subscription is not already scheduled for cancellation
    if (subscription.cancel_at) {
      console.warn('[PADDLE CANCEL] Subscription already scheduled for cancellation:', subscription.paddle_subscription_id);
      return res.status(400).json({ error: 'Subscription is already scheduled for cancellation' });
    }

    // Import cancelSubscription function
    const { cancelSubscription } = await import('./utils/paddleApi.js');

    let result;
    let cancelMethod = 'paddle_api';

    try {
      // IMPORTANT: Cancel subscription at END of billing period (not immediately)
      // This allows user to continue using until paid period ends
      result = await cancelSubscription(subscription.paddle_subscription_id, 'next_billing_period');
    } catch (paddleError) {
      // Handle Paddle API permission errors (e.g., sandbox API key without cancel permissions)
      if (paddleError.message?.includes('not authorized') || paddleError.message?.includes('forbidden')) {
        console.warn('[PADDLE CANCEL] ⚠️ Paddle API key lacks cancel permissions, marking as cancelled in database only');

        // Update subscription status in database to "cancelled"
        await supabaseAdmin
          .from('paddle_subscriptions')
          .update({
            status: 'cancelled',
            cancel_at: new Date().toISOString()
          })
          .eq('paddle_subscription_id', subscription.paddle_subscription_id);

        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            cancel_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        cancelMethod = 'database_only';
        result = { cancelled_in_database: true, reason: 'API key lacks permissions' };
      } else {
        // Re-throw if it's a different error
        throw paddleError;
      }
    }

    console.log('[PADDLE CANCEL] ✅ Subscription cancelled successfully:', {
      subscriptionId: subscription.paddle_subscription_id,
      userId: user.id,
      effectiveFrom: 'next_billing_period',
      method: cancelMethod
    });

    // Log cancellation event to database for audit trail
    await supabaseAdmin
      .from('balance_transactions')
      .insert({
        user_id: user.id,
        amount: 0,
        type: 'subscription',
        description: `Subscription cancelled - will end at period end (${cancelMethod})`,
        balance_before: 0,
        balance_after: 0,
        metadata: {
          action: 'cancel',
          paddle_subscription_id: subscription.paddle_subscription_id,
          cancelled_at: new Date().toISOString(),
          effective_from: 'next_billing_period',
          cancel_method: cancelMethod
        }
      });

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period',
      data: result
    });
  } catch (error) {
    console.error('[PADDLE CANCEL] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// Public endpoints (skipped from rate limiting via skip function)
app.get('/api/languages', (req, res) => {
  res.json({
    languages: [
      { code: 'uk-UA', name: 'Ukrainian (Українська)' },
      { code: 'pl-PL', name: 'Polish (Polski)' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'de-DE', name: 'German (Deutsch)' },
      { code: 'pt-BR', name: 'Portuguese (Português)' },
      { code: 'es-ES', name: 'Spanish (Español)' },
      { code: 'ja-JP', name: 'Japanese (日本語)' },
      { code: 'ru-RU', name: 'Russian (Русский)' }
    ]
  });
});

app.get('/api/genres', (req, res) => {
  res.json({
    genres: [
      { code: 'noir_drama', name: 'Noir Drama' },
      { code: 'romance', name: 'Romance' },
      { code: 'thriller', name: 'Thriller' },
      { code: 'family_drama', name: 'Family Drama' },
      { code: 'sci_fi', name: 'Science Fiction' },
      { code: 'scifi_adventure', name: 'Sci-Fi Adventure' },
      { code: 'fantasy', name: 'Fantasy' },
      { code: 'horror', name: 'Horror' },
      { code: 'comedy', name: 'Comedy' },
      { code: 'mystery', name: 'Mystery' },
      { code: 'military', name: 'Military/War' }
    ]
  });
});

// Token cache to avoid hitting Supabase rate limits
// Cache tokens for 5 minutes before re-validating
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Authentication middleware
async function authenticateUser(req, res, next) {
  try {
    console.log('[AUTH] Authenticating request:', req.method, req.url);
    const authHeader = req.headers.authorization;
    console.log('[AUTH] Auth header present:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AUTH] ❌ Missing or invalid authorization header');
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && Date.now() < cached.expiresAt) {
      // Use cached user data
      req.user = cached.user;
      req.userToken = token;
      return next();
    }

    // Verify JWT token with Supabase
    console.log('[AUTH] Verifying token with Supabase...');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Remove from cache if exists
      console.error('[AUTH] ❌ Invalid or expired token:', error?.message);
      tokenCache.delete(token);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    console.log('[AUTH] ✅ User authenticated:', user.id.substring(0, 8));

    // Cache the result
    tokenCache.set(token, {
      user,
      expiresAt: Date.now() + TOKEN_CACHE_TTL
    });

    // Clean up old cache entries periodically
    if (tokenCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of tokenCache.entries()) {
        if (now >= value.expiresAt) {
          tokenCache.delete(key);
        }
      }
    }

    // Attach user and token to request
    req.user = user;
    req.userToken = token;
    next();
  } catch (error) {
    console.error('[AUTH] Error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Helper function to check and deduct balance ATOMICALLY
// Uses Postgres function with row-level locking to prevent race conditions
// CRITICAL: This prevents multiple concurrent requests from deducting balance simultaneously
async function checkAndDeductBalance(userId, cost, description, userToken) {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BALANCE] Atomic deduction for user ${userId.substring(0, 8)}..., cost: ${cost}`);
    }

    // Create authenticated Supabase client with user's JWT token
    const userSupabase = userToken
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${userToken}` } }
        })
      : supabase;

    // Call atomic deduction function - uses FOR UPDATE lock to prevent race conditions
    const { data, error } = await userSupabase.rpc('deduct_balance_atomic', {
      p_user_id: userId,
      p_amount: cost,
      p_description: description,
      p_metadata: {
        cost: cost,
        timestamp: new Date().toISOString()
      }
    });

    if (error) {
      console.error('[BALANCE] RPC error:', error);
      return { success: false, error: 'Failed to deduct balance' };
    }

    // Parse result from Postgres function
    if (!data.success) {
      if (data.error === 'Insufficient balance') {
        return {
          success: false,
          error: 'Insufficient balance',
          required: data.required,
          current: data.current
        };
      }
      return { success: false, error: data.error };
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[BALANCE] ✅ Atomic deduction successful: ${data.balanceBefore} -> ${data.balanceAfter}`);
    }

    return {
      success: true,
      newBalance: data.newBalance,
      transactionId: data.transactionId
    };
  } catch (error) {
    console.error('[BALANCE] Unexpected error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to refund balance when generation fails ATOMICALLY
// Uses admin client with atomic Postgres function (backend operation)
// CRITICAL: Transaction log is mandatory - if it fails, entire refund is rolled back
async function refundBalance(userId, amount, reason) {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BALANCE] Atomic refund: ${amount} crystals to user ${userId.substring(0, 8)}...`);
    }

    // Call atomic refund function using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin.rpc('refund_balance_atomic', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_metadata: {
        refund_amount: amount,
        reason: reason,
        timestamp: new Date().toISOString()
      }
    });

    if (error) {
      console.error('[BALANCE] Refund RPC error:', error);
      return { success: false, error: 'Failed to refund balance' };
    }

    if (!data.success) {
      console.error('[BALANCE] Refund failed:', data.error);
      return { success: false, error: data.error };
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[BALANCE] ✅ Atomic refund successful: ${data.balanceBefore} + ${amount} = ${data.balanceAfter}`);
    }

    return {
      success: true,
      newBalance: data.newBalance,
      transactionId: data.transactionId
    };
  } catch (error) {
    console.error('[BALANCE] Unexpected refund error:', error);
    return { success: false, error: error.message };
  }
}

// Lazy orchestrator loading (kept for backwards compatibility / testing)
let orchestrator = null;
async function ensureOrchestrator() {
  if (!orchestrator) {
    const { StoryOrchestrator } = await import('./orchestrator.js');
    orchestrator = new StoryOrchestrator(process.env.ANTHROPIC_API_KEY);
  }
  return orchestrator;
}

// Estimate wait time based on queue position and average generation time
async function estimateWaitTime(job) {
  try {
    // Try to get position - may fail if job is already active/completed
    let position = 0;
    try {
      position = await job.getPosition();
    } catch (e) {
      // Job might be active or completed, position is not available
      position = 0;
    }

    const waitingCount = await storyQueue.getWaitingCount();
    const activeCount = await storyQueue.getActiveCount();

    // Average generation time: ~4 minutes
    const avgGenerationTime = 240; // seconds
    const concurrency = 5; // We process 5 jobs concurrently

    // Calculate estimated wait time
    const estimatedSeconds = Math.ceil((position / concurrency) * avgGenerationTime);

    return {
      position: position + 1, // +1 for user-friendly display (1-indexed)
      queueLength: waitingCount,
      activeJobs: activeCount,
      estimatedSeconds: estimatedSeconds,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60)
    };
  } catch (error) {
    console.error('[QUEUE] Failed to estimate wait time:', error);
    return {
      position: 0,
      estimatedMinutes: 5 // Default estimate
    };
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Counter endpoint - DEPRECATED
 * Counter is now real-time via Supabase Realtime (global_stats table).
 * This endpoint kept for backwards compatibility during migration.
 */
app.get('/api/counter', async (req, res) => {
  try {
    // Return data from Supabase global_stats table
    const { data, error } = await supabaseAdmin
      .from('global_stats')
      .select('total_stories, total_audio_generations')
      .eq('id', 'singleton')
      .single();

    if (error) {
      console.error('[API] Error fetching counter from DB:', error);
      // Fallback to simulator for backwards compatibility
      const count = getCurrentCount();
      return res.json(count);
    }

    res.json({
      total: data.total_stories,
      today: 0, // No longer tracked per day
      todayTarget: 0,
      nextUpdate: null // Real-time updates via Realtime
    });
  } catch (error) {
    console.error('[API] Counter error:', error);
    res.status(500).json({ error: 'Failed to get counter' });
  }
});

/**
 * Main generation endpoint - PROTECTED
 * Note: No rate limiter here - user's crystal balance already controls usage
 */
app.post('/api/generate', authenticateUser, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== New Generation Request ===');
      console.log('User:', req.user.email);
      console.log('Payload:', JSON.stringify(req.body, null, 2));
    } else {
      console.log('\n=== New Generation Request ===');
      console.log('User ID:', req.user.id.substring(0, 8) + '...');
    }

    // Validate request
    const { language, genre, minutes, prompt, pov, audioMode, policy, options } = req.body;

    // 1. Check required fields
    if (!language || !genre || !minutes || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['language', 'genre', 'minutes', 'prompt']
      });
    }

    // 2. Validate language (whitelist)
    const validLanguages = [
      'uk-UA', 'pl-PL', 'en-US', 'de-DE', 'pt-BR', 'es-ES', 'ja-JP', 'ru-RU',
      'fr-FR', 'it-IT', 'zh-CN', 'ko-KR', 'ar-SA', 'th-TH', 'tr-TR'
    ];
    if (!validLanguages.includes(language)) {
      return res.status(400).json({
        error: 'Invalid language',
        allowed: validLanguages
      });
    }

    // 3. Validate genre (whitelist)
    const validGenres = [
      'noir_drama', 'romance', 'thriller', 'family_drama', 'sci_fi',
      'scifi_adventure', 'fantasy', 'horror', 'comedy', 'mystery', 'military'
    ];
    if (!validGenres.includes(genre)) {
      return res.status(400).json({
        error: 'Invalid genre',
        allowed: validGenres
      });
    }

    // 4. Validate minutes (must be integer, 1-180)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      return res.status(400).json({
        error: 'Minutes must be an integer between 1 and 180'
      });
    }

    // 5. Validate prompt (max length 3000 chars)
    // REDUCED FROM 10000 to prevent expensive API calls and potential abuse
    // 3000 chars ≈ 600 words - sufficient for detailed story prompt
    if (typeof prompt !== 'string' || prompt.length === 0) {
      return res.status(400).json({
        error: 'Prompt must be a non-empty string'
      });
    }
    if (prompt.length > 3000) {
      return res.status(400).json({
        error: 'Prompt is too long (max 3000 characters, approximately 600 words). Please be more concise.',
        currentLength: prompt.length
      });
    }

    // 6. Validate POV (optional, but must be valid if provided)
    if (pov && !['first', 'third'].includes(pov)) {
      return res.status(400).json({
        error: 'Invalid point of view',
        allowed: ['first', 'third']
      });
    }

    // 7. Validate audioMode (optional, but must be boolean if provided)
    if (audioMode !== undefined && typeof audioMode !== 'boolean') {
      return res.status(400).json({
        error: 'audioMode must be a boolean'
      });
    }

    // 8. Validate policy (optional, but must be valid if provided)
    if (policy) {
      if (policy.no_explicit_content !== undefined && typeof policy.no_explicit_content !== 'boolean') {
        return res.status(400).json({ error: 'policy.no_explicit_content must be a boolean' });
      }
      if (policy.violence_level !== undefined && !['none', 'low', 'moderate', 'medium', 'high'].includes(policy.violence_level)) {
        return res.status(400).json({
          error: 'Invalid violence_level',
          allowed: ['none', 'low', 'moderate', 'medium', 'high']
        });
      }
    }

    // 9. Validate options (optional, but must be valid if provided)
    if (options) {
      if (options.time_beacons !== undefined && typeof options.time_beacons !== 'boolean') {
        return res.status(400).json({ error: 'options.time_beacons must be a boolean' });
      }
      if (options.tight_cadence !== undefined && typeof options.tight_cadence !== 'boolean') {
        return res.status(400).json({ error: 'options.tight_cadence must be a boolean' });
      }
    }

    // Calculate cost
    const cost = minutes * CRYSTALS_PER_MINUTE;
    console.log(`Cost: ${cost} crystals for ${minutes} minutes`);

    // 10. Check concurrent generation limit (MAX 5 active generations per user)
    // This prevents one user from monopolizing the queue
    const MAX_CONCURRENT_GENERATIONS = 5;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: activeJobs, error: activeJobsError } = await supabaseAdmin
      .from('story_jobs')
      .select('job_id, status, created_at')
      .eq('user_id', req.user.id)
      .in('status', ['waiting', 'processing', 'pending'])
      .gte('created_at', tenMinutesAgo);

    if (activeJobsError) {
      console.error('[API] Failed to check active jobs:', activeJobsError);
      // Non-critical error - allow generation to continue
    } else if (activeJobs && activeJobs.length >= MAX_CONCURRENT_GENERATIONS) {
      console.log(`❌ User has ${activeJobs.length} active generations (limit: ${MAX_CONCURRENT_GENERATIONS})`);
      return res.status(429).json({
        error: 'Too many concurrent generations',
        message: `You can have maximum ${MAX_CONCURRENT_GENERATIONS} stories generating at the same time. Please wait for one to complete before starting a new one.`,
        activeGenerations: activeJobs.length,
        maxAllowed: MAX_CONCURRENT_GENERATIONS
      });
    }

    console.log(`✅ Concurrent generation check passed (${activeJobs?.length || 0}/${MAX_CONCURRENT_GENERATIONS})`);

    // Track if balance was successfully deducted (for refund in catch block)
    let balanceDeducted = false;
    let jobId = null;

    // Check and deduct balance BEFORE generation
    const balanceResult = await checkAndDeductBalance(
      req.user.id,
      cost,
      `Story generation (${minutes} min, ${genre})`,
      req.userToken
    );

    if (!balanceResult.success) {
      console.log('❌ Insufficient balance:', balanceResult);
      return res.status(402).json({
        error: balanceResult.error,
        required: balanceResult.required,
        current: balanceResult.current
      });
    }

    // Mark balance as deducted for exception handling
    balanceDeducted = true;

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Balance deducted: ${cost} crystals, new balance: ${balanceResult.newBalance}`);
    }

    // Generate unique job ID
    jobId = nanoid();

    // Create job record in database FIRST (before adding to queue)
    // Use admin client to bypass RLS
    const { error: jobError } = await supabaseAdmin
      .from('story_jobs')
      .insert({
        job_id: jobId,
        user_id: req.user.id,
        status: 'pending',
        payload: req.body
      });

    if (jobError) {
      console.error('[API] Failed to create job record:', jobError);

      // REFUND balance because job creation failed
      await refundBalance(
        req.user.id,
        cost,
        `Refund: Job creation failed - ${jobError.message}`
      );

      return res.status(500).json({
        error: 'Failed to queue generation',
        message: jobError.message
      });
    }

    // Add job to queue (background processing)
    try {
      const job = await storyQueue.add({
        jobId: jobId,
        userId: req.user.id,
        payload: req.body,
        cost: cost // Include cost for potential refund in worker
      }, {
        jobId: jobId, // Use same ID for Bull job
        priority: cost > 100 ? 1 : 10 // Higher cost = higher priority
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Job ${jobId} added to queue successfully`);
      }

      // Return immediately with job ID (client will poll for status)
      res.json({
        jobId: jobId,
        status: 'queued',
        message: 'Story generation queued successfully'
      });
    } catch (queueError) {
      console.error('[API] Failed to add job to queue:', queueError);

      // REFUND balance because queue add failed
      await refundBalance(
        req.user.id,
        cost,
        `Refund: Queue add failed - ${queueError.message}`
      );

      // Mark job as failed in database
      await supabaseAdmin
        .from('story_jobs')
        .update({
          status: 'failed',
          error: queueError.message,
          completed_at: new Date().toISOString()
        })
        .eq('job_id', jobId);

      return res.status(500).json({
        error: 'Failed to queue generation',
        message: queueError.message
      });
    }
  } catch (error) {
    console.error('[API] ❌ CRITICAL: Unexpected exception in /api/generate:', error);

    // CRITICAL REFUND LOGIC: Prevent credit loss if exception occurs after deduction
    // This handles edge cases like network failures, memory errors, etc.
    try {
      if (balanceDeducted) {
        console.error(`[API] 🔄 Balance was deducted (${cost} crystals), attempting refund...`);

        if (jobId) {
          // Job was created in DB, mark it as failed
          // Worker will NOT process it (it's not in Bull queue)
          // But we need to mark it failed so user can see it in history
          console.error(`[API] Job ${jobId} was created in DB but not queued, marking as failed`);
          await supabaseAdmin
            .from('story_jobs')
            .update({
              status: 'failed',
              error: `Internal error: ${error.message}`,
              completed_at: new Date().toISOString()
            })
            .eq('job_id', jobId);
        }

        // REFUND the balance since job will never be processed
        const refundResult = await refundBalance(
          req.user.id,
          cost,
          `Refund: Internal server error - ${error.message}`
        );

        if (refundResult.success) {
          console.error(`[API] ✅ Emergency refund successful: +${cost} crystals`);
        } else {
          console.error(`[API] ❌ CRITICAL: Emergency refund FAILED:`, refundResult.error);
          console.error(`[API] ⚠️  USER ${req.user.id} LOST ${cost} CRYSTALS - MANUAL INTERVENTION REQUIRED`);
        }
      } else {
        console.error('[API] Balance was not deducted, no refund needed');
      }
    } catch (refundError) {
      console.error('[API] ❌ CRITICAL: Exception during emergency refund:', refundError);
      console.error(`[API] ⚠️  USER ${req.user.id} MAY HAVE LOST ${cost} CRYSTALS - MANUAL INTERVENTION REQUIRED`);
    }

    res.status(500).json({
      error: 'Generation failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Check job status - PROTECTED
 */
app.get('/api/job/:jobId', authenticateUser, async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get job from database (use admin client to bypass RLS)
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('story_jobs')
      .select('*')
      .eq('job_id', jobId)
      .eq('user_id', req.user.id) // Ensure user can only see their own jobs
      .single();

    if (jobError || !jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get Bull job for additional info
    const bullJob = await storyQueue.getJob(jobId);
    let progress = null;
    let waitTime = null;

    if (bullJob) {
      progress = await bullJob.progress();
      if (jobData.status === 'pending') {
        waitTime = await estimateWaitTime(bullJob);
      }
    }

    res.json({
      jobId: jobData.job_id,
      status: jobData.status,
      createdAt: jobData.created_at,
      startedAt: jobData.started_at,
      completedAt: jobData.completed_at,
      storyId: jobData.story_id,
      result: jobData.result,
      error: jobData.error,
      progress: progress,
      waitTime: waitTime
    });
  } catch (error) {
    console.error('[API] Job status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

/**
 * Get story by ID - PROTECTED
 */
app.get('/api/story/:storyId', authenticateUser, async (req, res) => {
  try {
    const { storyId } = req.params;

    const { data: story, error } = await supabaseAdmin
      .from('user_stories')
      .select('*')
      .eq('id', storyId)
      .eq('user_id', req.user.id) // Ensure user can only see their own stories
      .single();

    if (error || !story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story);
  } catch (error) {
    console.error('[API] Story fetch error:', error);
    res.status(500).json({ error: 'Failed to get story' });
  }
});

/**
 * Delete story by ID - PROTECTED
 */
app.delete('/api/story/:storyId', authenticateUser, async (req, res) => {
  try {
    const { storyId } = req.params;

    console.log(`[API] Delete request for story ${storyId} by user ${req.user.id}`);

    // First verify the story exists and belongs to the user
    const { data: story, error: fetchError } = await supabaseAdmin
      .from('user_stories')
      .select('id, user_id')
      .eq('id', storyId)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !story) {
      console.log('[API] Story not found or unauthorized');
      return res.status(404).json({ error: 'Story not found' });
    }

    // Delete the story using admin client (bypasses RLS)
    const { error: deleteError } = await supabaseAdmin
      .from('user_stories')
      .delete()
      .eq('id', storyId)
      .eq('user_id', req.user.id);

    if (deleteError) {
      console.error('[API] Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete story' });
    }

    console.log(`[API] ✅ Story ${storyId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Story delete error:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// Languages and genres endpoints moved before rate limiter (see lines 133-164)

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log('[BOOT] ENV loaded, POLISH_MODE=' + (process.env.POLISH_MODE || 'off'));
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Story Generator API Server Started    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📝 UI available at: http://localhost:${PORT}`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/generate`);
  console.log(`\n✨ Supported languages: 8 languages (uk, pl, en, de, pt, es, ja, ru)`);
  console.log(`🎭 Supported genres: 11 genres available\n`);

  // Security warnings
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY not set in .env file!\n');
  }

  if (process.env.NODE_ENV === 'production') {
    console.log('🔒 Production mode detected');
    console.warn('⚠️  IMPORTANT: Ensure you are running behind HTTPS (nginx/cloudflare/etc)');
    console.warn('⚠️  Never expose this server directly to internet without HTTPS!\n');
  }

  // Start counter service
  startCounterService();
});

// Export helper functions for use in other routes
export {
  authenticateUser,
  checkAndDeductBalance,
  refundBalance,
  calculateAudioCost,
  supabase,
  supabaseAdmin
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

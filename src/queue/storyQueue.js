/**
 * Story Generation Queue
 * Uses Bull for background job processing with Redis
 */
import Bull from 'bull';

// Redis connection configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for Bull
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`[QUEUE] Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
};

console.log(`[QUEUE] Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

// Health check for Redis connection
async function checkRedisHealth() {
  const IORedis = (await import('ioredis')).default;
  const testClient = new IORedis(redisConfig);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      testClient.disconnect();
      reject(new Error('Redis health check timeout (5s)'));
    }, 5000);

    testClient.ping((err, result) => {
      clearTimeout(timeout);
      testClient.disconnect();

      if (err) {
        reject(new Error(`Redis health check failed: ${err.message}`));
      } else if (result === 'PONG') {
        resolve(true);
      } else {
        reject(new Error('Redis health check returned unexpected response'));
      }
    });
  });
}

// Perform health check before creating queue
try {
  await checkRedisHealth();
  console.log('[QUEUE] ✅ Redis health check passed');
} catch (error) {
  console.error('[QUEUE] ❌ Redis health check failed:', error.message);
  console.error('[QUEUE] ⚠️  Queue will not function properly without Redis!');
  console.error('[QUEUE] Please ensure Redis is running:');
  console.error('[QUEUE]   - macOS: brew services start redis');
  console.error('[QUEUE]   - Linux: sudo systemctl start redis');
  console.error('[QUEUE]   - Docker: docker run -d -p 6379:6379 redis');
  // Don't exit - let the app start but log warnings
}

// Create queue for story generation
export const storyQueue = new Bull('story-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 1, // No automatic retries - we handle refunds manually
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs for debugging
  },
  limiter: {
    max: 15, // Maximum 15 concurrent jobs (matches WORKER_CONCURRENCY)
    duration: 1000, // Per second
  },
  settings: {
    // CRITICAL: Prevent false "stalled" job detection
    // Worker sends heartbeat every 20 seconds via job.progress()
    // Long stories can take 10-15 minutes - detect stalls after 15 minutes
    stalledInterval: 900000, // 15 minutes (in milliseconds) - longer than Anthropic API timeout
    maxStalledCount: 1, // Only mark as stalled once (prevent infinite retries)
    lockDuration: 3600000, // 1 hour - max time a job can be locked by one worker
  },
});

// Queue event listeners
storyQueue.on('error', (error) => {
  console.error('[QUEUE] Error:', error);
});

storyQueue.on('waiting', (jobId) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[QUEUE] Job ${jobId} is waiting`);
  }
});

storyQueue.on('active', (job) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[QUEUE] Job ${job.id} started processing`);
  }
});

storyQueue.on('completed', (job, result) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[QUEUE] Job ${job.id} completed successfully`);
  }
});

storyQueue.on('failed', (job, err) => {
  console.error(`[QUEUE] Job ${job.id} failed:`, err.message);
});

storyQueue.on('stalled', (job) => {
  console.warn(`[QUEUE] Job ${job.id} stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[QUEUE] Shutting down gracefully...');
  await storyQueue.close();
});

export default storyQueue;

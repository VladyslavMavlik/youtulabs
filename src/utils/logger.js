/**
 * Structured Logging with Pino
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  base: {
    env: process.env.NODE_ENV || 'production'
  }
});

/**
 * Create child logger for story generation
 */
export function createStoryLogger(storyId, metadata = {}) {
  return logger.child({
    storyId,
    ...metadata
  });
}

/**
 * Log metrics for observability
 */
export function logMetrics(logger, metrics) {
  logger.info({
    metrics: {
      tokens_in: metrics.tokens_in || 0,
      tokens_out: metrics.tokens_out || 0,
      cost_estimate: metrics.cost_estimate || 0,
      repetition_rate: metrics.repetition_rate || 0,
      pacing_flags_count: metrics.pacing_flags_count || 0,
      duration_ms: metrics.duration_ms || 0
    }
  }, 'Generation metrics');
}

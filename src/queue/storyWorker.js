/**
 * Story Generation Worker
 * Processes jobs from the queue in background
 */
import 'dotenv/config';
import { storyQueue } from './storyQueue.js';
import { StoryOrchestrator } from '../orchestrator.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with SERVICE ROLE key (bypasses RLS for backend operations)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ CRITICAL: Supabase credentials not found!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize orchestrator
const orchestrator = new StoryOrchestrator(process.env.ANTHROPIC_API_KEY);

// Worker concurrency - how many jobs can be processed simultaneously
// Default: 15 jobs (can be overridden via WORKER_CONCURRENCY env variable)
// To run multiple workers, simply start multiple instances of this script
// Bull Queue automatically distributes jobs between worker instances
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '15', 10);

console.log('[WORKER] Story generation worker starting...');
console.log(`[WORKER] Concurrency limit: ${WORKER_CONCURRENCY} jobs`);
console.log('[WORKER] To scale further, run multiple worker instances with: npm run worker');

// Helper function to refund balance ATOMICALLY (same atomic function as server.js)
// CRITICAL: Uses row-level locking and mandatory transaction logging
async function refundBalance(userId, amount, reason) {
  try {
    console.log(`[WORKER] Atomic refund: ${amount} crystals to user ${userId.substring(0, 8)}...`);

    // Call atomic refund function using service role client (bypasses RLS)
    const { data, error } = await supabase.rpc('refund_balance_atomic', {
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
      console.error('[WORKER] Refund RPC error:', error);
      return { success: false, error: 'Failed to refund balance' };
    }

    if (!data.success) {
      console.error('[WORKER] Refund failed:', data.error);
      return { success: false, error: data.error };
    }

    console.log(`[WORKER] ✅ Atomic refund successful: ${data.balanceBefore} + ${amount} = ${data.balanceAfter}`);

    return {
      success: true,
      newBalance: data.newBalance,
      transactionId: data.transactionId
    };
  } catch (error) {
    console.error('[WORKER] Unexpected refund error:', error);
    return { success: false, error: error.message };
  }
}

// Process jobs from the queue
storyQueue.process(WORKER_CONCURRENCY, async (job) => {
  const { userId, payload, jobId, cost } = job.data;

  console.log(`[WORKER] Processing job ${jobId} for user ${userId.substring(0, 8)}...`);

  // Heartbeat: Report progress every 20 seconds to prevent "stalled" detection
  let progressPercent = 0;
  const heartbeatInterval = setInterval(() => {
    progressPercent = Math.min(progressPercent + 5, 95); // Cap at 95% until done
    job.progress(progressPercent);
    console.log(`[WORKER] Job ${jobId} heartbeat: ${progressPercent}%`);
  }, 20000); // Every 20 seconds

  try {
    // Update job status in database to 'processing'
    await supabase
      .from('story_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('job_id', jobId);

    // Generate story using orchestrator
    const startTime = Date.now();
    const result = await orchestrator.generate(payload);
    const endTime = Date.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);

    // Clear heartbeat timer
    clearInterval(heartbeatInterval);

    console.log(`[WORKER] Job ${jobId} generation complete in ${durationSeconds}s`);

    // Save story to database
    const storyContent = result.chaptersMarkdown || result.chapters_markdown || result.chapters || result.markdown || result.text;

    if (!storyContent) {
      throw new Error('Story generation returned empty content');
    }

    const { data: savedStory, error: saveError} = await supabase
      .from('user_stories')
      .insert({
        user_id: userId,
        content: storyContent,
        genre: payload.genre,
        duration: payload.minutes,
        language: payload.language,
        metadata: {
          pov: payload.pov,
          audioMode: payload.audioMode,
          prompt: payload.prompt,
          generationTime: parseFloat(durationSeconds),
          quality: result.quality,
          meta: result.meta
        }
      })
      .select()
      .single();

    if (saveError) {
      throw new Error(`Failed to save story: ${saveError.message}`);
    }

    console.log(`[WORKER] Job ${jobId} story saved with ID: ${savedStory.id}`);

    // Increment global story counter for real-time stats
    try {
      const { error: counterError } = await supabase.rpc('increment_story_counter');
      if (counterError) {
        console.error(`[WORKER] Failed to increment global counter:`, counterError);
        // Non-critical error - don't fail the job
      }
    } catch (err) {
      console.error(`[WORKER] Exception incrementing global counter:`, err);
      // Non-critical error - continue
    }

    // CRITICAL: Use ATOMIC completion function to prevent race conditions
    // This function locks the job row and checks status in ONE transaction
    // Prevents race condition where another worker marks job as 'failed' while we're completing
    const { data: completionResult, error: completionError } = await supabase.rpc('complete_job_atomic', {
      p_job_id: jobId,
      p_story_id: savedStory.id,
      p_generation_time: parseFloat(durationSeconds),
      p_quality_score: typeof result.quality?.overallQuality === 'number' ? result.quality.overallQuality : 0,
      p_word_count: result.meta?.actual_words || 0
    });

    if (completionError) {
      console.error(`[WORKER] ❌ Atomic completion RPC error:`, completionError);
      throw new Error(`Failed to complete job atomically: ${completionError.message}`);
    }

    if (!completionResult.success) {
      if (completionResult.was_stalled) {
        console.warn(`[WORKER] ⚠️  Job ${jobId} was already failed/refunded (stalled + retried)`);
        console.warn(`[WORKER] Story was generated successfully but job was already refunded`);
        return {
          success: false,
          error: completionResult.error,
          wasStalled: true
        };
      }
      console.error(`[WORKER] Failed to complete job:`, completionResult.error);
      throw new Error(completionResult.error);
    }

    if (completionResult.was_duplicate) {
      console.warn(`[WORKER] ⚠️  Job ${jobId} already completed, skipping duplicate update`);
      return {
        success: true,
        storyId: savedStory.id,
        generationTime: parseFloat(durationSeconds),
        wasDuplicate: true
      };
    }

    console.log(`[WORKER] Job ${jobId} completed successfully`);

    return {
      success: true,
      storyId: savedStory.id,
      generationTime: parseFloat(durationSeconds)
    };

  } catch (error) {
    console.error(`[WORKER] Job ${jobId} failed:`, error);

    // Clear heartbeat timer on error
    clearInterval(heartbeatInterval);

    // CRITICAL: Use ATOMIC refund function to prevent double refunds
    // This function locks the job row and checks if already failed in ONE transaction
    // If refund successful, it also updates job status to 'failed'
    if (cost) {
      console.log(`[WORKER] 🔄 Attempting atomic refund for job ${jobId}...`);

      const { data: refundResult, error: refundError } = await supabase.rpc('refund_job_atomic', {
        p_job_id: jobId,
        p_user_id: userId,
        p_amount: cost,
        p_error_message: error.message || 'Unknown error'
      });

      if (refundError) {
        console.error(`[WORKER] ❌ Atomic refund RPC error:`, refundError);
        // Fallback: manually update job status (without refund to avoid double refund)
        await supabase
          .from('story_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: error.message
          })
          .eq('job_id', jobId);
      } else if (!refundResult.success) {
        // Refund was not performed (already refunded or job not found)
        console.log(`[WORKER] ⚠️ ${refundResult.error} (job: ${jobId})`);
      } else {
        // Refund successful
        console.log(`[WORKER] ✅ Atomic refund successful: +${cost} crystals → balance: ${refundResult.new_balance}`);
      }
    } else {
      // No cost to refund, just update job status
      console.log(`[WORKER] ⚠️ No cost to refund for job ${jobId}`);
      await supabase
        .from('story_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: error.message
        })
        .eq('job_id', jobId);
    }

    // DO NOT throw error! This would cause Bull Queue to retry the job
    // Job status is already updated to 'failed' by refund_job_atomic()
    // Return normally to mark Bull job as completed (even though it failed)
    return {
      success: false,
      error: error.message
    };
  }
});

console.log('[WORKER] Worker is ready and listening for jobs...');

// Graceful shutdown with timeout
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    console.log(`[WORKER] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`[WORKER] ${signal} received, shutting down gracefully...`);
  console.log('[WORKER] Waiting for active jobs to complete (max 5 minutes)...');

  // Set timeout to force exit after 5 minutes
  const forceExitTimer = setTimeout(() => {
    console.error('[WORKER] ⚠️  Graceful shutdown timeout! Force exiting...');
    console.error('[WORKER] Active job may have been interrupted.');
    process.exit(1);
  }, 300000); // 5 minutes

  try {
    // Close queue (waits for active jobs to finish)
    await storyQueue.close();
    clearTimeout(forceExitTimer);
    console.log('[WORKER] ✅ All jobs completed, exiting cleanly');
    process.exit(0);
  } catch (error) {
    console.error('[WORKER] Error during shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

-- Migration: Atomic Job Completion with Race Condition Protection
-- Created: 2025-12-09
-- Purpose: Prevent race conditions when multiple workers try to complete the same job

-- ==============================================================================
-- ATOMIC JOB COMPLETION FUNCTION
-- ==============================================================================
-- This function ATOMICALLY:
-- 1. Locks the job row (FOR UPDATE)
-- 2. Checks if job is still in 'processing' status
-- 3. Updates job status to 'completed'
-- 4. ALL in ONE transaction - impossible to have race condition
-- ==============================================================================

CREATE OR REPLACE FUNCTION complete_job_atomic(
  p_job_id TEXT,
  p_story_id UUID,
  p_generation_time NUMERIC,
  p_quality_score NUMERIC,
  p_word_count INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- CRITICAL: Lock the job row for the duration of this transaction
  -- This prevents two workers from completing the same job simultaneously
  SELECT status INTO v_current_status
  FROM story_jobs
  WHERE job_id = p_job_id
  FOR UPDATE;

  -- If job not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job not found',
      'job_id', p_job_id
    );
  END IF;

  -- If job is already completed, skip update (idempotency protection)
  IF v_current_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'error', 'Job already completed',
      'job_id', p_job_id,
      'status', v_current_status,
      'was_duplicate', true
    );
  END IF;

  -- If job was already failed/refunded, don't overwrite (protection)
  IF v_current_status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job already failed and refunded - cannot complete',
      'job_id', p_job_id,
      'status', v_current_status,
      'was_stalled', true
    );
  END IF;

  -- Job is in 'processing' status - proceed with completion
  UPDATE story_jobs
  SET
    status = 'completed',
    completed_at = NOW(),
    story_id = p_story_id,
    result = jsonb_build_object(
      'storyId', p_story_id,
      'generationTime', p_generation_time,
      'quality', p_quality_score,
      'words', p_word_count
    )
  WHERE job_id = p_job_id
    AND status = 'processing';  -- Conditional update: only if still processing

  -- Check if update was successful
  IF NOT FOUND THEN
    -- Status changed between our check and update (rare edge case)
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job status changed during update',
      'job_id', p_job_id
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'story_id', p_story_id,
    'completed', true
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permission to service_role (backend only, NOT users)
GRANT EXECUTE ON FUNCTION complete_job_atomic TO service_role;

-- ==============================================================================
-- TESTING
-- ==============================================================================
-- Test 1: Complete a job (should succeed)
-- SELECT complete_job_atomic('test-job-456', 'story-uuid'::uuid, 12.5, 0.85, 2500);

-- Test 2: Try to complete the SAME job again (should succeed with "already completed")
-- SELECT complete_job_atomic('test-job-456', 'story-uuid'::uuid, 12.5, 0.85, 2500);

-- Test 3: Verify job status
-- SELECT job_id, status, story_id, result FROM story_jobs WHERE job_id = 'test-job-456';

-- Migration: Atomic Job Refund with Idempotency Protection
-- Created: 2025-01-22
-- Purpose: Prevent double refunds when Bull Queue retries stalled jobs

-- ==============================================================================
-- ATOMIC JOB REFUND FUNCTION
-- ==============================================================================
-- This function ATOMICALLY:
-- 1. Locks the job row (FOR UPDATE)
-- 2. Checks if job is already failed/refunded
-- 3. Refunds balance (if not already refunded)
-- 4. Updates job status to 'failed'
-- 5. ALL in ONE transaction - impossible to refund twice
-- ==============================================================================

CREATE OR REPLACE FUNCTION refund_job_atomic(
  p_job_id TEXT,
  p_user_id UUID,
  p_amount INTEGER,
  p_error_message TEXT
) RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_refund_result JSONB;
BEGIN
  -- CRITICAL: Lock the job row for the duration of this transaction
  -- This prevents two workers from refunding the same job simultaneously
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

  -- If job is already failed, skip refund (idempotency protection)
  IF v_current_status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job already failed and refunded',
      'job_id', p_job_id,
      'status', v_current_status,
      'refunded', false
    );
  END IF;

  -- Job is not failed yet - proceed with refund
  -- Call refund_balance_atomic to refund the user
  SELECT refund_balance_atomic(
    p_user_id,
    p_amount,
    'Story generation failed - automatic refund',
    jsonb_build_object(
      'job_id', p_job_id,
      'error', p_error_message,
      'refund_amount', p_amount
    )
  ) INTO v_refund_result;

  -- Check if refund was successful
  IF (v_refund_result->>'success')::boolean = false THEN
    -- Refund failed - return error without updating job status
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Refund failed',
      'refund_error', v_refund_result->>'error',
      'job_id', p_job_id
    );
  END IF;

  -- Refund successful - update job status to 'failed'
  UPDATE story_jobs
  SET
    status = 'failed',
    completed_at = NOW(),
    error = p_error_message
  WHERE job_id = p_job_id;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'refunded', true,
    'refund_amount', p_amount,
    'new_balance', (v_refund_result->>'newBalance')::integer,
    'transaction_id', v_refund_result->>'transactionId'
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permission to service_role (backend only, NOT users)
GRANT EXECUTE ON FUNCTION refund_job_atomic TO service_role;

-- ==============================================================================
-- TESTING
-- ==============================================================================
-- Test 1: Refund a job (should succeed)
-- SELECT refund_job_atomic('test-job-123', 'user-uuid', 1000, 'Test error');

-- Test 2: Try to refund the SAME job again (should fail with "already refunded")
-- SELECT refund_job_atomic('test-job-123', 'user-uuid', 1000, 'Test error');

-- Test 3: Verify no duplicate refunds
-- SELECT * FROM balance_transactions WHERE metadata->>'job_id' = 'test-job-123';
-- Expected: ONLY 1 refund transaction

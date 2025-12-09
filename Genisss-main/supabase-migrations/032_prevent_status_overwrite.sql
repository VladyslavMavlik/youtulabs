-- Migration 032: Prevent Status Overwrite Protection
-- Created: 2025-01-25
-- Purpose: Prevent stalled jobs from overwriting 'failed' status to 'completed'
-- This prevents race conditions where:
-- 1. Worker A processes job (takes 10 minutes)
-- 2. Bull marks job as "stalled" (no heartbeat for 5 min)
-- 3. Worker B picks up stalled job, fails, marks as 'failed' + refunds
-- 4. Worker A completes and tries to UPDATE status='completed'
-- 5. WITHOUT this protection: status overwrites to 'completed' but refund already done ❌
-- 6. WITH this protection: UPDATE blocked, status stays 'failed' ✅

-- ==============================================================================
-- TRIGGER FUNCTION: Prevent Failed → Completed Transition
-- ==============================================================================

CREATE OR REPLACE FUNCTION prevent_failed_to_completed_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if status is being changed from 'failed' to 'completed'
  IF OLD.status = 'failed' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot change job status from "failed" to "completed". Job ID: %, Old status: %, New status: %',
      OLD.job_id, OLD.status, NEW.status
    USING HINT = 'This job has already been marked as failed and refunded. A stalled worker may have tried to complete it after another worker already processed the failure.';
  END IF;

  -- Allow all other status transitions
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- CREATE TRIGGER
-- ==============================================================================

-- Drop trigger if exists (for idempotent migrations)
DROP TRIGGER IF EXISTS prevent_failed_to_completed_trigger ON story_jobs;

-- Create trigger that fires BEFORE UPDATE on story_jobs table
CREATE TRIGGER prevent_failed_to_completed_trigger
  BEFORE UPDATE ON story_jobs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_failed_to_completed_transition();

-- ==============================================================================
-- TESTING
-- ==============================================================================

-- Test 1: Normal transition (should succeed)
-- UPDATE story_jobs SET status = 'completed' WHERE job_id = 'test-job' AND status = 'processing';

-- Test 2: Failed → Completed transition (should FAIL with exception)
-- UPDATE story_jobs SET status = 'failed' WHERE job_id = 'test-job';
-- UPDATE story_jobs SET status = 'completed' WHERE job_id = 'test-job';
-- Expected: ERROR: Cannot change job status from "failed" to "completed"

-- Test 3: Failed → Failed (should succeed, it's idempotent)
-- UPDATE story_jobs SET status = 'failed', error = 'Updated error' WHERE job_id = 'test-job';

-- ==============================================================================
-- ALLOWED STATUS TRANSITIONS
-- ==============================================================================
-- pending → processing ✅
-- pending → failed ✅
-- processing → completed ✅
-- processing → failed ✅
-- failed → failed ✅ (idempotent updates)
-- completed → completed ✅ (idempotent updates)
-- failed → completed ❌ (BLOCKED by this trigger)

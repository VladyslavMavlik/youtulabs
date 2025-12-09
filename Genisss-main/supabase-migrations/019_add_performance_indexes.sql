-- Performance Indexes for Story Jobs and Related Tables
-- Created: 2025-11-23
-- Purpose: Improve query performance for frequently accessed columns

-- =============================================
-- STORY_JOBS TABLE INDEXES
-- =============================================

-- Index on job_id (most frequently queried)
-- Used by: Realtime subscriptions, worker status updates, frontend polling
CREATE INDEX IF NOT EXISTS idx_story_jobs_job_id
ON public.story_jobs(job_id);

-- Index on user_id for user's job history
-- Used by: User dashboard, job listing per user
CREATE INDEX IF NOT EXISTS idx_story_jobs_user_id
ON public.story_jobs(user_id);

-- Index on status for querying pending/processing jobs
-- Used by: Admin panel, monitoring, queue health checks
CREATE INDEX IF NOT EXISTS idx_story_jobs_status
ON public.story_jobs(status);

-- Composite index for user_id + status (common query pattern)
-- Used by: "Show my active jobs", "Show my completed jobs"
CREATE INDEX IF NOT EXISTS idx_story_jobs_user_status
ON public.story_jobs(user_id, status);

-- Index on created_at for time-based queries
-- Used by: Cleanup jobs, analytics, "recent jobs"
CREATE INDEX IF NOT EXISTS idx_story_jobs_created_at
ON public.story_jobs(created_at DESC);

-- Composite index for cleanup queries (old failed jobs)
-- Used by: Scheduled cleanup scripts
CREATE INDEX IF NOT EXISTS idx_story_jobs_status_created
ON public.story_jobs(status, created_at)
WHERE status IN ('failed', 'completed');

-- =============================================
-- USER_STORIES TABLE INDEXES
-- =============================================

-- Index on user_id for fetching user's stories
CREATE INDEX IF NOT EXISTS idx_user_stories_user_id
ON public.user_stories(user_id);

-- Index on created_at for sorting by newest
CREATE INDEX IF NOT EXISTS idx_user_stories_created_at
ON public.user_stories(created_at DESC);

-- Composite index for user's recent stories
CREATE INDEX IF NOT EXISTS idx_user_stories_user_created
ON public.user_stories(user_id, created_at DESC);

-- =============================================
-- USER_BALANCES TABLE INDEXES
-- =============================================

-- Index on user_id (primary lookup)
-- Note: This might already exist as primary key
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id
ON public.user_balances(user_id);

-- Index on updated_at for monitoring recent balance changes
CREATE INDEX IF NOT EXISTS idx_user_balances_updated_at
ON public.user_balances(updated_at DESC);

-- =============================================
-- BALANCE_TRANSACTIONS TABLE INDEXES
-- =============================================

-- Index on user_id for transaction history
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id
ON public.balance_transactions(user_id);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at
ON public.balance_transactions(created_at DESC);

-- Composite index for user's recent transactions
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_created
ON public.balance_transactions(user_id, created_at DESC);

-- Index on type for filtering by transaction type
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type
ON public.balance_transactions(type);

-- =============================================
-- USER_SUBSCRIPTIONS TABLE INDEXES
-- =============================================

-- Index on user_id (primary lookup)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
ON public.user_subscriptions(user_id);

-- Index on status for active subscriptions
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
ON public.user_subscriptions(status);

-- Composite index for active user subscriptions
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status
ON public.user_subscriptions(user_id, status);

-- Index on expires_at for expiration checks
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at
ON public.user_subscriptions(expires_at)
WHERE expires_at IS NOT NULL;

-- =============================================
-- VERIFICATION
-- =============================================

-- Query to verify all indexes were created
DO $$
BEGIN
  RAISE NOTICE 'Index creation completed. Run the following query to verify:';
  RAISE NOTICE 'SELECT schemaname, tablename, indexname FROM pg_indexes WHERE schemaname = ''public'' AND tablename LIKE ''story_jobs'' OR tablename LIKE ''user_%'' ORDER BY tablename, indexname;';
END $$;

-- =============================================
-- PERFORMANCE NOTES
-- =============================================

-- These indexes will:
-- 1. Speed up job status lookups by 10-100x (depending on table size)
-- 2. Improve user dashboard load time (story history, balance, subscriptions)
-- 3. Enable efficient cleanup queries (old jobs, expired subscriptions)
-- 4. Support Realtime subscriptions with minimal latency

-- Trade-offs:
-- - Slightly slower INSERT/UPDATE operations (negligible for this use case)
-- - Additional storage (typically 10-20% of table size per index)

-- Maintenance:
-- PostgreSQL automatically maintains these indexes
-- Consider REINDEX if database grows >1M rows in any table

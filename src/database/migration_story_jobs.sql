-- Story Jobs Table
-- Tracks background job status for story generation
--
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS story_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id TEXT UNIQUE NOT NULL, -- Bull job ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job status
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Request payload
  payload JSONB NOT NULL, -- Original request (genre, language, minutes, etc.)

  -- Result
  story_id UUID, -- Story ID (no FK constraint as stories table may not exist)
  result JSONB, -- Generation results (quality, words, etc.)
  error TEXT, -- Error message if failed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_story_jobs_user_id ON story_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_story_jobs_job_id ON story_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_story_jobs_status ON story_jobs(status);
CREATE INDEX IF NOT EXISTS idx_story_jobs_created_at ON story_jobs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE story_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own jobs
CREATE POLICY "Users can view own jobs"
  ON story_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own jobs
CREATE POLICY "Users can insert own jobs"
  ON story_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do anything (for background worker)
CREATE POLICY "Service role full access"
  ON story_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON story_jobs TO authenticated;
GRANT ALL ON story_jobs TO service_role;

-- Function to cleanup old jobs (keep only last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_story_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM story_jobs
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND status IN ('completed', 'failed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup (optional - run manually or via cron)
-- SELECT cron.schedule('cleanup-old-jobs', '0 2 * * *', 'SELECT cleanup_old_story_jobs()');

COMMENT ON TABLE story_jobs IS 'Tracks background story generation jobs';
COMMENT ON COLUMN story_jobs.job_id IS 'Bull queue job ID';
COMMENT ON COLUMN story_jobs.status IS 'Current job status: pending, processing, completed, failed';
COMMENT ON COLUMN story_jobs.payload IS 'Original generation request payload';
COMMENT ON COLUMN story_jobs.result IS 'Generation results on success';

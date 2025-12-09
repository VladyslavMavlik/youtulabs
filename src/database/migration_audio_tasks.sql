-- Audio Tasks Table
-- Tracks Voice API synthesis tasks with Realtime support
--
-- Run this in Supabase SQL Editor

-- Create table for tracking audio synthesis tasks
CREATE TABLE IF NOT EXISTS audio_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Voice API task ID
  task_id INTEGER NOT NULL UNIQUE,

  -- User reference
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Task status (from Voice API)
  -- waiting, processing, ending, ending_processed, error, error_handled
  status TEXT NOT NULL DEFAULT 'waiting',

  -- Input data
  text TEXT NOT NULL,
  voice_template_id TEXT DEFAULT 'default',
  character_count INTEGER NOT NULL,

  -- Billing
  crystals_cost INTEGER NOT NULL,
  crystals_refunded BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ, -- When processing started
  completed_at TIMESTAMPTZ, -- When ending_processed

  -- Result data (optional)
  result JSONB,
  error TEXT
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_audio_tasks_user_id ON audio_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_tasks_task_id ON audio_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_audio_tasks_status ON audio_tasks(status);
CREATE INDEX IF NOT EXISTS idx_audio_tasks_created_at ON audio_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_tasks_user_status ON audio_tasks(user_id, status);

-- Enable Row Level Security
ALTER TABLE audio_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own tasks
CREATE POLICY "Users can view own audio tasks"
  ON audio_tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own tasks
CREATE POLICY "Users can insert own audio tasks"
  ON audio_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own tasks (for status changes)
CREATE POLICY "Users can update own audio tasks"
  ON audio_tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access to audio tasks"
  ON audio_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON audio_tasks TO authenticated;
GRANT ALL ON audio_tasks TO service_role;

-- Enable Realtime for this table
-- This allows frontend to subscribe to changes
ALTER PUBLICATION supabase_realtime ADD TABLE audio_tasks;

-- Function to cleanup old completed tasks (optional)
-- Can be called periodically to remove old records
CREATE OR REPLACE FUNCTION cleanup_old_audio_tasks(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audio_tasks
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
  AND status IN ('ending_processed', 'error', 'error_handled');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active tasks for user
CREATE OR REPLACE FUNCTION get_active_audio_tasks(p_user_id UUID)
RETURNS SETOF audio_tasks AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM audio_tasks
  WHERE user_id = p_user_id
  AND status NOT IN ('ending_processed', 'error', 'error_handled')
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE audio_tasks IS 'Tracks Voice API synthesis tasks with Realtime support';
COMMENT ON COLUMN audio_tasks.task_id IS 'Voice API task ID';
COMMENT ON COLUMN audio_tasks.status IS 'Task status: waiting, processing, ending, ending_processed, error, error_handled';
COMMENT ON COLUMN audio_tasks.crystals_refunded IS 'Whether crystals were refunded for failed task';
COMMENT ON FUNCTION cleanup_old_audio_tasks IS 'Cleanup old completed/errored tasks older than N days';
COMMENT ON FUNCTION get_active_audio_tasks IS 'Get all active (in-progress) tasks for a user';

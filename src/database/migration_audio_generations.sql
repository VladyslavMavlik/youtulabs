-- Audio Generations Table
-- Tracks user audio generations with automatic numbering
--
-- Run this in Supabase SQL Editor

-- Create table for tracking audio generations
CREATE TABLE IF NOT EXISTS audio_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sequential audio number per user (1, 2, 3, ...)
  audio_number INTEGER NOT NULL,

  -- Storage information
  storage_path TEXT NOT NULL, -- Supabase Storage path: {userId}/audio_{number}.mp3
  file_size_bytes BIGINT, -- File size in bytes
  duration_seconds NUMERIC(10,2), -- Audio duration in seconds

  -- Metadata
  metadata JSONB, -- Additional info: title, language, voice_id, etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique audio numbers per user
  UNIQUE(user_id, audio_number)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_audio_generations_user_id ON audio_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_generations_created_at ON audio_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_generations_user_number ON audio_generations(user_id, audio_number);

-- Enable Row Level Security
ALTER TABLE audio_generations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own audio generations
CREATE POLICY "Users can view own audio generations"
  ON audio_generations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own audio generations
CREATE POLICY "Users can insert own audio generations"
  ON audio_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own audio generations
CREATE POLICY "Users can delete own audio generations"
  ON audio_generations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access to audio"
  ON audio_generations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON audio_generations TO authenticated;
GRANT ALL ON audio_generations TO service_role;

-- Function to get next audio number for user
-- Ensures atomic number generation
CREATE OR REPLACE FUNCTION get_next_audio_number(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Lock the table for this user to prevent race conditions
  PERFORM 1 FROM audio_generations
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Get max number for user and add 1 (or start at 1)
  SELECT COALESCE(MAX(audio_number), 0) + 1
  INTO next_number
  FROM audio_generations
  WHERE user_id = p_user_id;

  RETURN next_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old audio generations (optional)
-- Can be used to implement retention policies
CREATE OR REPLACE FUNCTION cleanup_old_audio_generations(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audio_generations
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE audio_generations IS 'Tracks user audio generations with automatic numbering per user';
COMMENT ON COLUMN audio_generations.audio_number IS 'Sequential number per user (1, 2, 3, ...)';
COMMENT ON COLUMN audio_generations.storage_path IS 'Path in Supabase Storage bucket';
COMMENT ON COLUMN audio_generations.metadata IS 'Additional metadata: title, language, voice_id, etc.';
COMMENT ON FUNCTION get_next_audio_number IS 'Returns next available audio number for user';

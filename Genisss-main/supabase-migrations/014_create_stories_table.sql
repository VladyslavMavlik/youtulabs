-- Stories table to store user-generated stories
CREATE TABLE IF NOT EXISTS user_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  genre TEXT,
  duration INTEGER, -- in minutes
  language TEXT,
  metadata JSONB DEFAULT '{}', -- Store additional info like POV, audio mode, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_stories_user_id ON user_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stories_created_at ON user_stories(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own stories" ON user_stories;
DROP POLICY IF EXISTS "Users can insert own stories" ON user_stories;
DROP POLICY IF EXISTS "Users can update own stories" ON user_stories;
DROP POLICY IF EXISTS "Users can delete own stories" ON user_stories;

-- Users can only view their own stories
CREATE POLICY "Users can view own stories"
  ON user_stories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own stories
CREATE POLICY "Users can insert own stories"
  ON user_stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own stories
CREATE POLICY "Users can update own stories"
  ON user_stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own stories
CREATE POLICY "Users can delete own stories"
  ON user_stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to get user stories
CREATE OR REPLACE FUNCTION get_user_stories(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  genre TEXT,
  duration INTEGER,
  language TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.content,
    s.genre,
    s.duration,
    s.language,
    s.metadata,
    s.created_at
  FROM user_stories s
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC;
END;
$$;

COMMENT ON TABLE user_stories IS 'Stores user-generated stories';
COMMENT ON FUNCTION get_user_stories IS 'Get all stories for a specific user';

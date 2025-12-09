-- Update get_next_audio_number function to use FOR UPDATE lock
-- This prevents race conditions when multiple requests come simultaneously

CREATE OR REPLACE FUNCTION get_next_audio_number(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Lock the table for this user to prevent race conditions
  -- This ensures only one request at a time can get a number for this user
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

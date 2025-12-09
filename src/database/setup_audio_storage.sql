-- Supabase Storage Setup for Audio Generations
-- Run this in Supabase SQL Editor or Dashboard
--
-- IMPORTANT: File size limits
-- - Supabase FREE tier: 50 MB global limit (cannot be changed)
-- - Supabase PRO tier: Can increase to 100 MB+ in Settings > Storage
--
-- For FREE tier: Code automatically validates 50 MB limit
-- For PRO tier: Increase limit in Dashboard, then update MAX_FILE_SIZE in audioStorage.js
--
-- Create bucket in Supabase Dashboard: Storage > Create Bucket
--    Name: "audio-generations"
--    Public: false
--    File size limit: 50 MB
--    Allowed MIME types: audio/mpeg, audio/mp3

-- Create storage bucket for audio files (if not exists)
-- Note: This may need to be done via Supabase Dashboard
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('audio-generations', 'audio-generations', false)
-- ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload their own audio files
-- Path format: {userId}/audio_{number}.mp3
CREATE POLICY "Users can upload own audio files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audio-generations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can view their own audio files
CREATE POLICY "Users can view own audio files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio-generations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can delete their own audio files
CREATE POLICY "Users can delete own audio files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio-generations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Service role has full access (for backend operations)
CREATE POLICY "Service role full access to audio bucket"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'audio-generations')
  WITH CHECK (bucket_id = 'audio-generations');

-- Instructions for manual bucket creation in Supabase Dashboard:
--
-- STEP 1: Increase global file size limit (REQUIRED!)
--   Go to: Settings > Storage > File upload limit
--   Change from: 50 MB → 100 MB (or higher)
--   Save changes
--
-- STEP 2: Create bucket
--   1. Go to Storage section in Supabase Dashboard
--   2. Click "Create Bucket"
--   3. Settings:
--      - Name: audio-generations
--      - Public: OFF (private bucket)
--      - File size limit: 50 MB (can increase later)
--      - Allowed MIME types: audio/mpeg, audio/mp3
--   4. After creation, the policies above will automatically apply

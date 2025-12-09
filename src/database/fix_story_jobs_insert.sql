-- Fix story_jobs INSERT for backend service
-- Allow service role (backend) to insert jobs

-- Drop the restrictive authenticated-only policy
DROP POLICY IF EXISTS "Users can insert own jobs" ON story_jobs;

-- Recreate with support for both authenticated users and service role
CREATE POLICY "Users and service can insert jobs"
  ON story_jobs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    -- Either user is authenticated and owns the job
    (auth.uid() = user_id)
    -- Or it's being inserted by the service (when auth.uid() is null)
    OR (auth.uid() IS NULL)
  );

-- Also ensure service role policy exists
DROP POLICY IF EXISTS "Service role full access" ON story_jobs;
CREATE POLICY "Service role full access"
  ON story_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'story_jobs'
ORDER BY policyname;

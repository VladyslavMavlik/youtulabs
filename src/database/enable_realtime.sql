-- Enable Realtime for story_jobs table
-- Run this in Supabase SQL Editor if you prefer SQL approach

ALTER PUBLICATION supabase_realtime ADD TABLE story_jobs;

-- Verify it's enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'story_jobs';

-- Expected result: 1 row showing story_jobs is in supabase_realtime publication

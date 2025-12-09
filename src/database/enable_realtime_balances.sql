-- Enable Realtime for user_balances table
-- Run this in Supabase SQL Editor

ALTER PUBLICATION supabase_realtime ADD TABLE user_balances;

-- Verify it's enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'user_balances';

-- Expected result: 1 row showing user_balances is in supabase_realtime publication

-- Quick verification query to check if atomic functions exist
-- Run this in Supabase SQL Editor to verify migration was applied

SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'deduct_balance_atomic',
    'refund_balance_atomic',
    'add_balance_atomic'
  )
ORDER BY routine_name;

-- Expected result: 3 rows with type 'FUNCTION'
-- If you see 0 rows, the migration hasn't been applied yet

-- Cleanup script: Remove all old versions of validation functions
-- Run this FIRST before running migration 016

-- Drop all possible versions of check_email_exists
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT, TEXT) CASCADE;

-- Drop all possible versions of check_username_exists
DROP FUNCTION IF EXISTS public.check_username_exists(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_username_exists(TEXT, TEXT) CASCADE;

-- Drop all possible versions of check_rate_limit
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) CASCADE;

-- Drop cleanup function if exists
DROP FUNCTION IF EXISTS public.cleanup_old_validation_attempts() CASCADE;

-- List remaining functions (for verification)
SELECT
  routine_name,
  routine_type,
  specific_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%check%'
ORDER BY routine_name;

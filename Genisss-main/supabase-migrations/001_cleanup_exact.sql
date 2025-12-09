-- Cleanup: Remove exact old functions before migration 016

-- Drop old rate limiting functions
DROP FUNCTION IF EXISTS public.check_rate_limit(p_function_name text, p_max_calls integer, p_window_minutes integer) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_rate_limit_logs() CASCADE;

-- Drop any other versions that might exist
DROP FUNCTION IF EXISTS public.check_email_exists(text) CASCADE;
DROP FUNCTION IF EXISTS public.check_email_exists(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.check_username_exists(text) CASCADE;
DROP FUNCTION IF EXISTS public.check_username_exists(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_validation_attempts() CASCADE;

-- Success message
SELECT 'Old functions dropped successfully. Now run migration 016.' as status;

-- Migration: Add rate limiting for email/username checks
-- Prevents user enumeration attacks by limiting check frequency

-- Drop all existing versions of these functions to avoid conflicts
-- This includes functions from migration 015 and any previous attempts
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT);
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_username_exists(TEXT);
DROP FUNCTION IF EXISTS public.check_username_exists(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER);

-- Create table to track check attempts
CREATE TABLE IF NOT EXISTS public.validation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  check_type TEXT NOT NULL, -- 'email' or 'username'
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_validation_attempts_ip_time
ON public.validation_attempts(ip_address, attempted_at);

-- Auto-delete old records (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_validation_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.validation_attempts
  WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip_address TEXT,
  p_check_type TEXT,
  p_max_attempts INTEGER DEFAULT 10,
  p_time_window_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempt_count INTEGER;
BEGIN
  -- Clean up old attempts first
  PERFORM public.cleanup_old_validation_attempts();

  -- Count recent attempts from this IP
  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.validation_attempts
  WHERE ip_address = p_ip_address
    AND check_type = p_check_type
    AND attempted_at > NOW() - (p_time_window_minutes || ' minutes')::INTERVAL;

  -- If under limit, record this attempt and allow
  IF v_attempt_count < p_max_attempts THEN
    INSERT INTO public.validation_attempts (ip_address, check_type, attempted_at)
    VALUES (p_ip_address, p_check_type, NOW());
    RETURN TRUE;
  END IF;

  -- Over limit - deny
  RETURN FALSE;
END;
$$;

-- Update check_email_exists with rate limiting
CREATE OR REPLACE FUNCTION public.check_email_exists(
  p_email TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_rate_limit_ok BOOLEAN;
BEGIN
  -- Check rate limit if IP provided
  IF p_ip_address IS NOT NULL THEN
    v_rate_limit_ok := public.check_rate_limit(p_ip_address, 'email', 10, 5);

    IF NOT v_rate_limit_ok THEN
      RETURN jsonb_build_object(
        'exists', NULL,
        'error', 'Too many attempts. Please try again in a few minutes.',
        'rate_limited', TRUE
      );
    END IF;
  END IF;

  -- Check if email exists
  SELECT COUNT(*)
  INTO v_count
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email);

  RETURN jsonb_build_object(
    'exists', v_count > 0,
    'error', NULL,
    'rate_limited', FALSE
  );
END;
$$;

-- Update check_username_exists with rate limiting
CREATE OR REPLACE FUNCTION public.check_username_exists(
  p_username TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_rate_limit_ok BOOLEAN;
BEGIN
  -- Check rate limit if IP provided
  IF p_ip_address IS NOT NULL THEN
    v_rate_limit_ok := public.check_rate_limit(p_ip_address, 'username', 10, 5);

    IF NOT v_rate_limit_ok THEN
      RETURN jsonb_build_object(
        'exists', NULL,
        'error', 'Too many attempts. Please try again in a few minutes.',
        'rate_limited', TRUE
      );
    END IF;
  END IF;

  -- Check if username exists
  SELECT COUNT(*)
  INTO v_count
  FROM auth.users
  WHERE LOWER(raw_user_meta_data->>'name') = LOWER(p_username)
     OR LOWER(raw_user_meta_data->>'full_name') = LOWER(p_username)
     OR LOWER(raw_user_meta_data->>'display_name') = LOWER(p_username);

  RETURN jsonb_build_object(
    'exists', v_count > 0,
    'error', NULL,
    'rate_limited', FALSE
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_exists(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_exists(TEXT, TEXT) TO anon;

-- Row Level Security for validation_attempts table
ALTER TABLE public.validation_attempts ENABLE ROW LEVEL SECURITY;

-- Allow the functions to insert/delete
CREATE POLICY "Allow system to manage validation attempts"
ON public.validation_attempts
FOR ALL
TO authenticated, anon
USING (TRUE)
WITH CHECK (TRUE);

-- Comments
COMMENT ON TABLE public.validation_attempts IS 'Tracks validation check attempts for rate limiting';
COMMENT ON FUNCTION public.check_rate_limit IS 'Checks if IP has exceeded rate limit for validation checks';
COMMENT ON FUNCTION public.check_email_exists IS 'Checks if email exists with rate limiting (max 10 per 5 min)';
COMMENT ON FUNCTION public.check_username_exists IS 'Checks if username exists with rate limiting (max 10 per 5 min)';

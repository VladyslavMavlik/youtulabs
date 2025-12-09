-- CRITICAL SECURITY FIX
-- Users can modify their own user_metadata through supabase.auth.updateUser()
-- We need to store admin role in a separate table that users cannot modify

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Only allow admins to view admin list
CREATE POLICY "Only admins can view admin list"
  ON admin_users FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT user_id FROM admin_users WHERE user_id = auth.uid())
  );

-- Nobody can insert/update/delete through normal queries (only through functions)
CREATE POLICY "No direct modifications"
  ON admin_users FOR ALL
  TO authenticated
  USING (false);

-- Secure is_admin() function - checks admin_users table instead of user_metadata
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_users
    WHERE user_id = auth.uid()
  );
$$;

-- Function to grant admin role (only existing admins can grant)
CREATE OR REPLACE FUNCTION grant_admin_role(p_user_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only admins can grant admin role.';
  END IF;

  -- Insert into admin_users table
  INSERT INTO admin_users (user_id, granted_by, notes)
  VALUES (p_user_id, auth.uid(), p_notes)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Function to revoke admin role (only existing admins can revoke)
CREATE OR REPLACE FUNCTION revoke_admin_role(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only admins can revoke admin role.';
  END IF;

  -- Don't allow revoking your own admin role
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own admin role.';
  END IF;

  -- Delete from admin_users table
  DELETE FROM admin_users
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;

COMMENT ON TABLE admin_users IS 'Stores admin users - separate from user_metadata for security';
COMMENT ON FUNCTION is_admin IS 'Check if current user is admin (SECURE: checks admin_users table)';
COMMENT ON FUNCTION grant_admin_role IS 'Grant admin role to user (admin only)';
COMMENT ON FUNCTION revoke_admin_role IS 'Revoke admin role from user (admin only)';

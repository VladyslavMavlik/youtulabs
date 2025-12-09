-- Fix user_balances RLS policies
-- Allow users to create their own balance record if it doesn't exist

-- Drop existing INSERT policy if exists
DROP POLICY IF EXISTS "Users can insert own balance" ON user_balances;

-- Create policy to allow users to insert their own balance
CREATE POLICY "Users can insert own balance"
  ON user_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Ensure UPDATE policy exists for authenticated users
DROP POLICY IF EXISTS "Users can update own balance" ON user_balances;

CREATE POLICY "Users can update own balance"
  ON user_balances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_balances'
ORDER BY policyname;

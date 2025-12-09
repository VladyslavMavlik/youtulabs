-- Fix balance_transactions RLS policies
-- Allow users to insert their own transaction records

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert own transactions" ON balance_transactions;
DROP POLICY IF EXISTS "Users can view own transactions" ON balance_transactions;

-- Policy: Users can insert their own transactions
CREATE POLICY "Users can insert own transactions"
  ON balance_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON balance_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'balance_transactions'
ORDER BY policyname;

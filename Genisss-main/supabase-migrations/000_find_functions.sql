-- Find all versions of check functions
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  'DROP FUNCTION IF EXISTS ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ') CASCADE;' as drop_statement
FROM pg_proc p
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%check%' OR p.proname LIKE '%cleanup%')
ORDER BY p.proname, arguments;

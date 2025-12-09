-- Add Test Mode variant IDs to get_lemonsqueezy_plan_info function
-- Test Mode IDs: Starter=1134259, Pro=1134267, Ultimate=1134281

CREATE OR REPLACE FUNCTION get_lemonsqueezy_plan_info(p_variant_id TEXT)
RETURNS TABLE(plan_type TEXT, credits INTEGER, price_usd DECIMAL)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Variant IDs from LemonSqueezy:
  -- Live Mode:
  -- Starter Plan: 720643 -> 2000 crystals, $8
  -- Pro Plan: 720649 -> 6000 crystals, $19.99
  -- Ultimate Plan: 720658 -> 20000 crystals, $49.99
  --
  -- Test Mode:
  -- Starter Plan: 1134259 -> 2000 crystals, $8
  -- Pro Plan: 1134267 -> 6000 crystals, $19.99
  -- Ultimate Plan: 1134281 -> 20000 crystals, $49.99

  RETURN QUERY
  SELECT
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 'starter'::TEXT
      WHEN '720649' THEN 'pro'::TEXT
      WHEN '720658' THEN 'ultimate'::TEXT
      -- Test Mode
      WHEN '1134259' THEN 'starter'::TEXT
      WHEN '1134267' THEN 'pro'::TEXT
      WHEN '1134281' THEN 'ultimate'::TEXT
      ELSE 'unknown'::TEXT
    END,
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 2000
      WHEN '720649' THEN 6000
      WHEN '720658' THEN 20000
      -- Test Mode
      WHEN '1134259' THEN 2000
      WHEN '1134267' THEN 6000
      WHEN '1134281' THEN 20000
      ELSE 0
    END,
    CASE p_variant_id
      -- Live Mode
      WHEN '720643' THEN 8.00::DECIMAL
      WHEN '720649' THEN 19.99::DECIMAL
      WHEN '720658' THEN 49.99::DECIMAL
      -- Test Mode
      WHEN '1134259' THEN 8.00::DECIMAL
      WHEN '1134267' THEN 19.99::DECIMAL
      WHEN '1134281' THEN 49.99::DECIMAL
      ELSE 0.00::DECIMAL
    END;
END;
$$;

COMMENT ON FUNCTION get_lemonsqueezy_plan_info IS 'Map variant_id to plan type and credits (supports both Live and Test mode)';

-- FIX: cancel_user_subscription should DELETE the subscription, not just set status to cancelled

CREATE OR REPLACE FUNCTION cancel_user_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id TEXT;
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Get plan_id before deleting
  SELECT plan_id INTO v_plan_id
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  -- If no subscription exists, return true anyway
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  -- Log cancellation to history before deleting
  INSERT INTO subscription_history (user_id, plan_id, action, metadata)
  VALUES (p_user_id, v_plan_id, 'cancelled', jsonb_build_object('admin_id', auth.uid()));

  -- Delete the subscription completely
  DELETE FROM user_subscriptions
  WHERE user_id = p_user_id;

  -- Also remove subscription_plan from user metadata
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data - 'subscription_plan'
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION cancel_user_subscription IS 'Cancel and DELETE user subscription completely (admin only)';

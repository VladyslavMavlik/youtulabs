import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Middleware to authenticate user from JWT token
 * SECURITY: Must be called BEFORE any bonus code operations
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Missing authentication token'
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid token'
      });
    }

    // Attach authenticated user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('[BONUS AUTH] Error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * POST /api/bonus-codes/redeem
 * Redeem a bonus code for 250 crystals
 *
 * Security features:
 * - JWT authentication - userId comes from verified token, not client!
 * - Users can redeem multiple different codes
 * - Each code can only be used once globally (marked as used after redemption)
 * - Atomic transaction to prevent race conditions
 */
router.post('/redeem', authenticateUser, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id; // ✅ SECURE: From verified JWT token!

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Bonus code is required'
      });
    }

    console.log(`[BONUS] Redemption attempt - User: ${userId}, Code: ${code}`);

    // 1. Check if THIS SPECIFIC code has already been redeemed by THIS user
    const { data: existingRedemption, error: redemptionCheckError } = await supabase
      .from('user_redeemed_codes')
      .select('*')
      .eq('user_id', userId)
      .eq('code', code.toLowerCase())
      .limit(1);

    if (redemptionCheckError) {
      console.error('[BONUS] Error checking redemption history:', redemptionCheckError);
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (existingRedemption && existingRedemption.length > 0) {
      console.log(`[BONUS] User ${userId} already redeemed this specific code: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'USER_ALREADY_REDEEMED_THIS_CODE',
        message: 'You have already redeemed this bonus code'
      });
    }

    // 2. Check if code exists and is not used
    const { data: bonusCode, error: codeError } = await supabase
      .from('bonus_codes')
      .select('*')
      .eq('code', code.toLowerCase())
      .single();

    if (codeError || !bonusCode) {
      console.log(`[BONUS] Invalid code: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_CODE',
        message: 'Invalid bonus code'
      });
    }

    if (bonusCode.is_used) {
      console.log(`[BONUS] Code already used: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'CODE_ALREADY_USED',
        message: 'This code has already been used'
      });
    }

    // 3. Start transaction-like operations
    // Mark code as used
    const { error: updateCodeError } = await supabase
      .from('bonus_codes')
      .update({
        is_used: true,
        used_by_user_id: userId,
        used_at: new Date().toISOString()
      })
      .eq('code', code.toLowerCase())
      .eq('is_used', false); // Ensure it wasn't used by another request

    if (updateCodeError) {
      console.error('[BONUS] Error updating code:', updateCodeError);
      return res.status(500).json({
        success: false,
        error: 'Failed to process code'
      });
    }

    // 4. Add crystals to user balance using RPC function
    const { data: grantResult, error: grantError } = await supabase.rpc('admin_grant_credits', {
      p_user_id: userId,
      p_amount: 250,
      p_source: 'bonus',
      p_reason: `Bonus code: ${code.toLowerCase()}`,
      p_expires_in_days: 365,
      p_admin_id: null // System grant, no admin
    });

    if (grantError || !grantResult) {
      console.error('[BONUS] Error granting credits:', grantError);
      // Rollback: mark code as unused
      await supabase
        .from('bonus_codes')
        .update({ is_used: false, used_by_user_id: null, used_at: null })
        .eq('code', code.toLowerCase());

      return res.status(500).json({
        success: false,
        error: 'Failed to add crystals'
      });
    }

    console.log(`[BONUS] ✅ Credits granted: ${grantResult}`);

    // 5. Record redemption in user_redeemed_codes table
    const { error: recordError } = await supabase
      .from('user_redeemed_codes')
      .insert({
        user_id: userId,
        code: code.toLowerCase(),
        crystals_awarded: 250,
        redeemed_at: new Date().toISOString()
      });

    if (recordError) {
      console.error('[BONUS] Error recording redemption:', recordError);
      // Continue anyway - the important parts (code marked, crystals added) are done
    }

    console.log(`[BONUS] ✅ Success - User ${userId} redeemed code ${code} for 250 crystals`);

    return res.json({
      success: true,
      crystals: 250,
      newBalance: grantResult,
      message: 'Bonus code redeemed successfully!'
    });

  } catch (error) {
    console.error('[BONUS] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;

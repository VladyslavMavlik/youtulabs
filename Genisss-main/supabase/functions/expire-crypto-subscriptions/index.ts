import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

/**
 * Cron job для згоряння підписочних кредитів через 30 днів
 * Запускається щодня о 00:00 UTC
 *
 * ВАЖЛИВО:
 * - Згорають ТІЛЬКИ підписочні кредити (з crypto_subscription_credits)
 * - Вічні кредити (окремі покупки) НЕ ЧІПАЮТЬСЯ
 * - Поточні баланси користувачів залишаються без змін якщо немає прострочених підписок
 */

Deno.serve(async () => {
  console.log('[CRON] 🕐 Starting crypto subscriptions expiration job...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Викликаємо SQL функцію яка маркує підписки як expired
    const { data: expiredSubs, error: sqlError } = await supabase.rpc('expire_crypto_subscriptions');

    if (sqlError) {
      console.error('[CRON] ❌ SQL error:', sqlError);
      return new Response(JSON.stringify({
        error: 'SQL error',
        details: sqlError
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      console.log('[CRON] ✅ No expired subscriptions found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No expired subscriptions',
        expired_count: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[CRON] 📋 Found ${expiredSubs.length} expired subscription(s)`);

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    // Обробляємо кожну прострочену підписку
    for (const sub of expiredSubs) {
      try {
        console.log(`[CRON] 🔄 Processing user ${sub.user_id}: burning ${sub.credits_burned} credits`);

        // Отримуємо поточний баланс з kv_store
        const currentBalance = await kv.get(`user:${sub.user_id}:balance`) || 0;

        // Віднімаємо згорілі кредити (але не менше 0)
        const newBalance = Math.max(0, currentBalance - sub.credits_burned);

        // Якщо баланс менший ніж треба відняти - логуємо WARNING
        if (currentBalance < sub.credits_burned) {
          console.warn(`[CRON] ⚠️ User ${sub.user_id} has insufficient balance! ` +
            `Current: ${currentBalance}, Need to burn: ${sub.credits_burned}, Setting to 0`);
        }

        // Оновлюємо баланс в kv_store
        await kv.set(`user:${sub.user_id}:balance`, newBalance);

        console.log(`[CRON] ✅ User ${sub.user_id}: ${currentBalance} → ${newBalance} (burned: ${sub.credits_burned})`);

        successCount++;
        results.push({
          user_id: sub.user_id,
          plan_type: sub.plan_type,
          credits_burned: sub.credits_burned,
          balance_before: currentBalance,
          balance_after: newBalance,
          status: 'success'
        });

      } catch (error) {
        console.error(`[CRON] ❌ Error processing user ${sub.user_id}:`, error);
        errorCount++;
        results.push({
          user_id: sub.user_id,
          plan_type: sub.plan_type,
          credits_burned: sub.credits_burned,
          status: 'error',
          error: error.message
        });
      }
    }

    const summary = {
      success: true,
      total_expired: expiredSubs.length,
      processed_success: successCount,
      processed_errors: errorCount,
      timestamp: new Date().toISOString(),
      results: results
    };

    console.log('[CRON] 🎉 Job completed:', {
      total: expiredSubs.length,
      success: successCount,
      errors: errorCount
    });

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CRON] ❌ Fatal error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

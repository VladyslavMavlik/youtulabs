const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://xcqjtdfvsgvuglllxgzc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Тестовий користувач (реальний з БД)
const TEST_USER_ID = 'eaff23a1-7902-4a49-a514-1a3c48e35d84'; // asianvladnam@gmail.com

async function test1_CreateTestPayment() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('TEST 1: Створення тестового платежу');
  console.log('═══════════════════════════════════════════════════════');

  const orderId = `YTL-TEST-${Date.now()}`;
  const paymentId = `TEST_${Date.now()}`;

  const { data, error } = await supabase
    .from('crypto_payments')
    .insert({
      payment_id: paymentId,
      user_id: TEST_USER_ID,
      order_id: orderId,
      plan_type: 'starter',
      amount_usd: 8,
      crypto_currency: 'btc',
      crypto_amount: 0.001,
      payment_address: 'test_address',
      status: 'waiting'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error:', error.message);
    return null;
  }

  console.log('✅ Payment created:');
  console.log('  Payment ID:', paymentId);
  console.log('  Order ID:', orderId);
  console.log('  User ID:', TEST_USER_ID);
  console.log('  Plan:', 'starter');
  console.log('  Status:', 'waiting');

  return { paymentId, orderId };
}

async function test2_ProcessWebhook(paymentId, orderId) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('TEST 2: Обробка webhook через RPC');
  console.log('═══════════════════════════════════════════════════════');

  const { data: webhookId, error } = await supabase.rpc('process_nowpayments_webhook', {
    p_payment_id: paymentId,
    p_order_id: orderId,
    p_payment_status: 'finished',
    p_signature: 'test_signature',
    p_signature_verified: false,
    p_raw_data: {
      payment_id: paymentId,
      order_id: orderId,
      payment_status: 'finished',
      pay_amount: 0.001,
      pay_currency: 'btc'
    }
  });

  if (error) {
    console.error('❌ RPC Error:', error.message);
    return false;
  }

  console.log('✅ Webhook processed:');
  console.log('  Webhook ID:', webhookId);

  // Перевірка: чи створено запис в crypto_webhooks
  const { data: webhook } = await supabase
    .from('crypto_webhooks')
    .select('*')
    .eq('id', webhookId)
    .single();

  console.log('  Processed:', webhook.processed);
  console.log('  Status:', webhook.payment_status);

  return true;
}

async function test3_GrantCredits(paymentId) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('TEST 3: Зарахування кредитів');
  console.log('═══════════════════════════════════════════════════════');

  // Отримуємо баланс до
  const { data: balanceBefore } = await supabase.rpc('get_user_balance_from_kv', {
    p_user_id: TEST_USER_ID
  });

  console.log('  Balance before:', balanceBefore);

  // Викликаємо функцію зарахування
  const { data: creditId, error } = await supabase.rpc('process_crypto_subscription_payment', {
    p_payment_id: paymentId,
    p_user_id: TEST_USER_ID,
    p_plan_type: 'starter',
    p_credits_amount: 2000
  });

  if (error) {
    console.error('❌ Error:', error.message);
    return false;
  }

  console.log('✅ Credits granted:');
  console.log('  Credit ID:', creditId);

  // Отримуємо баланс після
  const { data: balanceAfter } = await supabase.rpc('get_user_balance_from_kv', {
    p_user_id: TEST_USER_ID
  });

  console.log('  Balance after:', balanceAfter);
  console.log('  Difference:', balanceAfter - balanceBefore);

  return true;
}

async function test4_DetailedBalance() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('TEST 4: Детальний баланс');
  console.log('═══════════════════════════════════════════════════════');

  const { data, error } = await supabase.rpc('get_user_detailed_balance', {
    p_user_id: TEST_USER_ID
  });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ Detailed balance:');
  console.log('  Total:', data[0].total_balance);
  console.log('  Subscription credits:', data[0].subscription_credits);
  console.log('  Permanent credits:', data[0].permanent_credits);
  console.log('  Active subscriptions:', JSON.stringify(data[0].active_subscriptions, null, 2));
}

async function test5_ConsumeCredits() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('TEST 5: FIFO списання кредитів (500 credits)');
  console.log('═══════════════════════════════════════════════════════');

  const { data, error } = await supabase.rpc('try_consume_credits', {
    p_user_id: TEST_USER_ID,
    p_amount: 500,
    p_description: 'Test FIFO consumption'
  });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ Consumption result:', data);
}

async function runAllTests() {
  console.log('🚀 Starting Crypto Payment System Tests...\n');

  try {
    // Test 1: Створення платежу
    const payment = await test1_CreateTestPayment();
    if (!payment) {
      console.error('\n❌ Test 1 failed. Stopping.');
      return;
    }

    // Test 2: Webhook обробка
    const webhookOk = await test2_ProcessWebhook(payment.paymentId, payment.orderId);
    if (!webhookOk) {
      console.error('\n❌ Test 2 failed. Stopping.');
      return;
    }

    // Test 3: Зарахування кредитів
    const creditsOk = await test3_GrantCredits(payment.paymentId);
    if (!creditsOk) {
      console.error('\n❌ Test 3 failed. Stopping.');
      return;
    }

    // Test 4: Детальний баланс
    await test4_DetailedBalance();

    // Test 5: FIFO списання
    await test5_ConsumeCredits();

    // Test 4 знову (перевірити зміни)
    await test4_DetailedBalance();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 All tests completed!');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test error:', error);
  }
}

runAllTests();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  'https://xcqjtdfvsgvuglllxgzc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let lastCheckTime = new Date().toISOString();

async function checkNewPayments() {
  const { data, error } = await supabase
    .from('crypto_payments')
    .select('*')
    .gte('created_at', lastCheckTime)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    const payment = data[0];

    console.log('\n🎉 НОВИЙ ПЛАТІЖ ВИЯВЛЕНО!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Payment ID:', payment.payment_id);
    console.log('Order ID:', payment.order_id);
    console.log('User ID:', payment.user_id);
    console.log('Plan:', payment.plan_type);
    console.log('Amount USD:', payment.amount_usd);
    console.log('Crypto:', payment.crypto_currency);
    console.log('Status:', payment.status);
    console.log('Created:', payment.created_at);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📝 Webhook payload для імітації:');
    console.log('═══════════════════════════════════════════════════════');

    const webhookPayload = {
      payment_id: payment.payment_id,
      order_id: payment.order_id,
      payment_status: 'finished',
      pay_amount: payment.crypto_amount,
      pay_currency: payment.crypto_currency,
      price_amount: payment.amount_usd,
      price_currency: 'USD',
      actually_paid: payment.crypto_amount,
      outcome_amount: payment.crypto_amount,
      outcome_currency: payment.crypto_currency
    };

    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🚀 Команда для імітації webhook:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`curl -X POST http://localhost:3000/api/crypto/webhook \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '${JSON.stringify(webhookPayload)}'`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Зберігаємо payment для подальшої обробки
    require('fs').writeFileSync(
      '/tmp/latest_payment.json',
      JSON.stringify(payment, null, 2)
    );

    return payment;
  }

  return null;
}

async function monitor() {
  console.log('👀 Моніторинг нових платежів...');
  console.log('Очікую створення платежу користувачем...\n');

  const interval = setInterval(async () => {
    const payment = await checkNewPayments();

    if (payment) {
      console.log('✅ Платіж знайдено! Зупиняю моніторинг.');
      clearInterval(interval);
      process.exit(0);
    } else {
      process.stdout.write('.');
    }

    lastCheckTime = new Date().toISOString();
  }, 2000); // Перевіряємо кожні 2 секунди
}

monitor();

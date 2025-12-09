# Crypto Payment Modal Changes

## Summary
Доданий функціонал оплати криптовалютою з QR кодом, real-time статусом та polling'ом.

---

## 1. IMPORT CHANGES

### Add to imports (line 2):
```typescript
import { Check, Gem, Sparkles, ArrowLeft, Headset, Flame, Beaker, FlaskConical, CreditCard, Bitcoin, X, Copy, CheckCircle, Clock, Loader } from 'lucide-react';
```
**Added icons**: `Copy, CheckCircle, Clock, Loader`

### Add new import (line 11):
```typescript
import QRCode from 'qrcode';
```

---

## 2. STATE ADDITIONS (after line 86)

```typescript
// Crypto payment status modal
const [showCryptoPaymentStatus, setShowCryptoPaymentStatus] = useState(false);
const [cryptoPaymentData, setCryptoPaymentData] = useState<any>(null);
const [paymentStatus, setPaymentStatus] = useState<string>('waiting');
const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
const [copied, setCopied] = useState(false);
const [timeRemaining, setTimeRemaining] = useState(3600); // 1 hour in seconds
const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
```

---

## 3. FUNCTION MODIFICATIONS

### Replace handleCryptoPayment() function (lines 255-339):

```typescript
const handleCryptoPayment = async () => {
  if (!selectedPlan || !user) {
    console.error('[CRYPTO] User not logged in or no plan selected');
    alert('Please log in to continue');
    return;
  }

  const plan = plans.find(p => p.id === selectedPlan);
  if (!plan) return;

  setIsProcessing(true);

  try {
    const supabaseUrl = 'https://xcqjtdfvsgvuglllxgzc.supabase.co';

    // Отримуємо токен з існуючої сесії через глобальний supabase client
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('[CRYPTO] Session error:', sessionError);
      throw new Error('Authentication error. Please refresh the page and try again.');
    }

    console.log('[CRYPTO] Creating payment:', {
      plan: selectedPlan,
      crypto: selectedCrypto,
      price: plan.price,
      user: user.id
    });

    // Викликаємо Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/make-server-7f10f791/crypto-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: plan.price,
        price_currency: 'usd',
        pay_currency: selectedCrypto,
        plan_type: selectedPlan,
        order_description: `${plan.name} Plan - ${plan.gems} crystals/month`
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[CRYPTO] API error:', errorData);
      throw new Error(errorData.message || 'Failed to create payment. Please try again.');
    }

    const paymentData = await response.json();
    console.log('[CRYPTO] Payment created:', paymentData);

    // Генеруємо QR код для адреси
    try {
      const qrUrl = await QRCode.toDataURL(paymentData.pay_address, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(qrUrl);
    } catch (qrError) {
      console.error('[CRYPTO] QR generation error:', qrError);
    }

    // Зберігаємо дані платежу та відкриваємо модалку статусу
    setCryptoPaymentData(paymentData);
    setPaymentStatus(paymentData.payment_status || 'waiting');
    setShowCryptoModal(false);
    setShowCryptoPaymentStatus(true);
    setIsProcessing(false);

    // Запускаємо polling статусу
    startPaymentStatusPolling(paymentData.payment_id);
  } catch (error: any) {
    console.error('[CRYPTO] Payment error:', error);
    alert(error.message || 'Failed to create payment. Please try again.');
    setIsProcessing(false);
  }
};
```

---

## 4. NEW FUNCTIONS (after handleCryptoPayment)

```typescript
// Запустити polling статусу платежу
const startPaymentStatusPolling = async (paymentId: string) => {
  console.log('[CRYPTO] Starting payment status polling for:', paymentId);

  // Зупиняємо попередній polling якщо був
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
  }

  // Перевіряємо статус кожні 10 секунд
  pollingIntervalRef.current = setInterval(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = 'https://xcqjtdfvsgvuglllxgzc.supabase.co';
      const response = await fetch(`${supabaseUrl}/functions/v1/make-server-7f10f791/crypto-payment/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[CRYPTO POLLING] Status:', data.payment_status);
        setPaymentStatus(data.payment_status);

        // Якщо платіж завершено або помилка - зупиняємо polling
        if (['finished', 'confirmed', 'failed', 'expired', 'refunded'].includes(data.payment_status)) {
          stopPaymentStatusPolling();

          // Якщо успішно - оновлюємо баланс через кілька секунд
          if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        }
      }
    } catch (error) {
      console.error('[CRYPTO POLLING] Error:', error);
    }
  }, 10000); // Кожні 10 секунд
};

// Зупинити polling
const stopPaymentStatusPolling = () => {
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
    console.log('[CRYPTO] Payment status polling stopped');
  }
};

// Копіювати адресу в буфер обміну
const handleCopyAddress = async () => {
  if (!cryptoPaymentData?.pay_address) return;

  try {
    await navigator.clipboard.writeText(cryptoPaymentData.pay_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (error) {
    console.error('[CRYPTO] Copy error:', error);
    // Fallback для старих браузерів
    const textArea = document.createElement('textarea');
    textArea.value = cryptoPaymentData.pay_address;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
};
```

---

## 5. NEW useEffect HOOKS (after line 415)

```typescript
// Countdown timer useEffect
useEffect(() => {
  if (!showCryptoPaymentStatus) return;

  const timer = setInterval(() => {
    setTimeRemaining(prev => {
      if (prev <= 0) {
        clearInterval(timer);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [showCryptoPaymentStatus]);

// Cleanup polling on unmount
useEffect(() => {
  return () => {
    stopPaymentStatusPolling();
  };
}, []);
```

---

## 6. HELPER FUNCTIONS (after useEffects)

```typescript
// Форматування часу
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Отримати статус текст та колір
const getPaymentStatusInfo = (status: string) => {
  switch (status) {
    case 'waiting':
      return { text: 'Waiting for payment', color: '#fbbf24', icon: Clock };
    case 'confirming':
      return { text: 'Confirming transaction', color: '#3b82f6', icon: Loader };
    case 'confirmed':
    case 'finished':
      return { text: 'Payment confirmed!', color: '#10b981', icon: CheckCircle };
    case 'failed':
      return { text: 'Payment failed', color: '#ef4444', icon: X };
    case 'expired':
      return { text: 'Payment expired', color: '#ef4444', icon: Clock };
    default:
      return { text: status, color: '#6b7280', icon: Clock };
  }
};
```

---

## 7. NEW MODAL JSX (after Crypto Currency Selection Modal, before closing </AnimatePresence>)

**INSERT FULL "Crypto Payment Status Modal" block (lines 1001-1254)**

Location: After line 999 (closing of Crypto Currency Selection Modal AnimatePresence)

```tsx
{/* Crypto Payment Status Modal */}
<AnimatePresence>
  {showCryptoPaymentStatus && cryptoPaymentData && (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          setShowCryptoPaymentStatus(false);
          stopPaymentStatusPolling();
        }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => {
          setShowCryptoPaymentStatus(false);
          stopPaymentStatusPolling();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="rounded-2xl p-8 w-full max-h-[90vh] overflow-y-auto custom-scrollbar relative"
          style={{
            maxWidth: '600px',
            background: 'rgba(20, 25, 30, 0.98)',
            border: '1px solid rgba(71, 85, 105, 0.3)',
            boxShadow: '0 25px 70px rgba(0, 0, 0, 0.7)'
          }}
        >
          {/* Close button */}
          <button
            onClick={() => {
              setShowCryptoPaymentStatus(false);
              stopPaymentStatusPolling();
            }}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>

          {/* Header with Status */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-2xl font-bold text-white">
                {currentLanguage === 'en' && 'Cryptocurrency Payment'}
                {currentLanguage === 'uk' && 'Криптовалютна Оплата'}
                {currentLanguage === 'ru' && 'Криптовалютная Оплата'}
              </h3>
              {(() => {
                const statusInfo = getPaymentStatusInfo(paymentStatus);
                const StatusIcon = statusInfo.icon;
                return (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: `${statusInfo.color}20`, border: `1px solid ${statusInfo.color}40` }}>
                    <StatusIcon className="w-4 h-4" style={{ color: statusInfo.color }} />
                    <span className="text-sm font-medium" style={{ color: statusInfo.color }}>{statusInfo.text}</span>
                  </div>
                );
              })()}
            </div>

            {/* Timer */}
            {timeRemaining > 0 && (paymentStatus === 'waiting' || paymentStatus === 'confirming') && (
              <div className="flex items-center gap-2 text-sm text-yellow-400/80">
                <Clock className="w-4 h-4" />
                <span>Time remaining: {formatTime(timeRemaining)}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent mb-6"></div>

          {/* QR Code */}
          {qrCodeUrl && (
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-2xl bg-white">
                <img src={qrCodeUrl} alt="Payment QR Code" className="w-64 h-64" />
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div className="space-y-4 mb-6">
            {/* Amount */}
            <div className="p-4 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(71, 85, 105, 0.3)' }}>
              <div className="text-sm text-emerald-300/60 mb-1">
                {currentLanguage === 'en' && 'Amount to Send'}
                {currentLanguage === 'uk' && 'Сума до Відправлення'}
                {currentLanguage === 'ru' && 'Сумма к Отправке'}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">{cryptoPaymentData.pay_amount}</span>
                <span className="text-lg font-semibold text-emerald-300">{cryptoPaymentData.pay_currency?.toUpperCase()}</span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                ≈ ${cryptoPaymentData.price_amount} USD
              </div>
            </div>

            {/* Address */}
            <div className="p-4 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(71, 85, 105, 0.3)' }}>
              <div className="text-sm text-emerald-300/60 mb-2">
                {currentLanguage === 'en' && 'Payment Address'}
                {currentLanguage === 'uk' && 'Адреса для Оплати'}
                {currentLanguage === 'ru' && 'Адрес для Оплаты'}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-white break-all p-2 rounded bg-black/30">
                  {cryptoPaymentData.pay_address}
                </code>
                <button
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                  style={{
                    background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(71, 85, 105, 0.3)',
                    border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.5)' : 'rgba(71, 85, 105, 0.5)'}`
                  }}
                >
                  {copied ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Plan Info */}
            <div className="p-4 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(71, 85, 105, 0.3)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-emerald-300/60">
                    {currentLanguage === 'en' && 'Subscription Plan'}
                    {currentLanguage === 'uk' && 'План Підписки'}
                    {currentLanguage === 'ru' && 'План Подписки'}
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {plans.find(p => p.id === selectedPlan)?.name}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  <Gem className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">
                    +{plans.find(p => p.id === selectedPlan)?.gems} crystals
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-4 rounded-xl mb-6" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div className="text-sm text-blue-300/90">
              {currentLanguage === 'en' && (
                <>
                  <p className="mb-2 font-semibold">📱 How to pay:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-200/80">
                    <li>Scan the QR code with your crypto wallet</li>
                    <li>Or copy the address and send the exact amount</li>
                    <li>Wait for blockchain confirmation (5-30 minutes)</li>
                    <li>Your subscription will be activated automatically</li>
                  </ol>
                </>
              )}
              {currentLanguage === 'uk' && (
                <>
                  <p className="mb-2 font-semibold">📱 Як оплатити:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-200/80">
                    <li>Скануйте QR код вашим крипто гаманцем</li>
                    <li>Або скопіюйте адресу та відправте точну суму</li>
                    <li>Зачекайте підтвердження в блокчейні (5-30 хвилин)</li>
                    <li>Ваша підписка активується автоматично</li>
                  </ol>
                </>
              )}
              {currentLanguage === 'ru' && (
                <>
                  <p className="mb-2 font-semibold">📱 Как оплатить:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-200/80">
                    <li>Отсканируйте QR код вашим крипто кошельком</li>
                    <li>Или скопируйте адрес и отправьте точную сумму</li>
                    <li>Дождитесь подтверждения в блокчейне (5-30 минут)</li>
                    <li>Ваша подписка активируется автоматически</li>
                  </ol>
                </>
              )}
            </div>
          </div>

          {/* Success/Error Message */}
          {(paymentStatus === 'finished' || paymentStatus === 'confirmed') && (
            <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div className="flex items-center gap-3 text-emerald-300">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <div className="font-semibold">
                    {currentLanguage === 'en' && 'Payment Confirmed!'}
                    {currentLanguage === 'uk' && 'Оплата Підтверджена!'}
                    {currentLanguage === 'ru' && 'Оплата Подтверждена!'}
                  </div>
                  <div className="text-sm text-emerald-200/80">
                    {currentLanguage === 'en' && 'Your subscription is now active. Page will refresh automatically...'}
                    {currentLanguage === 'uk' && 'Ваша підписка активна. Сторінка оновиться автоматично...'}
                    {currentLanguage === 'ru' && 'Ваша подписка активна. Страница обновится автоматически...'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(paymentStatus === 'failed' || paymentStatus === 'expired') && (
            <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div className="flex items-center gap-3 text-red-300">
                <X className="w-6 h-6" />
                <div>
                  <div className="font-semibold">
                    {paymentStatus === 'expired' ? (
                      currentLanguage === 'en' ? 'Payment Expired' : currentLanguage === 'uk' ? 'Оплата Прострочена' : 'Оплата Просрочена'
                    ) : (
                      currentLanguage === 'en' ? 'Payment Failed' : currentLanguage === 'uk' ? 'Оплата Не Вдалась' : 'Оплата Не Удалась'
                    )}
                  </div>
                  <div className="text-sm text-red-200/80">
                    {currentLanguage === 'en' && 'Please try again or contact support.'}
                    {currentLanguage === 'uk' && 'Будь ласка, спробуйте знову або зверніться до підтримки.'}
                    {currentLanguage === 'ru' && 'Пожалуйста, попробуйте снова или обратитесь в поддержку.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={() => {
              setShowCryptoPaymentStatus(false);
              stopPaymentStatusPolling();
            }}
            className="w-full py-3 rounded-xl font-medium text-sm text-emerald-300/80 hover:text-emerald-300 transition-colors"
          >
            {currentLanguage === 'en' && 'Close'}
            {currentLanguage === 'uk' && 'Закрити'}
            {currentLanguage === 'ru' && 'Закрыть'}
          </button>
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>
```

---

## 8. PACKAGE.JSON DEPENDENCY

**ADD to dependencies:**
```json
"qrcode": "^1.5.4",
"@types/qrcode": "^1.5.5"
```

**Install command:**
```bash
npm install qrcode @types/qrcode
```

---

## CRITICAL NOTES:

1. **NO OTHER CODE IS MODIFIED** - це ТІЛЬКИ доповнення, не заміна існуючого коду
2. **Hardcoded Supabase URL** в двох місцях:
   - Line 268: `const supabaseUrl = 'https://xcqjtdfvsgvuglllxgzc.supabase.co';`
   - Line 356: `const supabaseUrl = 'https://xcqjtdfvsgvuglllxgzc.supabase.co';`
3. **Edge Function endpoint**: `/functions/v1/make-server-7f10f791/crypto-payment`
4. **Polling interval**: 10 seconds (10000ms)
5. **Payment timeout**: 1 hour (3600 seconds)
6. **Auto-refresh on success**: 3 seconds after confirmed/finished status

---

## INTEGRATION CHECKLIST:

- [ ] Install qrcode dependencies
- [ ] Add new imports
- [ ] Add state variables
- [ ] Replace handleCryptoPayment function
- [ ] Add new helper functions
- [ ] Add useEffect hooks
- [ ] Add payment status modal JSX
- [ ] Test crypto payment flow
- [ ] Verify build doesn't break other features
- [ ] Deploy carefully


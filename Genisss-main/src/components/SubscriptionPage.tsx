import { useState, useEffect } from 'react';
import { Check, Gem, Sparkles, ArrowLeft, Headset, Flame, Beaker, FlaskConical, CreditCard, Bitcoin, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './Header';
import { Footer } from './Footer';
import { MouseFollowBackground } from './MouseFollowBackground';
import { CryptoSelectionModal } from './CryptoSelectionModal';
import { CryptoPaymentModal } from './CryptoPaymentModal';
import type { User } from '@supabase/supabase-js';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';
import { initializePaddle, openPaddleCheckout, getPriceId } from '../utils/paddle';
import { supabase } from '../lib/supabase';

interface SubscriptionPageProps {
  onBack: () => void;
  user?: User | null;
  balance?: number;
  language?: Language;
  userPlan?: string;
}

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 8,
    popular: false,
    gems: 2000,
    features: [
      '2000 crystals per month',
      '~13 stories (~15 min each)',
      '~90 minutes of audio generation',
      'Standard generation speed',
      'Core story templates and styles',
      'Basic email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19.99,
    popular: true,
    gems: 6000,
    features: [
      '6000 crystals per month',
      '~40 stories (~15 min each)',
      '~270 minutes of audio generation',
      'All supported languages',
      'Priority generation speed',
      'All available AI voices',
      'Separate text & audio export (MP3 / TXT / DOCX)',
      'Priority support',
    ],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: 49.99,
    popular: false,
    gems: 20000,
    features: [
      '20000 crystals per month',
      '~133 stories (~15 min each)',
      '~900 minutes of audio generation',
      'All supported languages',
      'Maximum generation speed & top-priority queue',
      'Full voice library and future voice packs',
      '24/7 priority support & early access to new features',
    ],
  },
];

type PaymentMethod = 'card' | 'paypal' | 'crypto';

export function SubscriptionPage({ onBack, user, balance, language = 'en', userPlan }: SubscriptionPageProps) {
  const [currentLanguage, setCurrentLanguage] = useState<Language>(language);
  const t = translations[currentLanguage];
  const [selectedPlan, setSelectedPlan] = useState<string | null>('starter');
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paddleReady, setPaddleReady] = useState(false);

  // Crypto payment states
  const [showCryptoSelection, setShowCryptoSelection] = useState(false);
  const [showCryptoPayment, setShowCryptoPayment] = useState(false);
  const [cryptoPaymentData, setCryptoPaymentData] = useState<any>(null);

  // Ініціалізація Paddle при завантаженні компонента
  useEffect(() => {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT || 'production';

    if (token) {
      initializePaddle(token, environment as 'sandbox' | 'production')
        .then(() => {
          console.log('[PADDLE] Initialized successfully');
          setPaddleReady(true);
        })
        .catch((error) => {
          console.error('[PADDLE] Initialization failed:', error);
        });
    }
  }, []);

  // Get translated plan name
  const getTranslatedPlanName = (planId: string): string => {
    if (planId === 'starter') return t.starterPlan;
    if (planId === 'pro') return t.proPlan;
    if (planId === 'ultimate') return t.ultimatePlan;
    return planId;
  };

  // Get translated features for each plan
  const getTranslatedFeatures = (planId: string): string[] => {
    if (planId === 'starter') {
      return [
        `2000 ${t.storyCrystalsPerMonth}`,
        `~13 ${t.longStories} (~15 ${t.min} ${t.each})`,
        `~90 ${t.min} ${t.audioGeneration}`,
        t.standardSpeed,
        t.coreTemplates,
        t.basicSupport,
      ];
    } else if (planId === 'pro') {
      return [
        `6000 ${t.storyCrystalsPerMonth}`,
        `~40 ${t.longStories} (~15 ${t.min} ${t.each})`,
        `~270 ${t.min} ${t.audioGeneration}`,
        t.allLanguages,
        t.prioritySpeed,
        t.allVoices,
        t.separateExport,
        t.prioritySupport,
      ];
    } else if (planId === 'ultimate') {
      return [
        `20000 ${t.storyCrystalsPerMonth}`,
        `~133 ${t.longStories} (~15 ${t.min} ${t.each})`,
        `~900 ${t.min} ${t.audioGeneration}`,
        t.allLanguages,
        t.maximumSpeed,
        t.fullVoiceLibrary,
        t.support247,
      ];
    }
    return [];
  };

  const handlePayment = async () => {
    if (!selectedPlan) {
      console.warn('[PAYMENT] No plan selected');
      return;
    }

    if (!user?.id) {
      console.warn('[PAYMENT] User not logged in');
      alert('Please log in to continue');
      return;
    }

    // Handle crypto payments differently
    if (selectedPayment === 'crypto') {
      setShowPaymentModal(false);
      setShowCryptoSelection(true);
      return;
    }

    // Handle card/paypal with Paddle
    if (!paddleReady) {
      console.warn('[PADDLE] Paddle not ready');
      return;
    }

    setIsProcessing(true);

    try {
      // Отримуємо Paddle Price ID для вибраного плану
      const priceId = getPriceId(selectedPlan);

      console.log('[PADDLE] Opening checkout for plan:', selectedPlan, 'priceId:', priceId);

      // Відкриваємо Paddle Checkout
      openPaddleCheckout(priceId, {
        id: user.id,
        email: user.email
      });

      setShowPaymentModal(false);
      setIsProcessing(false);
    } catch (error) {
      console.error('[PADDLE] Payment error:', error);
      alert('Payment error. Please try again.');
      setIsProcessing(false);
    }

    // Старий код (залишаємо закоментованим для інших методів оплати)
    /*
    try {
      if (selectedPayment === 'card') {
        // Stripe Checkout
        const response = await fetch('/api/create-stripe-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: selectedPlan,
            price: plan?.price,
            gems: plan?.gems
          })
        });
        const { url } = await response.json();
        window.location.href = url; // Redirect to Stripe
      }

      else if (selectedPayment === 'paypal') {
        // PayPal
        const response = await fetch('/api/create-paypal-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: selectedPlan,
            price: plan?.price,
            gems: plan?.gems
          })
        });
        const { approvalUrl } = await response.json();
        window.location.href = approvalUrl; // Redirect to PayPal
      }

      else if (selectedPayment === 'crypto') {
        // Crypto gateway (Coinbase Commerce or NOWPayments)
        const response = await fetch('/api/create-crypto-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: selectedPlan,
            price: plan?.price,
            gems: plan?.gems
          })
        });
        const { hostedUrl } = await response.json();
        window.location.href = hostedUrl; // Redirect to crypto payment page
      }
    } catch (error) {
      console.error('Payment error:', error);
      setIsProcessing(false);
      // TODO: Show error toast
    }
    */
  };

  const handleCryptoSelect = async (crypto: { code: string; name: string; network: string }) => {
    if (!selectedPlan || !user?.id) return;

    setShowCryptoSelection(false);
    setIsProcessing(true);

    try {
      // Get valid session token from Supabase
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      console.log('[CRYPTO] Session check:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token
      });

      if (!session?.access_token) {
        alert('Authentication required. Please log in again.');
        setIsProcessing(false);
        return;
      }

      const API_URL = import.meta.env.VITE_API_URL ?? '';

      console.log('[CRYPTO] Creating payment for plan:', selectedPlan);
      console.log('[CRYPTO] API URL:', API_URL);
      console.log('[CRYPTO] Token (first 20 chars):', session.access_token.substring(0, 20));

      const response = await fetch(`${API_URL}/api/crypto/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          plan_id: selectedPlan,
          pay_currency: crypto.code.toLowerCase()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create crypto payment');
      }

      const data = await response.json();
      console.log('[CRYPTO] Payment created:', data);

      setCryptoPaymentData({
        order_id: data.payment.order_id,
        payment_url: data.payment.pay_address || '', // Now it's the wallet address
        wallet_address: data.payment.pay_address,
        amount_usd: data.payment.amount_usd,
        crypto_amount: data.payment.pay_amount,
        cryptocurrency: crypto.name,
        crypto_code: crypto.code,
        network: crypto.network,
        plan_name: data.payment.plan_name
      });
      setShowCryptoPayment(true);
      setIsProcessing(false);
    } catch (error) {
      console.error('[CRYPTO] Payment creation error:', error);
      alert('Failed to create crypto payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleCryptoPaymentComplete = () => {
    setShowCryptoPayment(false);
    setCryptoPaymentData(null);
    alert('Payment received! Your crystals have been added to your account.');
    // Optionally reload balance or trigger a refresh
    window.location.reload();
  };

  const getCardHighlightColor = (planId: string) => {
    if (planId === 'starter') return {
      border: 'rgba(16, 185, 129, 0.8)',
      shadow: '0 0 30px rgba(16, 185, 129, 0.5)',
      buttonBg: 'linear-gradient(135deg, rgba(16, 185, 129, 1), rgba(5, 150, 105, 1))'
    };
    if (planId === 'pro') return {
      border: 'rgba(234, 179, 8, 0.8)',
      shadow: '0 0 30px rgba(234, 179, 8, 0.5)',
      buttonBg: 'linear-gradient(135deg, rgba(234, 179, 8, 1), rgba(202, 138, 4, 1))'
    };
    if (planId === 'ultimate') return {
      border: 'rgba(239, 68, 68, 0.8)',
      shadow: '0 0 30px rgba(239, 68, 68, 0.5)',
      buttonBg: 'linear-gradient(135deg, rgba(239, 68, 68, 1), rgba(220, 38, 38, 1))'
    };
    return {
      border: 'rgba(16, 185, 129, 0.2)',
      shadow: 'none',
      buttonBg: 'linear-gradient(135deg, rgba(16, 185, 129, 1), rgba(5, 150, 105, 1))'
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col" style={{ scrollbarGutter: 'stable' }}>
      {/* Mouse follow background */}
      <MouseFollowBackground />

      <Header
        user={user || null}
        language={currentLanguage}
        onLanguageChange={setCurrentLanguage}
        balance={balance}
        userPlan={userPlan}
      />

      {/* Spacer for fixed header */}
      <div className="h-20 flex-shrink-0"></div>

      <div className="flex-1 pb-12 px-8 custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full mb-4 transition-all duration-150"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            marginTop: '1rem',
            marginLeft: '1rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
        >
          <ArrowLeft className="w-5 h-5 text-emerald-400" />
        </button>

        {/* Title */}
        <div className="text-center mb-6" style={{ marginTop: '-4rem' }}>
          <h1 className="text-5xl mb-3 font-bold">
            <span style={{ background: 'linear-gradient(to right, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>Choose your </span>
            <span style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>plan</span>
          </h1>
          <p style={{ background: 'linear-gradient(to right, #10b981, #14b8a6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            Unlock the full potential of AI story generation
          </p>
        </div>

        {/* Plans Grid */}
        <div className="flex gap-6 max-w-full mx-auto justify-center px-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              onMouseEnter={() => setHoveredPlan(plan.id)}
              onMouseLeave={() => setHoveredPlan(null)}
              className="relative cursor-pointer"
              style={{ width: '420px' }}
            >
              {plan.popular && (
                <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-transform" style={{
                  top: '0.65rem',
                  left: '55%',
                  transform: selectedPlan === plan.id ? 'translateX(-50%) translateY(-50%) rotate(-5deg)' : 'translateX(-50%) translateY(-50%) rotate(0deg)'
                }}>
                  <div
                    className="text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(236, 72, 153, 0.9))',
                      backdropFilter: 'blur(10px)',
                      boxShadow: selectedPlan === plan.id ? '0 6px 16px rgba(168, 85, 247, 0.6)' : '0 3px 8px rgba(168, 85, 247, 0.3)'
                    }}
                  >
                    <FlaskConical className="w-3 h-3" />
                    Popular
                  </div>
                </div>
              )}

              <div
                className="h-full p-8 rounded-2xl transition-all relative"
                style={{
                  background: 'rgba(5, 46, 38, 0.4)',
                  border: `2px solid ${(selectedPlan === plan.id || hoveredPlan === plan.id) ? getCardHighlightColor(plan.id).border : 'rgba(16, 185, 129, 0.2)'}`,
                  boxShadow: (selectedPlan === plan.id || hoveredPlan === plan.id) ? getCardHighlightColor(plan.id).shadow : 'none'
                }}
              >
                {/* Dark overlay for unselected cards */}
                {selectedPlan && selectedPlan !== plan.id && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    }}
                  />
                )}
                {/* Plan Name & Price */}
                <div className="text-center mb-6 relative z-10">
                  <h3 className="text-emerald-100 mb-3 font-bold" style={{ fontSize: '1.5rem' }}>{getTranslatedPlanName(plan.id)}</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-bold transition-colors" style={{ fontSize: '2.25rem', color: selectedPlan === plan.id ? 'white' : 'rgba(255, 255, 255, 0.7)' }}>${plan.price}</span>
                    <span className="text-base text-emerald-300/60">/{t.monthly.toLowerCase()}</span>
                  </div>
                </div>

                {/* Gems Badge */}
                <div
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg mb-8"
                  style={{
                    border: '0.5px solid #a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.15)'
                  }}
                >
                  <div className="relative">
                    <Gem className="w-5 h-5" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 1)) drop-shadow(0 0 15px rgba(236, 72, 153, 0.6))' }} />
                  </div>
                  <span className="text-sm font-medium" style={{ background: 'linear-gradient(to right, #fcd34d, #fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
                    +{plan.gems.toLocaleString()}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent mb-8"></div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {getTranslatedFeatures(plan.id).map((feature, index) => {
                    // Unique Ultimate features should have red checkmarks
                    const isUniqueUltimate = plan.id === 'ultimate' && index >= 5;

                    return (
                      <li key={index} className="flex items-start gap-3 text-sm text-emerald-200/80">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isUniqueUltimate ? 'text-red-400' : 'text-emerald-400'}`} />
                        <span>{feature}</span>
                      </li>
                    );
                  })}
                </ul>

                {/* Select Button */}
                <motion.button
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    setShowPaymentModal(true);
                  }}
                  className="w-full py-3 rounded-lg font-medium transition-all relative z-10"
                  style={{
                    background: selectedPlan === plan.id
                      ? getCardHighlightColor(plan.id).buttonBg
                      : 'transparent',
                    color: selectedPlan === plan.id ? 'white' : getCardHighlightColor(plan.id).border.replace('0.8', '0.9'),
                    border: selectedPlan === plan.id ? 'none' : `1px solid ${getCardHighlightColor(plan.id).border.replace('0.8', '0.5')}`
                  }}
                  whileHover={{
                    y: -1,
                    boxShadow: `0 2px 8px ${getCardHighlightColor(plan.id).border.replace('0.8', '0.15')}`
                  }}
                  whileTap={{ y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
                </motion.button>
              </div>
            </div>
          ))}
        </div>

        {/* Buy Crystals Button */}
        <div className="flex justify-center" style={{ marginTop: '4rem', marginBottom: '4rem' }}>
          <motion.button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'credits' } }));
            }}
            className="relative rounded-2xl font-medium text-xl transition-all overflow-hidden group"
            style={{
              padding: '1.25rem 6rem',
              background: 'rgba(168, 85, 247, 0.15)',
              color: 'white',
              border: '2px solid #a855f7',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(236, 72, 153, 0.15)',
            }}
            whileHover={{
              scale: 1.05,
              background: 'rgba(168, 85, 247, 0.25)',
              boxShadow: '0 0 30px rgba(168, 85, 247, 0.5), 0 0 60px rgba(236, 72, 153, 0.25)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Animated Crystal Left */}
            <motion.div
              className="absolute top-1/2"
              style={{ left: '2rem', translateY: '-50%' }}
              animate={{
                y: [0, -10, 0, -6, 0],
                rotate: [0, 18, -12, 8, 0],
                scale: [1, 1.15, 0.9, 1.1, 1],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Gem className="w-9 h-9" style={{
                color: '#a855f7',
                filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 1)) drop-shadow(0 0 24px rgba(168, 85, 247, 0.7))'
              }} />
            </motion.div>

            {/* Button Text */}
            <span className="relative z-10" style={{ paddingLeft: '3rem', paddingRight: '3rem', opacity: 0.9 }}>
              {t.buyCrystals || 'Buy Crystals'}
            </span>

            {/* Animated Crystal Right */}
            <motion.div
              className="absolute top-1/2"
              style={{ right: '2rem', translateY: '-50%' }}
              animate={{
                y: [0, -7, 0, -12, 0],
                rotate: [0, -15, 10, -8, 0],
                scale: [1, 0.9, 1.15, 1.05, 1],
              }}
              transition={{
                duration: 4.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.8,
              }}
            >
              <Gem className="w-9 h-9" style={{
                color: '#a855f7',
                filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 1)) drop-shadow(0 0 24px rgba(168, 85, 247, 0.7))'
              }} />
            </motion.div>

            {/* Glow effect on hover */}
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.4), transparent 70%)',
                opacity: 0,
              }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
          </motion.button>
        </div>

      </div>

      {/* Footer */}
      <Footer />

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedPlan && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setShowPaymentModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="rounded-2xl p-8 w-full max-h-[90vh] overflow-y-auto custom-scrollbar relative"
                style={{
                  maxWidth: '550px',
                  background: 'rgba(20, 25, 30, 0.98)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                  boxShadow: '0 25px 70px rgba(0, 0, 0, 0.7)'
                }}
              >
                {/* Header */}
                <div className="mb-3" style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="text-sm text-emerald-300/60">{t.selectedPlan}</div>
                    <div className="text-lg font-semibold text-emerald-100">
                      {plans.find(p => p.id === selectedPlan)?.name}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent mb-5"></div>

                {/* Payment Methods */}
                <div className="mb-6">
                  <h4 className="text-xl font-semibold text-emerald-100 mb-6">{t.choosePaymentMethod}</h4>
                  <div className="space-y-3">
                    {/* Card Option */}
                    <div
                      onClick={() => setSelectedPayment('card')}
                      className="cursor-pointer py-6 rounded-2xl transition-all"
                      style={{
                        background: selectedPayment === 'card' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(30, 41, 59, 0.3)',
                        border: `2px solid ${selectedPayment === 'card' ? 'rgba(100, 116, 139, 0.8)' : 'rgba(71, 85, 105, 0.4)'}`,
                        paddingLeft: '1.75rem',
                        paddingRight: '1.75rem'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#10b981' }}>
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>{t.cardPaymentMethods}</div>
                          <div className="text-xs" style={{ color: '#9ca3af' }}>{t.recommendedByStripe}</div>
                        </div>
                      </div>
                    </div>

                    {/* PayPal Option */}
                    <div
                      onClick={() => setSelectedPayment('paypal')}
                      className="cursor-pointer py-6 rounded-2xl transition-all"
                      style={{
                        background: selectedPayment === 'paypal' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(30, 41, 59, 0.3)',
                        border: `2px solid ${selectedPayment === 'paypal' ? 'rgba(100, 116, 139, 0.8)' : 'rgba(71, 85, 105, 0.4)'}`,
                        paddingLeft: '1.75rem',
                        paddingRight: '1.75rem'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0070ba' }}>
                          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
                            <path d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 00-.795.68l-.04.22-.63 3.993-.032.17a.804.804 0 01-.795.68H7.72a.483.483 0 01-.477-.558L8.89 14.36h1.274c3.238 0 5.774-1.314 6.514-5.12.256-1.313.192-2.446-.3-3.327a3.993 3.993 0 00-.535-.694 6.874 6.874 0 013.225 3.26z"/>
                            <path d="M9.406 3c.45 0 .84.04 1.17.12.98.22 1.67.76 2.06 1.61.32.74.39 1.72.2 2.88-.54 3.28-2.9 4.39-5.61 4.39H5.93a.69.69 0 00-.68.58l-.87 5.52a.42.42 0 01-.41.36H.92a.42.42 0 01-.41-.49l2.5-15.82A.83.83 0 013.84 2h5.56z"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>PayPal</div>
                          <div className="text-xs" style={{ color: '#9ca3af' }}>{t.forPayPalUsers}</div>
                        </div>
                      </div>
                    </div>

                    {/* Crypto Option */}
                    <div
                      onClick={() => setSelectedPayment('crypto')}
                      className="cursor-pointer py-6 rounded-2xl transition-all"
                      style={{
                        background: selectedPayment === 'crypto' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(30, 41, 59, 0.3)',
                        border: `2px solid ${selectedPayment === 'crypto' ? 'rgba(100, 116, 139, 0.8)' : 'rgba(71, 85, 105, 0.4)'}`,
                        paddingLeft: '1.75rem',
                        paddingRight: '1.75rem'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f7931a' }}>
                          <Bitcoin className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>{t.cryptocurrency}</div>
                          <div className="text-xs" style={{ color: '#9ca3af' }}>{t.cryptoDescription}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total and Checkout Button */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-emerald-300/60">{t.total}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-2xl font-bold text-white">${plans.find(p => p.id === selectedPlan)?.price}</span>
                    <span className="text-sm text-emerald-300/60">/{t.monthly.toLowerCase()}</span>
                  </div>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={isProcessing}
                  className="w-full py-4 rounded-2xl font-semibold text-base transition-transform duration-100 active:scale-95"
                  style={{
                    background: isProcessing ? 'rgba(20, 184, 166, 0.5)' : 'linear-gradient(135deg, #14b8a6, #0d9488)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(20, 184, 166, 0.3)',
                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) e.currentTarget.style.opacity = '1';
                  }}
                >
                  {isProcessing ? t.processing : `${t.pay} $${plans.find(p => p.id === selectedPlan)?.price}/${t.monthly.toLowerCase()}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Crypto Payment Modals */}
      <CryptoSelectionModal
        isOpen={showCryptoSelection}
        onClose={() => setShowCryptoSelection(false)}
        onSelect={handleCryptoSelect}
        planName={plans.find(p => p.id === selectedPlan)?.name || ''}
        planPrice={plans.find(p => p.id === selectedPlan)?.price || 0}
      />

      {/* Loading Overlay */}
      <AnimatePresence>
        {isProcessing && !showCryptoPayment && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              style={{ zIndex: 99999 }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center"
              style={{ zIndex: 999999 }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                <p className="text-white text-lg font-medium">Creating payment...</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CryptoPaymentModal
        isOpen={showCryptoPayment}
        onClose={() => {
          setShowCryptoPayment(false);
          setCryptoPaymentData(null);
        }}
        paymentData={cryptoPaymentData}
        planName={plans.find(p => p.id === selectedPlan)?.name || ''}
        onPaymentComplete={handleCryptoPaymentComplete}
      />

      <style>{`
        /* Force scrollbar to always be visible */
        html, body {
          overflow-y: scroll !important;
          scrollbar-gutter: stable;
        }

        .custom-scrollbar {
          scrollbar-gutter: stable;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 10px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.3) !important;
          border-radius: 5px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.8) !important;
          border-radius: 5px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 1) !important;
        }
      `}</style>
    </div>
  );
}

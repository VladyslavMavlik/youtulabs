import { useState, useEffect } from 'react';
import { Gem, ArrowLeft, CreditCard, Bitcoin, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './Header';
import { Footer } from './Footer';
import { MouseFollowBackground } from './MouseFollowBackground';
import { CryptoSelectionModal } from './CryptoSelectionModal';
import { CryptoPaymentModal } from './CryptoPaymentModal';
import type { User } from '@supabase/supabase-js';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';
import { initializePaddle, openPaddleCheckout, getCreditPackPriceId } from '../utils/paddle';
import { supabase } from '../lib/supabase';

interface CreditsPageProps {
  onBack: () => void;
  user?: User | null;
  balance?: number;
  language?: Language;
  userPlan?: string;
}

const crystalPacks = [
  {
    id: 'pack_500',
    crystals: 500,
    price: 3.00,
    bonus: 0,
    popular: false,
    enabled: true,
  },
  {
    id: 'pack_1000',
    crystals: 1000,
    price: 5,
    bonus: 0,
    popular: false,
    enabled: true,
  },
  {
    id: 'pack_2500',
    crystals: 2500,
    price: 14.40,
    bonus: 100,
    popular: true,
    enabled: true,
  },
  {
    id: 'pack_5000',
    crystals: 5000,
    price: 27.60,
    bonus: 300,
    popular: false,
    enabled: true,
  },
  {
    id: 'pack_10000',
    crystals: 10000,
    price: 54.00,
    bonus: 1000,
    popular: false,
    enabled: true,
  },
  {
    id: 'pack_25000',
    crystals: 25000,
    price: 110,
    bonus: 3000,
    popular: false,
    enabled: true,
  },
];

type PaymentMethod = 'card' | 'paypal' | 'crypto';

export function CreditsPage({ onBack, user, balance, language = 'en', userPlan }: CreditsPageProps) {
  const [currentLanguage, setCurrentLanguage] = useState<Language>(language);
  const t = translations[currentLanguage];
  const [selectedPack, setSelectedPack] = useState<string | null>('pack_2500');
  const [hoveredPack, setHoveredPack] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paddleReady, setPaddleReady] = useState(false);

  // Bonus code state
  const [bonusCode, setBonusCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Crypto payment state
  const [showCryptoSelection, setShowCryptoSelection] = useState(false);
  const [showCryptoPayment, setShowCryptoPayment] = useState(false);
  const [cryptoPaymentData, setCryptoPaymentData] = useState<{
    order_id: string;
    payment_url: string;
    wallet_address?: string;
    amount_usd: number;
    crypto_amount?: number;
    cryptocurrency: string;
    crypto_code?: string;
    network?: string;
    plan_name?: string;
  } | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  useEffect(() => {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT || 'production';

    if (token) {
      initializePaddle(token, environment as 'sandbox' | 'production')
        .then(() => {
          console.log('[CREDITS] Paddle initialized successfully');
          setPaddleReady(true);
        })
        .catch((error) => {
          console.error('[CREDITS] Paddle initialization failed:', error);
        });
    } else {
      console.error('[CREDITS] VITE_PADDLE_CLIENT_TOKEN not found');
    }
  }, []);

  const handlePayment = async () => {
    if (!selectedPack) {
      console.warn('[CREDITS] Cannot proceed: no pack selected');
      return;
    }

    if (!user?.id) {
      alert('Please log in to continue');
      return;
    }

    // Handle crypto payment separately
    if (selectedPayment === 'crypto') {
      setShowPaymentModal(false);
      setShowCryptoSelection(true);
      return;
    }

    // For card/paypal - use Paddle
    if (!paddleReady) {
      console.warn('[CREDITS] Paddle not ready');
      return;
    }

    setIsProcessing(true);

    try {
      const priceId = getCreditPackPriceId(selectedPack);
      console.log('[CREDITS] Opening Paddle checkout for:', selectedPack, 'priceId:', priceId, 'payment method:', selectedPayment);

      openPaddleCheckout(priceId, {
        id: user.id,
        email: user.email
      });

      setShowPaymentModal(false);
    } catch (error) {
      console.error('[CREDITS] Payment error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle crypto selection
  const handleCryptoSelect = async (crypto: { code: string; name: string; network: string }) => {
    if (!selectedPack || !user?.id) return;

    const pack = crystalPacks.find(p => p.id === selectedPack);
    if (!pack) return;

    setCryptoLoading(true);
    setShowCryptoSelection(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Authentication required');
        setCryptoLoading(false);
        return;
      }

      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const response = await fetch(`${API_URL}/api/crypto/create-credit-pack-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pack_id: selectedPack,
          pay_currency: crypto.code,
        }),
      });

      const data = await response.json();

      if (data.success && data.payment) {
        setCryptoPaymentData({
          order_id: data.payment.order_id,
          payment_url: data.payment.payment_url,
          wallet_address: data.payment.pay_address,
          amount_usd: pack.price,
          crypto_amount: data.payment.pay_amount,
          cryptocurrency: crypto.name,
          crypto_code: crypto.code,
          network: crypto.network,
          plan_name: `${pack.crystals.toLocaleString()} Crystals`
        });
        setShowCryptoPayment(true);
      } else {
        alert(data.message || 'Failed to create payment');
      }
    } catch (error) {
      console.error('[CREDITS] Crypto payment error:', error);
      alert('Failed to create crypto payment');
    } finally {
      setCryptoLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!bonusCode.trim()) {
      setRedeemMessage({ type: 'error', text: t.bonusCodeInvalid });
      return;
    }

    if (!user?.id) {
      alert('Please log in to continue');
      return;
    }

    setIsRedeeming(true);
    setRedeemMessage(null);

    try {
      // Get JWT token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setRedeemMessage({ type: 'error', text: 'Authentication required' });
        setIsRedeeming(false);
        return;
      }

      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const response = await fetch(`${API_URL}/api/bonus-codes/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`, // ✅ JWT token!
        },
        body: JSON.stringify({
          code: bonusCode.trim(),
          // ✅ userId НЕ відправляється - беремо з JWT на сервері!
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCelebration(true);
        setRedeemMessage({ type: 'success', text: t.bonusCodeSuccess });
        setBonusCode('');
        // Refresh the page after 4 seconds to update balance
        setTimeout(() => {
          window.location.reload();
        }, 4000);
      } else {
        // Handle specific error codes
        if (data.error === 'USER_ALREADY_REDEEMED') {
          setRedeemMessage({ type: 'error', text: t.bonusCodeAlreadyRedeemed });
        } else if (data.error === 'CODE_ALREADY_USED') {
          setRedeemMessage({ type: 'error', text: t.bonusCodeUsed });
        } else if (data.error === 'INVALID_CODE') {
          setRedeemMessage({ type: 'error', text: t.bonusCodeInvalid });
        } else {
          setRedeemMessage({ type: 'error', text: data.message || t.bonusCodeInvalid });
        }
      }
    } catch (error) {
      console.error('[BONUS] Redemption error:', error);
      setRedeemMessage({ type: 'error', text: t.bonusCodeInvalid });
    } finally {
      setIsRedeeming(false);
    }
  };

  const getCrystalColorScheme = (packId: string, isActive: boolean = false) => {
    const schemes = {
      'pack_500': {
        crystal: isActive ? '#06b6d4' : 'rgba(6, 182, 212, 0.5)', // cyan - half opacity when not active
        crystalRgb: '6, 182, 212',
        crystalGlow: isActive ? 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.6))' : 'none',
        border: 'rgba(6, 182, 212, 0.8)',
        shadow: '0 0 30px rgba(6, 182, 212, 0.5)',
        buttonBg: 'linear-gradient(135deg, #06b6d4, #0891b2)',
        buttonBorder: 'rgba(6, 182, 212, 0.4)',
        buttonText: '#06b6d4',
        buttonShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
      },
      'pack_1000': {
        crystal: isActive ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)', // blue - half opacity when not active
        crystalRgb: '59, 130, 246',
        crystalGlow: isActive ? 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.6))' : 'none',
        border: 'rgba(59, 130, 246, 0.8)',
        shadow: '0 0 30px rgba(59, 130, 246, 0.5)',
        buttonBg: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        buttonBorder: 'rgba(59, 130, 246, 0.4)',
        buttonText: '#3b82f6',
        buttonShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
      },
      'pack_2500': {
        crystal: isActive ? '#a855f7' : 'rgba(168, 85, 247, 0.5)', // purple - half opacity when not active
        crystalRgb: '168, 85, 247',
        crystalGlow: isActive ? 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.7)) drop-shadow(0 0 20px rgba(236, 72, 153, 0.4))' : 'none',
        border: 'rgba(168, 85, 247, 0.8)',
        shadow: '0 0 40px rgba(168, 85, 247, 0.6), 0 0 20px rgba(236, 72, 153, 0.4)',
        buttonBg: 'linear-gradient(135deg, #a855f7, #ec4899)',
        buttonBorder: 'rgba(168, 85, 247, 0.4)',
        buttonText: '#a855f7',
        buttonShadow: '0 4px 16px rgba(168, 85, 247, 0.4)'
      },
      'pack_5000': {
        crystal: isActive ? '#fbbf24' : 'rgba(251, 191, 36, 0.5)', // gold - half opacity when not active
        crystalRgb: '251, 191, 36',
        crystalGlow: isActive ? 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.6))' : 'none',
        border: 'rgba(251, 191, 36, 0.8)',
        shadow: '0 0 30px rgba(251, 191, 36, 0.5)',
        buttonBg: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        buttonBorder: 'rgba(251, 191, 36, 0.4)',
        buttonText: '#fbbf24',
        buttonShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
      },
      'pack_10000': {
        crystal: isActive ? '#f97316' : 'rgba(249, 115, 22, 0.5)', // orange - half opacity when not active
        crystalRgb: '249, 115, 22',
        crystalGlow: isActive ? 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.6))' : 'none',
        border: 'rgba(249, 115, 22, 0.8)',
        shadow: '0 0 30px rgba(249, 115, 22, 0.5)',
        buttonBg: 'linear-gradient(135deg, #f97316, #ea580c)',
        buttonBorder: 'rgba(249, 115, 22, 0.4)',
        buttonText: '#f97316',
        buttonShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
      },
      'pack_25000': {
        crystal: isActive ? '#ef4444' : 'rgba(239, 68, 68, 0.5)', // red - half opacity when not active
        crystalRgb: '239, 68, 68',
        crystalGlow: isActive ? 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.6))' : 'none',
        border: 'rgba(239, 68, 68, 0.8)',
        shadow: '0 0 30px rgba(239, 68, 68, 0.5)',
        buttonBg: 'linear-gradient(135deg, #ef4444, #dc2626)',
        buttonBorder: 'rgba(239, 68, 68, 0.4)',
        buttonText: '#ef4444',
        buttonShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
      }
    };
    return schemes[packId as keyof typeof schemes] || schemes['pack_2500'];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col" style={{ scrollbarGutter: 'stable' }}>
      <MouseFollowBackground />

      <Header
        user={user || null}
        language={currentLanguage}
        onLanguageChange={setCurrentLanguage}
        balance={balance}
        userPlan={userPlan}
      />

      <div className="h-20 flex-shrink-0"></div>

      <div className="pb-12 px-8 custom-scrollbar flex-1" style={{ scrollbarGutter: 'stable' }}>
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
        <div className="text-center mb-8" style={{ marginTop: '-4rem' }}>
          <h1 className="text-5xl mb-3 font-bold">
            <span style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>{t.buyGems.split(' ')[0]} </span>
            <span style={{ background: 'linear-gradient(to right, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>{t.buyGems.split(' ')[1]}</span>
          </h1>
          <p style={{ background: 'linear-gradient(to right, #10b981, #14b8a6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            1 crystal = $0.005 • 10 crystals per minute of story
          </p>
        </div>

        {/* Crystal Packs Grid */}
        <div className="grid mx-auto px-4" style={{ gridTemplateColumns: 'repeat(3, 340px)', maxWidth: '1100px', justifyContent: 'center', gap: '3rem' }}>
          {crystalPacks.map((pack) => {
            const isDisabled = !pack.enabled;
            const isActive = selectedPack === pack.id || hoveredPack === pack.id;
            const colorScheme = getCrystalColorScheme(pack.id, isActive);
            return (
            <div
              key={pack.id}
              onClick={() => {
                if (!isDisabled) {
                  setSelectedPack(pack.id);
                }
              }}
              onMouseEnter={() => !isDisabled && setHoveredPack(pack.id)}
              onMouseLeave={() => setHoveredPack(null)}
              className="relative"
              style={{
                cursor: isDisabled ? 'not-allowed' : 'cursor-pointer',
                opacity: isDisabled ? 0.5 : 1,
                filter: isDisabled ? 'grayscale(0.7)' : 'none'
              }}
            >
              {pack.popular && (
                <div className="absolute z-10" style={{ top: '-8px', left: '-8px' }}>
                  <motion.div
                    className="text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(236, 72, 153, 0.9))',
                      backdropFilter: 'blur(10px)',
                      boxShadow: 'none'
                    }}
                    animate={{
                      boxShadow: [
                        'none',
                        '0 0 8px rgba(168, 85, 247, 0.9)',
                        'none',
                        '0 0 8px rgba(168, 85, 247, 0.9)',
                        'none'
                      ]
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      times: [0, 0.1, 0.25, 0.35, 0.5],
                      ease: "easeInOut"
                    }}
                  >
                    {t.popular}
                  </motion.div>
                </div>
              )}

              {pack.bonus > 0 && (
                <div className="absolute z-10" style={{ top: '-8px', right: '-8px' }}>
                  <div
                    className="text-white px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24, #fb923c)',
                      boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)'
                    }}
                  >
                    +{pack.bonus} {t.bonus}
                  </div>
                </div>
              )}

              <div
                className="h-full w-full p-8 rounded-2xl transition-all relative"
                style={{
                  background: 'rgba(5, 46, 38, 0.4)',
                  border: `2px solid ${(selectedPack === pack.id || hoveredPack === pack.id) ? colorScheme.border : 'rgba(16, 185, 129, 0.2)'}`,
                  boxShadow: (selectedPack === pack.id || hoveredPack === pack.id) ? colorScheme.shadow : 'none',
                  height: '360px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Crystal Icon */}
                <div className="flex justify-center mb-4">
                  <Gem
                    className="w-20 h-20 transition-all duration-300"
                    style={{
                      color: colorScheme.crystal,
                      filter: colorScheme.crystalGlow
                    }}
                  />
                </div>

                {/* Crystal Amount */}
                <div className="text-center mb-2">
                  <div className="font-bold mb-1" style={{
                    fontSize: '2.25rem',
                    background: 'linear-gradient(to right, #fcd34d, #fbbf24)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    {pack.crystals.toLocaleString()}
                  </div>
                  {pack.bonus > 0 ? (
                    <div className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                      +{pack.bonus} {t.bonus}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ height: '20px' }}></div>
                  )}
                </div>

                {/* Spacer */}
                <div style={{ flex: 1 }}></div>

                {/* Price */}
                <div className="text-center mb-6">
                  <span className="font-bold text-white" style={{ fontSize: '2rem' }}>
                    ${pack.price}
                  </span>
                </div>

                {/* Select Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDisabled) {
                      setSelectedPack(pack.id);
                      setShowPaymentModal(true);
                    }
                  }}
                  disabled={isDisabled}
                  className="w-full py-3 font-semibold transition-all"
                  style={{
                    borderRadius: '1rem',
                    background: isDisabled
                      ? 'rgba(100, 116, 139, 0.2)'
                      : selectedPack === pack.id
                      ? colorScheme.buttonBg
                      : `rgba(${colorScheme.crystalRgb}, 0.2)`,
                    color: isDisabled
                      ? '#64748b'
                      : selectedPack === pack.id ? 'white' : colorScheme.buttonText,
                    border: isDisabled
                      ? '1px solid rgba(100, 116, 139, 0.3)'
                      : selectedPack === pack.id ? 'none' : `1px solid ${colorScheme.buttonBorder}`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isDisabled) {
                      e.currentTarget.style.boxShadow = colorScheme.buttonShadow;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {isDisabled ? 'Coming Soon' : (selectedPack === pack.id ? t.selected : t.selectPackage)}
                </button>
              </div>
            </div>
          );
          })}
        </div>

        {/* Bonus Code Section */}
        <div className="mx-auto px-4" style={{ maxWidth: '600px', marginTop: '5rem', marginBottom: '8rem' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-8"
            style={{
              background: 'rgba(5, 46, 38, 0.4)',
              border: '2px solid rgba(251, 191, 36, 0.5)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              boxShadow: '0 4px 20px rgba(251, 191, 36, 0.15)'
            }}
          >
            {/* Title with Icon */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <Gift className="w-6 h-6 text-emerald-400" />
              <h3 className="text-2xl font-bold text-emerald-100">
                {t.bonusCodeTitle}
              </h3>
            </div>

            {/* Input and Button Container */}
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={bonusCode}
                onChange={(e) => setBonusCode(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isRedeeming) {
                    handleRedeemCode();
                  }
                }}
                placeholder={t.bonusCodePlaceholder}
                disabled={isRedeeming}
                className="flex-1 px-4 text-white transition-all outline-none"
                style={{
                  background: 'rgba(6, 78, 59, 0.3)',
                  border: '2px solid rgba(251, 191, 36, 0.4)',
                  fontSize: '0.95rem',
                  borderRadius: '14px',
                  height: '44px'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '2px solid rgba(251, 191, 36, 0.7)';
                  e.currentTarget.style.background = 'rgba(6, 78, 59, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 12px rgba(251, 191, 36, 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '2px solid rgba(251, 191, 36, 0.4)';
                  e.currentTarget.style.background = 'rgba(6, 78, 59, 0.3)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                onClick={handleRedeemCode}
                disabled={isRedeeming || !bonusCode.trim()}
                className="font-semibold transition-all flex items-center justify-center"
                style={{
                  background: (isRedeeming || !bonusCode.trim())
                    ? 'rgba(168, 85, 247, 0.3)'
                    : 'linear-gradient(135deg, #a855f7, #ec4899)',
                  color: (isRedeeming || !bonusCode.trim()) ? 'rgba(255, 255, 255, 0.5)' : 'white',
                  cursor: (isRedeeming || !bonusCode.trim()) ? 'not-allowed' : 'pointer',
                  border: 'none',
                  borderRadius: '14px',
                  height: '44px',
                  width: '44px',
                  minWidth: '44px',
                  fontSize: '0.95rem'
                }}
                onMouseEnter={(e) => {
                  if (!isRedeeming && bonusCode.trim()) {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(168, 85, 247, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <Gift className="w-5 h-5" />
              </button>
            </div>

            {/* Success/Error Message */}
            <AnimatePresence>
              {redeemMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="px-4 py-3 rounded-xl text-sm font-medium"
                  style={{
                    background: redeemMessage.type === 'success'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${redeemMessage.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    color: redeemMessage.type === 'success' ? '#6ee7b7' : '#fca5a5'
                  }}
                >
                  {redeemMessage.text}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedPack && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />

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
                <div className="mb-3">
                  <div className="text-sm text-emerald-300/60">{t.selectedPack}</div>
                  <div className="text-lg font-semibold text-emerald-100 flex items-center gap-2">
                    <Gem className="w-5 h-5 text-purple-400" />
                    {crystalPacks.find(p => p.id === selectedPack)?.crystals.toLocaleString()} {t.crystals}
                    {crystalPacks.find(p => p.id === selectedPack)?.bonus! > 0 && (
                      <span className="text-sm text-green-400">+{crystalPacks.find(p => p.id === selectedPack)?.bonus} {t.bonus}</span>
                    )}
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent mb-6"></div>

                {/* Payment Methods */}
                <div className="mb-6">
                  <h4 className="text-xl font-semibold text-emerald-100 mb-6">Choose Payment Method</h4>
                  <div className="space-y-3">
                    {/* Paddle - Card/Apple Pay/Google Pay */}
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
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>Card / Apple Pay / Google Pay</div>
                          <div className="text-xs" style={{ color: '#9ca3af' }}>Recommended • Powered by Paddle</div>
                        </div>
                      </div>
                    </div>

                    {/* PayPal */}
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
                          <div className="text-xs" style={{ color: '#9ca3af' }}>For PayPal wallet users</div>
                        </div>
                      </div>
                    </div>

                    {/* Cryptocurrency */}
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
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>Cryptocurrency</div>
                          <div className="text-xs" style={{ color: '#9ca3af' }}>USDT / BTC / ETH • For restricted regions</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total and Checkout Button */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-emerald-300/60">{t.total}</div>
                  <div className="text-2xl font-bold text-white">${crystalPacks.find(p => p.id === selectedPack)?.price}</div>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={isProcessing}
                  className="w-full py-4 rounded-2xl font-semibold text-base transition-transform duration-100 active:scale-95"
                  style={{
                    background: isProcessing ? 'rgba(168, 85, 247, 0.5)' : 'linear-gradient(135deg, #a855f7, #ec4899)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(168, 85, 247, 0.3)',
                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) e.currentTarget.style.opacity = '1';
                  }}
                >
                  {isProcessing ? t.processing : `${t.pay} $${crystalPacks.find(p => p.id === selectedPack)?.price}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      {/* Celebration Modal */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              pointerEvents: 'none'
            }}
          >
            {/* Confetti particles */}
            {[...Array(50)].map((_, i) => {
              const colors = ['#fbbf24', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];
              const randomColor = colors[Math.floor(Math.random() * colors.length)];

              // Generate random angle for direction (0 to 360 degrees)
              const angle = (Math.random() * 360) * (Math.PI / 180);
              const velocity = Math.random() * 300 + 200; // Random velocity between 200-500
              const randomXEnd = Math.cos(angle) * velocity;
              const randomYEnd = Math.sin(angle) * velocity;

              const randomRotate = Math.random() * 1440 - 720; // More rotation
              const randomDelay = Math.random() * 0.3;

              return (
                <motion.div
                  key={i}
                  initial={{
                    opacity: 0,
                    y: 0,
                    x: 0,
                    scale: 0,
                    rotate: 0
                  }}
                  animate={{
                    opacity: [0, 1, 1, 0.8, 0],
                    y: [0, randomYEnd * 0.3, randomYEnd * 0.7, randomYEnd],
                    x: [0, randomXEnd * 0.3, randomXEnd * 0.7, randomXEnd],
                    scale: [0, 1.2, 1, 0.8, 0.3],
                    rotate: [0, randomRotate * 0.5, randomRotate]
                  }}
                  transition={{
                    duration: 3.5,
                    delay: randomDelay,
                    ease: [0.4, 0.0, 0.2, 1]
                  }}
                  style={{
                    position: 'absolute',
                    width: Math.random() * 12 + 6 + 'px',
                    height: Math.random() * 12 + 6 + 'px',
                    background: randomColor,
                    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                    top: '50%',
                    left: '50%'
                  }}
                />
              );
            })}

            {/* Success message */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15
              }}
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))',
                backdropFilter: 'blur(10px)',
                padding: '3rem 4rem',
                borderRadius: '24px',
                border: '3px solid rgba(251, 191, 36, 0.6)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(251, 191, 36, 0.4)',
                pointerEvents: 'auto',
                textAlign: 'center'
              }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2,
                  ease: "easeInOut"
                }}
              >
                <Gem
                  size={80}
                  style={{
                    color: '#fbbf24',
                    filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.8))',
                    marginBottom: '1rem'
                  }}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '0.5rem',
                  textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
                }}
              >
                +250
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={{
                  fontSize: '1.25rem',
                  color: 'rgba(255, 255, 255, 0.95)',
                  fontWeight: '500',
                  textShadow: '0 1px 5px rgba(0, 0, 0, 0.2)'
                }}
              >
                Crystals Awarded!
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crypto Selection Modal */}
      <CryptoSelectionModal
        isOpen={showCryptoSelection}
        onClose={() => setShowCryptoSelection(false)}
        onSelect={handleCryptoSelect}
        planName={selectedPack ? `${crystalPacks.find(p => p.id === selectedPack)?.crystals.toLocaleString()} Crystals` : ''}
        planPrice={selectedPack ? crystalPacks.find(p => p.id === selectedPack)?.price || 0 : 0}
      />

      {/* Crypto Payment Modal */}
      <CryptoPaymentModal
        isOpen={showCryptoPayment}
        onClose={() => {
          setShowCryptoPayment(false);
          setCryptoPaymentData(null);
        }}
        paymentData={cryptoPaymentData}
        planName={selectedPack ? `${crystalPacks.find(p => p.id === selectedPack)?.crystals.toLocaleString()} Crystals` : ''}
      />

      {/* Loading overlay for crypto */}
      {cryptoLoading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: 999999 }}>
          <div className="text-white text-lg">Creating payment...</div>
        </div>
      )}

      <Footer />
    </div>
  );
}

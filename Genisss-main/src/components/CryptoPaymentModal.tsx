import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, CheckCircle } from 'lucide-react';
import QRCode from 'qrcode';

interface CryptoPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentData: {
    order_id: string;
    payment_url: string;
    wallet_address?: string;
    amount_usd: number;
    crypto_amount?: number;
    cryptocurrency: string;
    crypto_code?: string;
    network?: string;
    plan_name?: string;
  } | null;
  planName: string;
  onPaymentComplete?: () => void;
}

// Crypto icons mapping
const CRYPTO_ICONS: Record<string, string> = {
  btc: '₿',
  eth: 'Ξ',
  usdttrc20: '₮',
  usdterc20: '₮',
  bnbbsc: 'B',
  bnb: 'B',
  usdt: '₮'
};

export function CryptoPaymentModal({
  isOpen,
  onClose,
  paymentData,
  planName
}: CryptoPaymentModalProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate QR Code
  useEffect(() => {
    if (paymentData?.wallet_address && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        paymentData.wallet_address,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        },
        (error) => {
          if (error) console.error('QR Code generation error:', error);
        }
      );
    }
  }, [paymentData?.wallet_address]);

  const handleCopyAddress = () => {
    if (paymentData?.wallet_address) {
      navigator.clipboard.writeText(paymentData.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!paymentData) return null;

  const cryptoIcon = CRYPTO_ICONS[paymentData.crypto_code?.toLowerCase() || ''] || '🪙';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            style={{ zIndex: 99999 }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
            style={{ zIndex: 999999 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-8 w-full max-h-[85vh] overflow-y-auto custom-scrollbar relative"
              style={{
                maxWidth: '500px',
                background: 'rgba(20, 25, 30, 0.98)',
                border: '1px solid rgba(71, 85, 105, 0.3)',
                boxShadow: '0 25px 70px rgba(0, 0, 0, 0.7)'
              }}
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10"
                style={{
                  background: 'rgba(71, 85, 105, 0.3)',
                  border: '1px solid rgba(71, 85, 105, 0.5)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(71, 85, 105, 0.3)';
                }}
              >
                <X className="w-5 h-5 text-gray-300" />
              </button>

              {/* Crypto Icon */}
              <div className="flex flex-col items-center mb-6 mt-4">
                <div className="flex items-center justify-center mb-4">
                  <span className="inline-flex items-center justify-center" style={{ fontSize: '72px', width: '72px', height: '72px' }}>
                    {cryptoIcon}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">{paymentData.cryptocurrency}</h2>
                <p className="text-sm text-emerald-300/70 text-center">Send payment to the address below</p>
              </div>

              {/* Amount */}
              <div className="mb-6 px-6 py-4 rounded-lg" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-base text-emerald-300/70">Amount</span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {paymentData.crypto_amount?.toFixed(8) || '---'} {paymentData.crypto_code?.toUpperCase()}
                    </div>
                    <div className="text-sm text-emerald-300/60 mt-1">
                      ≈ ${paymentData.amount_usd}
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent mb-5"></div>

              {/* QR Code */}
              <div className="flex justify-center mb-5">
                <div className="p-3 rounded-lg" style={{ background: 'white' }}>
                  <canvas ref={canvasRef} />
                </div>
              </div>

              {/* Wallet Address */}
              <div className="mb-6">
                <label className="text-sm text-emerald-300/70 mb-3 block font-medium px-1">Wallet Address</label>
                <div
                  className="px-4 py-3 rounded-lg font-mono text-sm break-all leading-relaxed mb-3"
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(71, 85, 105, 0.4)',
                    color: '#ffffff'
                  }}
                >
                  {paymentData.wallet_address}
                </div>
                <button
                  onClick={handleCopyAddress}
                  className="w-full px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                  style={{
                    background: copied
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))'
                      : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.2))',
                    border: '1.5px solid rgba(16, 185, 129, 0.5)',
                    color: '#ffffff'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(5, 150, 105, 0.4))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = copied
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))'
                      : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.2))';
                  }}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      <span className="text-sm font-medium">Copy Address</span>
                    </>
                  )}
                </button>
              </div>

              {/* Network Info */}
              {paymentData.network && (
                <div className="mb-6 px-6 py-4 rounded-lg" style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1.5px solid rgba(234, 179, 8, 0.3)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚠️</span>
                      <span className="text-sm font-semibold text-yellow-300/90">Network</span>
                    </div>
                    <div className="px-4 py-1 rounded-md" style={{
                      background: 'rgba(234, 179, 8, 0.25)',
                      border: '1px solid rgba(234, 179, 8, 0.6)'
                    }}>
                      <span className="text-base font-bold text-yellow-100 capitalize">
                        {paymentData.network.replace('-', ' ')}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-yellow-200/60 leading-relaxed">
                    Make sure to send via the correct network to avoid loss of funds
                  </p>
                </div>
              )}

              {/* Instructions */}
              <div className="px-6 py-4 rounded-lg" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <ul className="text-sm text-emerald-300/80 space-y-3">
                  <li className="leading-relaxed">✓ Send exactly <strong>{paymentData.crypto_amount?.toFixed(8)} {paymentData.crypto_code?.toUpperCase()}</strong> to the address above</li>
                  <li className="leading-relaxed">✓ Payment will be confirmed automatically after blockchain confirmation</li>
                  <li className="leading-relaxed">✓ Credits will be added to your account once payment is verified</li>
                </ul>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-emerald-300/50">
                  🔒 Secure payment powered by NOWPayments
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

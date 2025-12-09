import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight } from 'lucide-react';

interface Cryptocurrency {
  code: string;
  name: string;
  network: string;
  icon: string;
}

// Top 5 most popular cryptocurrencies (NOWPayments format)
const cryptocurrencies: Cryptocurrency[] = [
  { code: 'btc', name: 'Bitcoin', network: 'bitcoin', icon: '₿' },
  { code: 'eth', name: 'Ethereum', network: 'ethereum', icon: 'Ξ' },
  { code: 'usdttrc20', name: 'Tether (TRC20)', network: 'tron', icon: '₮' },
  { code: 'usdterc20', name: 'Tether (ERC20)', network: 'ethereum', icon: '₮' },
  { code: 'bnbbsc', name: 'BNB', network: 'bsc', icon: 'B' }
];

const getCryptoColor = (code: string): string => {
  const upperCode = code.toUpperCase();
  const colors: { [key: string]: string } = {
    'BTC': '#f7931a',
    'ETH': '#627eea',
    'USDT': '#26a17b',
    'USDTTRC20': '#26a17b',
    'USDTERC20': '#26a17b',
    'USDC': '#2775ca',
    'LTC': '#345d9d',
    'BCH': '#8dc351',
    'TRX': '#ef0027',
    'BNB': '#f3ba2f',
    'BNBBSC': '#f3ba2f',
    'DAI': '#f5ac37'
  };
  return colors[upperCode] || '#10b981';
};

interface CryptoSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (crypto: Cryptocurrency) => void;
  planName: string;
  planPrice: number;
}

export function CryptoSelectionModal({ isOpen, onClose, onSelect, planName, planPrice }: CryptoSelectionModalProps) {
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
            className="fixed inset-0 flex items-center justify-center p-4"
            onClick={onClose}
            style={{ zIndex: 999999 }}
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
                  <div className="text-sm text-emerald-300/60">{planName}</div>
                  <div className="text-lg font-semibold text-emerald-100">${planPrice}</div>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent mb-5"></div>

              {/* Title */}
              <div className="mb-6">
                <h4 className="text-xl font-semibold text-emerald-100">Select Cryptocurrency</h4>
              </div>

              {/* Cryptocurrency List */}
              <div className="space-y-3">
                {cryptocurrencies.map((crypto, index) => {
                  const cryptoColor = getCryptoColor(crypto.code);
                  const uniqueKey = `${crypto.code}-${crypto.network}`;

                  return (
                    <div
                      key={uniqueKey}
                      onClick={() => onSelect(crypto)}
                      className="cursor-pointer py-6 rounded-2xl transition-all"
                      style={{
                        background: 'rgba(30, 41, 59, 0.3)',
                        border: '2px solid rgba(71, 85, 105, 0.4)',
                        paddingLeft: '1.75rem',
                        paddingRight: '1.75rem'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
                        e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.8)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.3)';
                        e.currentTarget.style.borderColor = 'rgba(71, 85, 105, 0.4)';
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold text-white"
                          style={{
                            background: cryptoColor
                          }}
                        >
                          {crypto.icon}
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold" style={{ color: '#ffffff' }}>
                            {crypto.name}
                          </div>
                          <div className="text-xs capitalize" style={{ color: '#9ca3af' }}>
                            {crypto.network.replace('-', ' ')} network
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Note */}
              <div className="mt-8 text-center">
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

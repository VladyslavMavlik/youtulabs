import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Headset, Gem, Menu, X } from 'lucide-react';
import { Button } from './ui/button';
import { SimpleAuthModal } from './SimpleAuthModal';
import { UserMenu } from './UserMenu';
import { signOut } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';

interface MobileHeaderProps {
  user: SupabaseUser | null;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  balance: number;
  userPlan?: string;
}

/**
 * MobileHeader - Optimized header for mobile devices
 * Compact layout with hamburger menu for navigation
 */
export function MobileHeader({ user, language, onLanguageChange, balance, userPlan }: MobileHeaderProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [initialTab, setInitialTab] = useState<'login' | 'register'>('login');
  const [showMenu, setShowMenu] = useState(false);
  const t = translations[language];

  useEffect(() => {
    const handleOpenAuthDialog = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: 'login' | 'register' }>;
      const tab = customEvent.detail?.tab || 'register';
      setInitialTab(tab);
      setShowAuthDialog(true);
    };

    window.addEventListener('openAuthDialog', handleOpenAuthDialog);
    return () => window.removeEventListener('openAuthDialog', handleOpenAuthDialog);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setShowMenu(false);
  };

  const handleAuthSuccess = async () => {
    setShowAuthDialog(false);
    window.location.reload();
  };

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 bg-emerald-950/95 backdrop-blur-xl border-b border-emerald-600/30"
      >
        <div className="w-full py-2 px-4 flex items-center justify-between">
          {/* Logo - компактний зі статичною іконкою але з анімацією */}
          <motion.div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => window.location.href = '/'}
          >
            <motion.div
              className="relative"
              animate={{
                scale: [1, 1, 1, 1, 1.05, 1],
                rotate: [0, 0, 0, 0, 3, -3, 0],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <motion.div
                style={{
                  borderRadius: '50%',
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  padding: '2px',
                }}
                animate={{
                  borderColor: [
                    'rgba(16, 185, 129, 0.3)',
                    'rgba(234, 179, 8, 0.4)',
                    'rgba(16, 185, 129, 0.3)',
                    'rgba(16, 185, 129, 0.3)',
                    'rgba(239, 68, 68, 0.5)',
                    'rgba(16, 185, 129, 0.3)',
                  ],
                  boxShadow: [
                    '0 0 0px rgba(239, 68, 68, 0)',
                    '0 0 0px rgba(239, 68, 68, 0)',
                    '0 0 0px rgba(239, 68, 68, 0)',
                    '0 0 0px rgba(239, 68, 68, 0)',
                    '0 0 15px rgba(239, 68, 68, 0.6)',
                    '0 0 0px rgba(239, 68, 68, 0)',
                  ],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <img
                  src="/youtulabs-logo.png"
                  alt="YoutuLabs"
                  style={{
                    width: '28px',
                    height: '28px',
                    objectFit: 'contain',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.05)',
                  }}
                />
              </motion.div>
            </motion.div>

            <h1 className="text-lg" style={{ fontFamily: 'Roboto, sans-serif', letterSpacing: '0.01em', fontWeight: '400' }}>
              <span style={{ color: '#6ee7b7' }}>Youtu</span>
              <span style={{
                color: '#F16B27',
                display: 'inline-block',
                position: 'relative',
                filter: 'drop-shadow(0 2px 6px rgba(241, 107, 39, 0.3))'
              }}>Labs</span>
            </h1>
          </motion.div>

          {/* Права частина - Баланс + Меню */}
          <div className="flex items-center gap-2">
            {user && (
              <motion.div
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'subscription' } }));
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer"
                style={{ border: '1px solid #a855f7', backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
              >
                <Gem className="w-3.5 h-3.5" style={{ color: '#a855f7' }} />
                <span className="text-xs font-semibold" style={{
                  background: 'linear-gradient(to right, #c084fc, #f472b6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  {balance.toLocaleString()}
                </span>
              </motion.div>
            )}

            {user ? (
              <UserMenu
                onLogout={handleSignOut}
                balance={balance}
                userEmail={user.email}
                userName={user.user_metadata?.name}
                avatarUrl={user.user_metadata?.avatar_url}
                isAdmin={user.user_metadata?.role === 'admin'}
                subscriptionPlan={userPlan}
                language={language}
                onLanguageChange={onLanguageChange}
              />
            ) : (
              <button
                onClick={() => {
                  setInitialTab('register');
                  setShowAuthDialog(true);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-md"
                style={{
                  background: 'linear-gradient(to right, #eab308, #ca8a04)',
                  color: 'white',
                  border: 'none',
                }}
              >
                {t.signUp}
              </button>
            )}
          </div>
        </div>
      </motion.header>

      <SimpleAuthModal
        open={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        onSuccess={handleAuthSuccess}
        initialTab={initialTab}
      />
    </>
  );
}

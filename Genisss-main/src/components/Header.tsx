import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Headset, Gem, Send, Mail, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Odometer } from './Odometer';
import { SimpleAuthModal } from './SimpleAuthModal';
import { UserMenu } from './UserMenu';
import { signInWithGoogle, signOut, supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';

interface HeaderProps {
  user: SupabaseUser | null;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  balance: number;
  userPlan?: string;
  showAuthDialog?: boolean;
  onShowAuthDialogChange?: (show: boolean) => void;
  initialTab?: 'login' | 'register';
}

export function Header({ user, language, onLanguageChange, balance, userPlan, showAuthDialog: externalShowAuthDialog, onShowAuthDialogChange, initialTab: externalInitialTab }: HeaderProps) {
  const [storyCount, setStoryCount] = useState<number>(1323);
  const [internalShowAuthDialog, setInternalShowAuthDialog] = useState(false);
  const [internalInitialTab, setInternalInitialTab] = useState<'login' | 'register'>('login');
  const [showSupportMenu, setShowSupportMenu] = useState(false);
  const [telegramHovered, setTelegramHovered] = useState(false);
  const [supportHovered, setSupportHovered] = useState(false);
  const [supportButtonHovered, setSupportButtonHovered] = useState(false);
  const [emailHovered, setEmailHovered] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [giftHovered, setGiftHovered] = useState(false);
  const supportMenuRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  const showAuthDialog = externalShowAuthDialog ?? internalShowAuthDialog;
  const initialTab = externalInitialTab ?? internalInitialTab;
  const setShowAuthDialog = (show: boolean) => {
    if (onShowAuthDialogChange) {
      onShowAuthDialogChange(show);
    } else {
      setInternalShowAuthDialog(show);
    }
  };
  const setInitialTab = (tab: 'login' | 'register') => {
    setInternalInitialTab(tab);
  };

  // Update internal tab when external tab changes
  useEffect(() => {
    if (externalInitialTab) {
      setInternalInitialTab(externalInitialTab);
    }
  }, [externalInitialTab]);

  // Listen for auth dialog open events from other components
  useEffect(() => {
    const handleOpenAuthDialog = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: 'login' | 'register' }>;
      const tab = customEvent.detail?.tab || 'register';
      setInternalInitialTab(tab);
      setShowAuthDialog(true);
    };

    window.addEventListener('openAuthDialog', handleOpenAuthDialog);
    return () => window.removeEventListener('openAuthDialog', handleOpenAuthDialog);
  }, []);

  // Close support menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (supportMenuRef.current && !supportMenuRef.current.contains(event.target as Node)) {
        setShowSupportMenu(false);
      }
    };

    if (showSupportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSupportMenu]);

  // Real-time global story counter with Supabase Realtime
  useEffect(() => {
    // Initial fetch from database
    const fetchInitialCount = async () => {
      try {
        const { data, error } = await supabase
          .from('global_stats')
          .select('total_stories')
          .eq('id', 'singleton')
          .single();

        if (error) {
          // Silently ignore if table doesn't exist (migration not applied)
          if (error.code !== 'PGRST205') {
            console.error('[HEADER] Failed to fetch initial counter:', error);
          }
          return;
        }

        if (data) {
          setStoryCount(data.total_stories);
        }
      } catch (err) {
        console.error('[HEADER] Exception fetching counter:', err);
      }
    };

    fetchInitialCount();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('global_stats_counter')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'global_stats',
          filter: 'id=eq.singleton'
        },
        (payload) => {
          console.log('[HEADER] 📊 Counter updated via Realtime:', payload.new.total_stories);
          setStoryCount(payload.new.total_stories);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[HEADER] ✅ Realtime counter subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[HEADER] ❌ Realtime counter subscription error');
        }
      });

    return () => {
      console.log('[HEADER] 🔕 Unsubscribing from counter updates');
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-increment counter organically with randomness for natural feel
  useEffect(() => {
    const DAILY_TARGET = 300; // Target ~300 stories per 24 hours
    const LAST_INCREMENT_KEY = 'last_counter_increment';
    const BASE_COUNT_KEY = 'base_story_count';
    const DAY_START_KEY = 'counter_day_start';
    const DAILY_COUNT_KEY = 'daily_increment_count';

    let timeoutId: NodeJS.Timeout | null = null;

    const getRandomInterval = () => {
      // Random interval between 3-8 minutes
      const minInterval = 3 * 60 * 1000; // 3 minutes
      const maxInterval = 8 * 60 * 1000; // 8 minutes
      return Math.floor(Math.random() * (maxInterval - minInterval) + minInterval);
    };

    const getRandomIncrement = () => {
      // Get hour of day for organic distribution
      const hour = new Date().getHours();

      // More activity during day (8am-11pm), less at night
      const isDaytime = hour >= 8 && hour <= 23;

      if (isDaytime) {
        // 1-3 stories during daytime (70% chance of 1-2, 30% chance of 3)
        const rand = Math.random();
        if (rand < 0.4) return 1;
        if (rand < 0.7) return 2;
        return 3;
      } else {
        // 1 story at night (80% chance), rarely 2 (20% chance)
        return Math.random() < 0.8 ? 1 : 2;
      }
    };

    const scheduleNextIncrement = () => {
      const interval = getRandomInterval();
      timeoutId = setTimeout(() => {
        incrementCounter();
      }, interval);
    };

    const incrementCounter = () => {
      const now = Date.now();
      const baseCount = localStorage.getItem(BASE_COUNT_KEY);
      const baseCountNum = baseCount ? parseInt(baseCount, 10) : 1323;
      const dayStart = localStorage.getItem(DAY_START_KEY);
      const dayStartTime = dayStart ? parseInt(dayStart, 10) : now;
      const dailyCount = localStorage.getItem(DAILY_COUNT_KEY);
      const dailyCountNum = dailyCount ? parseInt(dailyCount, 10) : 0;

      // Check if we need to start a new day (reset after 24 hours)
      const timeSinceDayStart = now - dayStartTime;
      const daysPassed = Math.floor(timeSinceDayStart / (24 * 60 * 60 * 1000));

      if (daysPassed > 0) {
        // New day - reset daily counter
        console.log(`[HEADER] 🌅 New day started, daily count was ${dailyCountNum}`);
        localStorage.setItem(DAY_START_KEY, now.toString());
        localStorage.setItem(DAILY_COUNT_KEY, '0');
        scheduleNextIncrement();
        return;
      }

      // Don't increment if we've already hit daily target
      if (dailyCountNum >= DAILY_TARGET) {
        console.log(`[HEADER] 🎯 Daily target reached (${dailyCountNum}/${DAILY_TARGET}), waiting for next day`);
        scheduleNextIncrement();
        return;
      }

      // Random increment
      const increment = getRandomIncrement();
      const newDailyCount = dailyCountNum + increment;
      const newCount = baseCountNum + increment;

      console.log(`[HEADER] 📈 Organic increment: +${increment} → ${newCount} (daily: ${newDailyCount}/${DAILY_TARGET})`);

      // Update local storage
      localStorage.setItem(LAST_INCREMENT_KEY, now.toString());
      localStorage.setItem(BASE_COUNT_KEY, newCount.toString());
      localStorage.setItem(DAILY_COUNT_KEY, newDailyCount.toString());

      // Update state
      setStoryCount(newCount);

      // Update database if it exists
      supabase
        .from('global_stats')
        .update({ total_stories: newCount })
        .eq('id', 'singleton')
        .then(({ error }) => {
          if (error && error.code !== 'PGRST205') {
            console.error('[HEADER] Failed to update counter in database:', error);
          }
        });

      // Schedule next increment
      scheduleNextIncrement();
    };

    // Initialize on mount
    const dayStart = localStorage.getItem(DAY_START_KEY);
    if (!dayStart) {
      // First time initialization
      const now = Date.now();
      localStorage.setItem(DAY_START_KEY, now.toString());
      localStorage.setItem(LAST_INCREMENT_KEY, now.toString());
      localStorage.setItem(BASE_COUNT_KEY, '1323');
      localStorage.setItem(DAILY_COUNT_KEY, '0');
    }

    // Start the increment cycle
    scheduleNextIncrement();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleAuthSuccess = async () => {
    setShowAuthDialog(false);
    // Reload the page to get the user
    window.location.reload();
  };

  const getUserInitials = () => {
    if (!user?.user_metadata?.name && !user?.email) return 'U';
    const name = user.user_metadata?.name || user.email;
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 bg-emerald-950/95 backdrop-blur-xl border-b border-emerald-600/30"
    >
      <div className="w-full py-3 flex items-center justify-between" style={{ paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
        {/* Logo and counter on the left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6 cursor-pointer"
          onClick={() => window.location.href = '/'}
          style={{ height: '100%' }}
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
                padding: '4px',
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
                  '0 0 20px rgba(239, 68, 68, 0.6)',
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
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.05)',
                }}
              />
            </motion.div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl"
            style={{
              fontFamily: 'Roboto, sans-serif',
              letterSpacing: '0.01em',
              fontWeight: '400',
            }}
          >
            <span style={{ color: '#6ee7b7' }}>Youtu</span>
            <span style={{
              color: '#F16B27',
              display: 'inline-block',
              position: 'relative',
              filter: 'drop-shadow(0 2px 6px rgba(241, 107, 39, 0.3))'
            }}>Labs</span>
          </motion.h1>

          {/* Story counter */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            style={{ height: '100%' }}
          >
            <Odometer value={storyCount} label={t.storiesGenerated} />
          </motion.div>
        </motion.div>

        <div className="flex items-center gap-6">
          {user && (
            <div className="flex items-center gap-3">
              {/* Gift Icon with Animation */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.1 }}
                className="cursor-pointer relative flex items-center justify-center"
                style={{ width: '40px', height: '40px', marginTop: '-4px' }}
                onMouseEnter={() => setGiftHovered(true)}
                onMouseLeave={() => setGiftHovered(false)}
                onClick={() => {
                  window.open('https://t.me/youtulabs_bot', '_blank');
                }}
              >
                {/* Confetti animations - only render on hover */}
                {giftHovered && (
                  <>
                    <img
                      src="/premium-icon.gif"
                      alt=""
                      style={{
                        width: '70px',
                        height: '70px',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 0,
                        pointerEvents: 'none',
                        opacity: 0.9,
                      }}
                    />
                    <img
                      src="/premium-icon.gif"
                      alt=""
                      style={{
                        width: '60px',
                        height: '60px',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        zIndex: 0,
                        pointerEvents: 'none',
                        opacity: 0.7,
                      }}
                    />
                    <img
                      src="/premium-icon.gif"
                      alt=""
                      style={{
                        width: '80px',
                        height: '80px',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-30deg)',
                        zIndex: 0,
                        pointerEvents: 'none',
                        opacity: 0.5,
                      }}
                    />
                  </>
                )}
                {/* Gift box animation - always visible */}
                <img
                  src="/gift-animation.gif"
                  alt="Gift"
                  style={{
                    width: '40px',
                    height: '40px',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              </motion.div>

              {/* Balance */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{
                  scale: 0.95,
                  boxShadow: '0 0 25px rgba(168, 85, 247, 0.9), 0 0 50px rgba(236, 72, 153, 0.6)'
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'subscription' } }));
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                style={{ border: '1px solid #a855f7', backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
              >
                <motion.div
                  className="relative"
                  animate={{
                    rotate: [0, -10, 10, -10, 0],
                    scale: [1, 1.1, 1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 3,
                  }}
                >
                  <Gem className="w-4 h-4" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 1)) drop-shadow(0 0 15px rgba(236, 72, 153, 0.6))' }} />
                </motion.div>
                <span className="text-sm font-semibold" style={{ background: 'linear-gradient(to right, #c084fc, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent', filter: 'brightness(1.2)' }}>
                  {balance.toLocaleString()}
                </span>
              </motion.div>
            </div>
          )}

          {/* Telegram Channel Button with Tooltip */}
          <div className="relative group ml-2">
            <motion.div
              animate={{
                x: [0, 2, 1, 3, 0],
                y: [0, -1, -0.5, -2, 0]
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{ zIndex: 1, position: 'relative' }}
            >
              {/* Свічіння під іконкою */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 w-10 h-4 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(0, 136, 204, 0.8) 0%, rgba(0, 136, 204, 0.4) 30%, transparent 60%)',
                  filter: 'blur(8px)',
                  zIndex: -1,
                  bottom: '0.25rem'
                }}
                animate={{
                  opacity: [0.3, 1, 0.3],
                  scale: [0.9, 1.3, 0.9]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />

              <Button
                variant="ghost"
                size="sm"
                asChild
                className="hover:bg-[#0088cc]/10 transition-all duration-200 px-2 relative"
              >
                <a
                  href="https://t.me/youtulabs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src="/telegram-icon.ico"
                    alt="Telegram"
                    style={{ width: '28px', height: '28px' }}
                  />
                </a>
              </Button>
            </motion.div>
            {/* Tooltip */}
            <div className="absolute right-0 mt-2 w-64 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
              <div className="bg-emerald-950/95 border border-emerald-600/30 rounded-lg px-6 py-4 shadow-lg backdrop-blur-sm">
                <p className="text-sm text-emerald-100/90">{t.telegramChannel}</p>
              </div>
            </div>
          </div>

          {/* Support Button with Dropdown */}
          <div className="relative" ref={supportMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSupportMenu(!showSupportMenu)}
              onMouseEnter={() => setSupportButtonHovered(true)}
              onMouseLeave={() => setSupportButtonHovered(false)}
              className="hover:bg-yellow-400/10 transition-all duration-200 px-2"
              style={{ position: 'relative' }}
            >
              {/* White/Black circle background */}
              <div
                style={{
                  position: 'absolute',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: supportButtonHovered ? '#000000' : '#ffffff',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 0,
                  transition: 'background-color 0.2s ease'
                }}
              />
              {/* Helper icon */}
              <img
                src="/helpers.ico"
                alt="Support"
                style={{ width: '28px', height: '28px', position: 'relative', zIndex: 1 }}
              />
            </Button>

            <AnimatePresence>
              {showSupportMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg border overflow-hidden z-50"
                  style={{
                    backgroundColor: 'rgba(6, 78, 59, 0.95)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="py-2">
                    {/* Telegram Bot */}
                    <a
                      href="https://t.me/youtulabs_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 transition-all duration-200 cursor-pointer"
                      onMouseEnter={(e) => {
                        setTelegramHovered(true);
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        setTelegramHovered(false);
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => setShowSupportMenu(false)}
                    >
                      <div className="flex items-center justify-center" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="16" r="16" fill="#0088cc"/>
                          <path d="M22.987 10.209c.17-.802-.445-1.133-1.213-.831l-17.28 6.664c-1.179.472-1.173 1.127-.215 1.418l4.428 1.382 10.264-6.471c.485-.297.927-.136.563.184l-8.313 7.507-.316 4.492c.462 0 .665-.211.924-.461l2.217-2.147 4.604 3.396c.848.467 1.457.226 1.666-.787l3.015-14.211-.344-.135z" fill="white"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{
                          color: telegramHovered ? '#ffffff' : 'rgba(209, 250, 229, 0.9)',
                          transition: 'color 0.2s'
                        }}>YotuLabs</div>
                        <div className="text-xs" style={{ color: 'rgba(209, 250, 229, 0.6)' }}>
                          {t.telegramBot}
                        </div>
                      </div>
                    </a>

                    {/* Contact Support */}
                    <a
                      href="https://t.me/youtulabs_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 transition-all duration-200 cursor-pointer"
                      onMouseEnter={(e) => {
                        setSupportHovered(true);
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        setSupportHovered(false);
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => setShowSupportMenu(false)}
                    >
                      <div className="flex items-center justify-center" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                        <Headset className="w-5 h-5" style={{ color: '#fbbf24' }} />
                      </div>
                      <span className="text-sm flex-1" style={{
                        color: supportHovered ? '#fbbf24' : 'rgba(209, 250, 229, 0.9)',
                        transition: 'color 0.2s'
                      }}>{t.contactSupport}</span>
                    </a>

                    {/* Email Support */}
                    <div
                      className="flex items-center gap-2 py-3 transition-all duration-200 cursor-pointer"
                      style={{ paddingLeft: '1rem', paddingRight: '1rem' }}
                      onMouseEnter={(e) => {
                        setEmailHovered(true);
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        setEmailHovered(false);
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText('youtulabs@gmail.com');
                        setEmailCopied(true);
                        setTimeout(() => setEmailCopied(false), 2000);
                      }}
                    >
                      <div className="flex items-center justify-center" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                        <Mail className="w-5 h-5" style={{ color: '#10b981' }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{
                          color: emailHovered ? '#10b981' : 'rgba(209, 250, 229, 0.9)',
                          transition: 'color 0.2s'
                        }}>{t.emailSupport}</div>
                        <div className="text-xs" style={{ color: 'rgba(209, 250, 229, 0.6)' }}>
                          youtulabs@gmail.com
                        </div>
                      </div>
                      <div className="flex items-center justify-center" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                        {emailCopied ? (
                          <span className="text-xs" style={{ color: '#fbbf24' }}>✓</span>
                        ) : (
                          <Copy className="w-2.5 h-2.5" style={{ color: '#fbbf24' }} />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🟢 Login button clicked, setting showAuthDialog to true');
                  setInternalInitialTab('login');
                  setShowAuthDialog(true);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.85';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                style={{
                  background: 'linear-gradient(to right, #14b8a6, #0d9488)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  transition: 'opacity 150ms ease',
                  opacity: 1
                }}
              >
                {t.login}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🟢 Sign Up button clicked, setting showAuthDialog to true');
                  setInternalInitialTab('register');
                  setShowAuthDialog(true);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.85';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                style={{
                  background: 'linear-gradient(to right, #eab308, #ca8a04)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  transition: 'opacity 150ms ease',
                  opacity: 1
                }}
              >
                {t.signUp}
              </button>
            </div>
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
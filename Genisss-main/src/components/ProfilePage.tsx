import { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Calendar, Gem, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Header } from './Header';
import { Footer } from './Footer';
import { MouseFollowBackground } from './MouseFollowBackground';
import { updateUserProfile, getUserSubscription, supabase } from '../lib/supabase';
import { toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSubscriptionStyle } from '../lib/subscriptionColors';
import { getAvatarColor } from '../lib/avatarColors';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';

interface ProfilePageProps {
  onBack: () => void;
  user?: SupabaseUser | null;
  balance?: number;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
  userPlan?: string;
}

export function ProfilePage({ onBack, user, balance = 0, language = 'en', onLanguageChange, userPlan }: ProfilePageProps) {
  const t = translations[language];
  const API_URL = import.meta.env.VITE_API_URL ?? '';
  const [name, setName] = useState(user?.user_metadata?.name || 'User');
  const [email, setEmail] = useState(user?.email || 'user@example.com');
  const [isSaving, setIsSaving] = useState(false);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Load subscription on mount
  useEffect(() => {
    if (user) {
      loadSubscription();
    }
  }, [user]);


  const loadSubscription = async () => {
    const subscription = await getUserSubscription();
    setUserSubscription(subscription);
  };

  // Get registration date from user data
  const getRegistrationDate = () => {
    if (user?.created_at) {
      const date = new Date(user.created_at);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return 'N/A';
  };

  // Get avatar URL (from Google or use default)
  const avatarUrl = user?.user_metadata?.avatar_url || '';

  // Get subscription colors from the centralized function
  const subStyle = getSubscriptionStyle(userSubscription?.plan_id);

  // Get avatar gradient based on first letter
  const avatarGradient = getAvatarColor(name || email || 'User');

  // Get plan display name
  const getPlanName = () => {
    if (!userSubscription?.plan_id) return t.freePlan;
    const plan = userSubscription.plan_id.toLowerCase();
    if (plan === 'starter') return t.starterPlan;
    if (plan === 'pro') return t.proPlan;
    if (plan === 'ultimate') return t.ultimatePlan;
    return t.freePlan;
  };

  // Get subscription status
  const getStatus = () => {
    if (!userSubscription?.plan_id) return t.noSubscription;
    if (userSubscription.status === 'active') return t.active;
    return userSubscription.status || 'Inactive';
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      console.log('🔵 Saving name:', name.trim());
      const { data, error } = await updateUserProfile({ name: name.trim() });

      if (error) {
        toast.error('Failed to save profile');
        console.error('Save error:', error);
      } else {
        console.log('🔵 Profile saved successfully, data:', data);
        toast.success('Profile saved successfully!');
        // Reload page to refresh user data
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('Profile save error:', error);
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsOpeningPortal(true);
    try {
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Authentication required');
        return;
      }

      const response = await fetch(`${API_URL}/paddle/management-url`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (response.ok && result.url) {
        // Open Paddle Customer Portal in new tab
        window.open(result.url, '_blank');
        toast.success('Opening subscription management...');
      } else {
        toast.error(result.error || 'Failed to open subscription management');
      }
    } catch (error) {
      console.error('Manage subscription error:', error);
      toast.error('Failed to open subscription management');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!userSubscription?.plan_id) {
      toast.error('No active subscription to cancel');
      return;
    }

    setIsCanceling(true);
    try {
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Authentication required');
        return;
      }

      // Call LemonSqueezy to get customer portal URL
      const response = await fetch(`${API_URL}/api/lemonsqueezy/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      const result = await response.json();

      // If LemonSqueezy returns portal URL, redirect there
      if (response.ok && result.portal_url) {
        setShowCancelModal(false);
        window.open(result.portal_url, '_blank');
        toast.success('Opening subscription management portal...');
        return;
      }

      // Show error if failed
      toast.error(result.error || result.message || 'Failed to cancel subscription');
    } catch (error) {
      console.error('Cancel subscription error:', error);
      toast.error('Failed to cancel subscription');
    } finally {
      setIsCanceling(false);
    }
  };

  const getUserInitials = () => {
    if (!name && !email) return 'U';
    const displayName = name || email;
    return displayName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col" style={{ scrollbarGutter: 'stable' }}>
      {/* Mouse follow background */}
      <MouseFollowBackground />

      <Header
        user={user || null}
        language={language}
        onLanguageChange={onLanguageChange || (() => {})}
        balance={balance}
        userPlan={userPlan}
      />

      {/* Spacer for fixed header */}
      <div className="h-20 flex-shrink-0"></div>

      <div className="relative z-10 pb-20 px-8 flex-1">
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
        <div className="mb-12 text-center" style={{ marginTop: '-3rem' }}>
          <h1 className="text-5xl mb-3 font-bold">
            <span style={{ background: 'linear-gradient(to right, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>{t.myProfile.split(' ')[0]} </span>
            <span style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>{t.myProfile.split(' ')[1]}</span>
          </h1>
        </div>

        <div className="mx-auto flex gap-6 justify-center" style={{ width: 'fit-content' }}>
          {/* Left Column - Avatar and Stats */}
          <div className="space-y-6" style={{ width: '300px' }}>
            {/* Avatar Card */}
            <div className="rounded-2xl" style={{ background: 'rgba(5, 46, 38, 0.4)', border: '2px solid rgba(16, 185, 129, 0.2)', padding: '2rem' }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div style={{ padding: '3px', borderRadius: '50%', background: subStyle.gradient }}>
                    <Avatar className="w-20 h-20">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback style={{ background: avatarGradient }} className="text-white text-xl">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  {/* Subscription badge */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '-4px',
                      left: '0',
                      background: subStyle.badgeGradient,
                      color: subStyle.badgeText,
                      fontSize: '8px',
                      fontWeight: '700',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                  >
                    {subStyle.label}
                  </div>
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-lg text-white mb-0.5">{name}</h3>
                  <p className="text-xs text-emerald-300/60">{email}</p>
                </div>
              </div>
            </div>

            {/* Balance Card */}
            <div className="rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1))', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2rem 2rem 2.5rem 2rem' }}>
              <div className="flex items-start justify-between mb-6">
                <span className="text-lg text-emerald-300/80" style={{ marginLeft: '-0.25rem' }}>{t.myBalance}</span>
                <Gem className="w-8 h-8" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.8))' }} />
              </div>
              <div className="font-bold" style={{ fontSize: '2.5rem', lineHeight: '1', background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
                {balance.toLocaleString()}
              </div>
            </div>

            {/* Stats Card */}
            <div className="rounded-2xl" style={{ background: 'rgba(5, 46, 38, 0.4)', border: '2px solid rgba(16, 185, 129, 0.2)', padding: '2rem 2rem 2.5rem 2rem' }}>
              <div>
                <div className="text-sm text-emerald-300/60 mb-1">{t.registrationDate}</div>
                <div className="text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  {getRegistrationDate()}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Profile Info */}
          <div style={{ width: '600px' }}>
            <div className="rounded-2xl" style={{ background: 'rgba(5, 46, 38, 0.4)', border: '2px solid rgba(16, 185, 129, 0.2)', padding: '2rem 3rem' }}>
              <div>
                <h3 className="text-xl text-white mb-4">{t.personalInformation}</h3>

                <div className="space-y-3 px-6">
                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-emerald-300/80 text-sm pl-2">{t.name}</label>
                  <div className="relative">
                    <User className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/40" style={{ left: '1.75rem' }} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pr-4 py-2 rounded-lg border text-white placeholder:text-emerald-400/30 focus:border-emerald-500 focus:outline-none transition-colors"
                      style={{ background: 'rgba(5, 46, 38, 0.5)', borderColor: 'rgba(16, 185, 129, 0.2)', paddingLeft: '3.5rem' }}
                    />
                  </div>
                </div>

                {/* Email Input */}
                <div className="space-y-2">
                  <label className="text-emerald-300/80 text-sm pl-2">{t.email}</label>
                  <div className="relative">
                    <Mail className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/40" style={{ left: '1.75rem' }} />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full pr-4 py-2 rounded-lg border text-white/60 placeholder:text-emerald-400/30 cursor-not-allowed transition-colors"
                      style={{ background: 'rgba(5, 46, 38, 0.3)', borderColor: 'rgba(16, 185, 129, 0.15)', paddingLeft: '3.5rem' }}
                    />
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>

                {/* Subscription */}
                <div>
                  <h4 className="text-base text-white mb-3">{t.subscription}</h4>
                  <div className="rounded-xl" style={{
                    background: `linear-gradient(to right, ${subStyle.borderColor}15, ${subStyle.borderColor}08)`,
                    border: `1px solid ${subStyle.borderColor}30`,
                    padding: '1.25rem 1.5rem'
                  }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{getPlanName()}</span>
                      <span className="px-3 py-1 rounded-full text-sm font-semibold" style={{
                        background: `${subStyle.borderColor}30`,
                        color: subStyle.borderColor
                      }}>
                        {getStatus()}
                      </span>
                    </div>
                    {!userSubscription?.plan_id ? (
                      <p className="text-sm text-emerald-300/60">{t.upgradeMessage}</p>
                    ) : (
                      <div className="text-sm text-emerald-300/60 space-y-1">
                        <p>
                          Next billing: {userSubscription.expires_at ? new Date(userSubscription.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                        </p>
                        {userSubscription.cancel_at && (
                          <p className="text-yellow-400/80">
                            Cancels on: {new Date(userSubscription.cancel_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Manage Subscription Button */}
                  {userSubscription?.plan_id && userSubscription?.status === 'active' && (
                    <button
                      onClick={handleManageSubscription}
                      disabled={isOpeningPortal}
                      className="w-full mt-3 py-2.5 rounded-lg font-medium transition-all duration-200 text-sm"
                      style={{
                        background: 'rgba(220, 38, 38, 0.08)',
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        color: '#dc2626',
                      }}
                      onMouseEnter={(e) => {
                        if (!isOpeningPortal) {
                          e.currentTarget.style.background = 'rgba(220, 38, 38, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.25)';
                      }}
                    >
                      {isOpeningPortal ? (
                        language === 'uk' ? 'Відкриваю...' : language === 'ru' ? 'Открываю...' : 'Opening...'
                      ) : (
                        <>
                          {language === 'uk' ? 'Керувати підпискою' : language === 'ru' ? 'Управлять подпиской' : 'Manage Subscription'}
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>

                {/* Usage Statistics */}
                <div style={{ position: 'relative' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base text-white">{t.usageStatistics}</h4>
                    <span className="text-xs text-yellow-400/80 px-2 py-1 rounded" style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                      {t.inDevelopment}
                    </span>
                  </div>
                  <div className="space-y-3" style={{ opacity: 0.4, filter: 'blur(1px)' }}>
                    <div className="py-2 border-b" style={{ borderColor: 'rgba(16, 185, 129, 0.1)' }}>
                      <div className="text-xl text-emerald-400 mb-1">127</div>
                      <div className="text-xs text-emerald-300/60">Stories created</div>
                    </div>
                    <div className="py-2 border-b" style={{ borderColor: 'rgba(16, 185, 129, 0.1)' }}>
                      <div className="text-xl text-emerald-400 mb-1">48h</div>
                      <div className="text-xs text-emerald-300/60">Voice-over hours</div>
                    </div>
                    <div className="py-2 border-b" style={{ borderColor: 'rgba(16, 185, 129, 0.1)' }}>
                      <div className="text-xl text-emerald-400 mb-1">3,428</div>
                      <div className="text-xs text-emerald-300/60">Gems spent</div>
                    </div>
                    <div className="py-2">
                      <div className="text-xl text-emerald-400 mb-1">173</div>
                      <div className="text-xs text-emerald-300/60">Generations this month</div>
                    </div>
                  </div>
                  {/* Diagonal lines overlay */}
                  <div style={{
                    position: 'absolute',
                    top: '3rem',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239, 68, 68, 0.15) 10px, rgba(239, 68, 68, 0.15) 12px)'
                  }}></div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-150"
                  style={{
                    background: isSaving ? 'rgba(16, 185, 129, 0.5)' : 'linear-gradient(135deg, #10b981, #059669)',
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSaving) e.currentTarget.style.opacity = '1';
                  }}
                  onMouseDown={(e) => {
                    if (!isSaving) e.currentTarget.style.transform = 'scale(0.98)';
                  }}
                  onMouseUp={(e) => {
                    if (!isSaving) e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {isSaving ? t.saving : t.saveChanges}
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={() => setShowCancelModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="rounded-2xl p-8 max-w-md w-full mx-4"
            style={{
              background: 'rgba(5, 46, 38, 0.95)',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                }}
              >
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white">
                {language === 'uk' ? 'Відмінити підписку?' : language === 'ru' ? 'Отменить подписку?' : 'Cancel Subscription?'}
              </h3>
            </div>

            <p className="text-emerald-300/80 mb-6">
              {language === 'uk'
                ? 'Ви впевнені, що хочете відмінити підписку? Ви втратите доступ до преміум-функцій після закінчення поточного платіжного періоду.'
                : language === 'ru'
                ? 'Вы уверены, что хотите отменить подписку? Вы потеряете доступ к премиум-функциям после окончания текущего платежного периода.'
                : 'Are you sure you want to cancel your subscription? You will lose access to premium features after the current billing period ends.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 rounded-lg font-medium text-white transition-all duration-150"
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                }}
              >
                {language === 'uk' ? 'Ні, залишити' : language === 'ru' ? 'Нет, оставить' : 'No, Keep It'}
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={isCanceling}
                className="flex-1 py-3 rounded-lg font-medium text-white transition-all duration-150"
                style={{
                  background: isCanceling ? 'rgba(239, 68, 68, 0.5)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  cursor: isCanceling ? 'not-allowed' : 'pointer',
                  opacity: isCanceling ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isCanceling) e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  if (!isCanceling) e.currentTarget.style.opacity = '1';
                }}
              >
                {isCanceling
                  ? (language === 'uk' ? 'Відміна...' : language === 'ru' ? 'Отмена...' : 'Canceling...')
                  : (language === 'uk' ? 'Так, відмінити' : language === 'ru' ? 'Да, отменить' : 'Yes, Cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <Footer />
    </div>
  );
}

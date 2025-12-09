import { useState } from 'react';
import { motion } from 'motion/react';
import { User, Settings, CreditCard, ShoppingCart, LogOut, ChevronDown, Sparkles, Shield, History, Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { getSubscriptionStyle } from '../lib/subscriptionColors';
import { getAvatarColor } from '../lib/avatarColors';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';

interface UserMenuProps {
  onLogout: () => void;
  balance: number;
  userEmail?: string;
  userName?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  subscriptionPlan?: string;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
}

export function UserMenu({ onLogout, balance, userEmail, userName, avatarUrl, isAdmin, subscriptionPlan, language = 'en', onLanguageChange }: UserMenuProps) {
  const t = translations[language];
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [historyHovered, setHistoryHovered] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);
  const subStyle = getSubscriptionStyle(subscriptionPlan);
  const avatarGradient = getAvatarColor(userName || userEmail || 'User');

  const handleLanguageChange = (newLang: Language) => {
    localStorage.setItem('appLanguage', newLang);
    onLanguageChange?.(newLang);
  };

  const handleNavigation = (page: string) => {
    setCurrentPage(page);
    // Emit event for App.tsx to handle page changes
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page } }));
  };

  const getUserInitials = () => {
    if (!userName && !userEmail) return 'U';
    const name = userName || userEmail;
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="group cursor-pointer outline-none focus:outline-none focus-visible:outline-none relative"
        >
          <div className="relative inline-block">
            <motion.div
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                borderRadius: '50%',
                padding: '2px',
                background: subStyle.gradient,
                transition: 'box-shadow 0.15s ease-out'
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.boxShadow = subStyle.glow;
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Avatar
                className="w-10 h-10 outline-none focus:outline-none focus-visible:outline-none"
              >
                <AvatarImage src={avatarUrl} />
                <AvatarFallback style={{ background: avatarGradient }} className="text-white">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            {/* Badge under avatar - positioned absolutely, outside animated element */}
            <div
              style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: subStyle.badgeGradient,
                color: subStyle.badgeText,
                fontSize: '8px',
                fontWeight: '700',
                padding: '2px 5px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}
            >
              {subStyle.label}
            </div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 bg-[#0a1a1a]/98 border-white/10 backdrop-blur-xl"
      >
        {/* User Info Header */}
        <div className="py-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', margin: '0 -0.5rem', padding: '0.75rem 1rem' }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div style={{ borderRadius: '50%', padding: '2px', background: subStyle.gradient }}>
                <Avatar className="w-12 h-12">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback style={{ background: avatarGradient }} className="text-white">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </div>
              {/* Small badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
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
            <div className="flex-1">
              <div className="text-white text-sm">{userName || 'User'}</div>
              <div className="text-gray-400 text-xs">{userEmail || 'user@example.com'}</div>
            </div>
          </div>
          <button
            onClick={() => handleNavigation('profile')}
            className="mt-2 w-full px-3 py-1.5 rounded-lg text-sm transition-all duration-150"
            style={{
              background: `linear-gradient(135deg, ${subStyle.borderColor}15, ${subStyle.borderColor}08)`,
              border: `1px solid ${subStyle.borderColor}50`,
              color: subStyle.borderColor
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(135deg, ${subStyle.borderColor}25, ${subStyle.borderColor}15)`;
              e.currentTarget.style.borderColor = `${subStyle.borderColor}80`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(135deg, ${subStyle.borderColor}15, ${subStyle.borderColor}08)`;
              e.currentTarget.style.borderColor = `${subStyle.borderColor}50`;
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.97)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {t.viewProfile}
          </button>
        </div>

        {/* Balance Display */}
        <div style={{
          backgroundColor: 'rgba(168, 85, 247, 0.15)',
          margin: '0 -0.5rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-300">{t.gemBalance}</span>
            </div>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {balance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-1">
          <DropdownMenuItem
            onClick={() => handleNavigation('subscription')}
            className="hover:bg-white/5 cursor-pointer"
          >
            <CreditCard className="w-4 h-4 mr-2 text-yellow-400" />
            <span className="text-yellow-400/60">{t.subscription}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleNavigation('credits')}
            className="hover:bg-white/5 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 mr-2 text-yellow-400" />
            <span className="text-yellow-400/60">{t.buyCredits}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleNavigation('history')}
            className="hover:bg-white/5 cursor-pointer"
            onMouseEnter={() => setHistoryHovered(true)}
            onMouseLeave={() => setHistoryHovered(false)}
          >
            <History className="w-4 h-4 mr-2" style={{ color: '#c084fc' }} />
            <span style={{
              color: historyHovered ? '#c084fc' : 'rgba(209, 213, 219, 1)',
              transition: 'color 0.2s'
            }}>{t.storyHistory}</span>
          </DropdownMenuItem>
        </div>

        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '0.5rem 0' }} />

        <div className="py-1">
          {/* Language Selector */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-2 mb-2 text-gray-300">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-sm">{t.appLanguage}</span>
            </div>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as Language)}
              className="w-full px-3 py-2 rounded-lg text-emerald-50 font-medium cursor-pointer transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(4, 47, 46, 0.6) 100%)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2352d9a3\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'calc(100% - 1rem) center',
                paddingRight: '2.5rem'
              }}
            >
              <option value="en" style={{ background: '#052e26', color: '#fff' }}>🇬🇧 English</option>
              <option value="uk" style={{ background: '#052e26', color: '#fff' }}>🇺🇦 Українська</option>
              <option value="ru" style={{ background: '#052e26', color: '#fff' }}>🇷🇺 Русский</option>
            </select>
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '0.5rem 0' }} />

        {isAdmin && (
          <div className="py-1">
            <DropdownMenuItem
              onClick={() => handleNavigation('admin')}
              className="cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15), rgba(239, 68, 68, 0.1))',
                boxShadow: '0 0 15px rgba(220, 38, 38, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(239, 68, 68, 0.2))';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(220, 38, 38, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(220, 38, 38, 0.15), rgba(239, 68, 68, 0.1))';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(220, 38, 38, 0.3)';
              }}
            >
              <Shield className="w-4 h-4 mr-2 text-red-400" />
              <span className="text-red-400">{t.adminPanel}</span>
            </DropdownMenuItem>
          </div>
        )}

        <DropdownMenuSeparator className="bg-white/10" />

        <div className="py-1">
          <DropdownMenuItem
            onClick={onLogout}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t.logout}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

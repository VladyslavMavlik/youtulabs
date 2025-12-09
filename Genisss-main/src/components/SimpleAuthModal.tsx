import { useState } from 'react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Chrome, Github, X, User } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { signInWithGoogle, signInWithGitHub, signInWithEmail, signUpWithEmail, resetPassword } from '../lib/supabase';

interface SimpleAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTab?: 'login' | 'register';
}

export function SimpleAuthModal({ open, onClose, onSuccess, initialTab = 'login' }: SimpleAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailSentMessage, setEmailSentMessage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab);
  const [isFirstOpen, setIsFirstOpen] = useState(true);

  // Update activeTab when initialTab changes
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Clear form fields when switching tabs
  React.useEffect(() => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setError(null);
    setSuccess(null);
    setEmailSentMessage(null);
  }, [activeTab]);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setIsFirstOpen(true);
    }
  }, [open]);

  // Animation handlers for buttons
  const handleButtonHover = (e: React.MouseEvent<HTMLButtonElement>, type: 'teal' | 'white' | 'black') => {
    if (loading) return;
    if (type === 'teal') {
      e.currentTarget.style.background = 'linear-gradient(to right, #0d9488, #0f766e)';
      e.currentTarget.style.boxShadow = '0 6px 15px -3px rgba(20, 184, 166, 0.4)';
    } else if (type === 'white') {
      e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 1)';
      e.currentTarget.style.boxShadow = 'inset 0 4px 12px 0 rgba(0, 0, 0, 0.35)';
    } else {
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    }
  };

  const handleButtonLeave = (e: React.MouseEvent<HTMLButtonElement>, type: 'teal' | 'white' | 'black') => {
    if (type === 'teal') {
      e.currentTarget.style.background = 'linear-gradient(to right, #14b8a6, #0d9488)';
      e.currentTarget.style.boxShadow = 'none';
    } else if (type === 'white') {
      e.currentTarget.style.borderColor = 'transparent';
      e.currentTarget.style.boxShadow = 'none';
    } else {
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }
  };

  React.useEffect(() => {
    setMounted(true);
    // Add keyframe animations to document
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes modalIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Apply blur to main content when modal is open
  React.useEffect(() => {
    if (open) {
      const root = document.getElementById('root');
      if (root) {
        root.style.filter = 'blur(1px)';
        root.style.transition = 'filter 150ms ease-out';
      }
    } else {
      const root = document.getElementById('root');
      if (root) {
        root.style.filter = 'none';
      }
    }
    return () => {
      const root = document.getElementById('root');
      if (root) {
        root.style.filter = 'none';
      }
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent, type: 'login' | 'register') => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Validate password
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    // Validate name for registration
    if (type === 'register' && name.trim().length < 2) {
      setError('Name must be at least 2 characters long');
      setLoading(false);
      return;
    }

    // Validate password confirmation for registration
    if (type === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      if (type === 'login') {
        const result = await signInWithEmail(email, password);
        if (result.error) throw result.error;
        setSuccess('Successfully logged in! Redirecting...');

        // Wait a bit before calling onSuccess to show the message
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        const result = await signUpWithEmail(email, password, name);

        // Check for errors first (including username already taken)
        if (result.error) {
          throw result.error;
        }

        // Check if email confirmation is required
        if (result.data?.user && !result.data.user.confirmed_at) {
          setEmailSentMessage('Verification email sent! Please check your inbox.');
          // Don't call onSuccess - user needs to confirm email first
          // Clear message after 4 seconds
          setTimeout(() => {
            setEmailSentMessage(null);
          }, 4000);
        } else if (result.data?.user) {
          // Email confirmation is disabled, user is logged in
          setSuccess('Account created successfully! Redirecting...');
          setTimeout(() => {
            onSuccess();
          }, 1500);
        }
      }
    } catch (err: any) {
      // Make error messages more user-friendly
      let errorMessage = err.message || 'Authentication failed';

      if (errorMessage.includes('Too many attempts')) {
        errorMessage = 'Too many validation attempts. Please wait a few minutes and try again.';
      } else if (errorMessage.includes('Invalid login credentials')) {
        errorMessage = 'Email or password is incorrect';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email first. Check your inbox!';
      } else if (errorMessage.includes('email is already registered')) {
        errorMessage = 'This email is already registered. Try logging in instead.';
      } else if (errorMessage.includes('User already registered')) {
        errorMessage = 'This email is already registered. Try logging in instead.';
      } else if (errorMessage.includes('Invalid email')) {
        errorMessage = 'Please enter a valid email address';
      } else if (errorMessage.includes('username is already taken')) {
        errorMessage = 'This username is already taken. Please choose another one.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: string) => {
    setLoading(true);
    setError(null);

    try {
      if (provider === 'google') {
        const result = await signInWithGoogle();
        if (result.error) throw result.error;
        // OAuth will redirect, don't call onSuccess here
      } else if (provider === 'github') {
        const result = await signInWithGitHub();
        if (result.error) throw result.error;
        // OAuth will redirect, don't call onSuccess here
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
    // Don't set loading to false - OAuth redirect is happening
  };

  if (!mounted || !open) {
    return null;
  }

  const modalContent = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] animate-in fade-in-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          animation: 'fadeIn 200ms ease-out',
          cursor: 'pointer'
        }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          backgroundColor: 'rgba(6, 20, 20, 0.95)',
          border: '1px solid rgba(20, 184, 166, 0.2)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '1rem',
          padding: 'clamp(1rem, 3vw, 1.5rem)',
          width: '100%',
          maxWidth: 'min(32rem, calc(100vw - 2rem))',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          animation: 'modalIn 200ms ease-out',
          boxShadow: '0 0 20px rgba(20, 184, 166, 0.15), 0 20px 40px -10px rgba(0, 0, 0, 0.7)',
          display: 'grid',
          gap: 'clamp(0.75rem, 2vw, 1rem)',
        }}
        className="custom-scrollbar"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 opacity-50 transition-opacity hover:opacity-100 focus:outline-none"
          style={{
            color: 'rgb(156, 163, 175)',
            background: 'none',
            border: 'none',
            padding: '0.25rem',
            cursor: 'pointer',
          }}
        >
          <X className="h-5 w-5" />
        </button>

        {/* DialogHeader */}
        <div className="flex flex-col space-y-2 text-center sm:text-left" style={{ paddingRight: '2rem' }}>
          <h2 className="text-white font-semibold leading-none tracking-tight" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)' }}>
            Welcome to <span style={{ color: '#6ee7b7' }}>Youtu</span><span style={{ color: '#F16B27' }}>Labs</span>
          </h2>
          <p className="text-gray-400" style={{ fontSize: 'clamp(0.8rem, 2vw, 0.875rem)' }}>
            Create incredible stories with AI
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 animate-in fade-in-0 slide-in-from-top-2">
            {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 text-sm text-teal-400 animate-in fade-in-0 slide-in-from-top-2">
            {success}
          </div>
        )}

        {/* Social buttons first */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.5rem, 1.5vw, 0.75rem)' }}>
          <button
            type="button"
            onClick={() => handleSocialAuth('google')}
            disabled={loading}
            onMouseEnter={(e) => handleButtonHover(e, 'white')}
            onMouseLeave={(e) => handleButtonLeave(e, 'white')}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#111827',
              padding: 'clamp(0.5rem, 2vw, 0.625rem) clamp(0.75rem, 3vw, 1rem)',
              borderRadius: '0.75rem',
              fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              fontWeight: '500',
              border: '1px solid transparent',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(0.25rem, 1vw, 0.5rem)',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleSocialAuth('github')}
            disabled={loading}
            onMouseEnter={(e) => handleButtonHover(e, 'black')}
            onMouseLeave={(e) => handleButtonLeave(e, 'black')}
            style={{
              width: '100%',
              backgroundColor: '#000000',
              color: 'white',
              padding: 'clamp(0.5rem, 2vw, 0.625rem) clamp(0.75rem, 3vw, 1rem)',
              borderRadius: '0.75rem',
              fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              fontWeight: '500',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(0.25rem, 1vw, 0.5rem)',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </button>
        </div>

        {/* OR divider */}
        <div className="relative" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-sm text-gray-500" style={{ backgroundColor: 'rgba(6, 20, 20, 0.95)' }}>
            or
          </span>
        </div>

        {/* Tabs - точно як з референсу, рядки 51-235 */}
        <Tabs value={activeTab} className="w-full" onValueChange={(value) => {
          setActiveTab(value as 'login' | 'register');
          setIsFirstOpen(false);
        }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              width: '100%',
              backgroundColor: 'rgba(20, 184, 166, 0.1)',
              padding: '0.25rem',
              borderRadius: '0.75rem',
              border: '1px solid rgba(20, 184, 166, 0.2)',
            }}
          >
            {/* Animated slider background */}
            <motion.div
              layout
              layoutId="tab-slider"
              animate={{
                backgroundColor: activeTab === 'login' ? 'rgba(20, 184, 166, 0.9)' : 'rgba(234, 179, 8, 0.9)',
                boxShadow: activeTab === 'login' ? '0 2px 8px rgba(20, 184, 166, 0.3)' : '0 2px 8px rgba(234, 179, 8, 0.3)'
              }}
              transition={{
                layout: {
                  type: 'spring',
                  stiffness: 350,
                  damping: 35
                },
                backgroundColor: {
                  duration: 0.2
                }
              }}
              style={{
                position: 'absolute',
                top: '0.25rem',
                left: activeTab === 'login' ? '0.25rem' : 'calc(50% + 0.25rem)',
                width: 'calc(50% - 0.5rem)',
                height: 'calc(100% - 0.5rem)',
                borderRadius: '0.5rem'
              }}
            />
            <TabsList style={{ display: 'contents' }}>
              <TabsTrigger
                value="login"
                style={{
                  flex: 1,
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: 'none',
                  transition: 'color 300ms ease',
                  position: 'relative',
                  zIndex: 1,
                  color: activeTab === 'login' ? 'white' : 'rgba(156, 163, 175, 1)',
                  background: 'transparent'
                }}
              >
                Login
              </TabsTrigger>
              <TabsTrigger
                value="register"
                style={{
                  flex: 1,
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: 'none',
                  transition: 'color 300ms ease',
                  position: 'relative',
                  zIndex: 1,
                  color: activeTab === 'register' ? 'white' : 'rgba(156, 163, 175, 1)',
                  background: 'transparent'
                }}
              >
                Sign Up
              </TabsTrigger>
            </TabsList>
          </div>

          <div style={{ position: 'relative', marginTop: 'clamp(0.5rem, 2vw, 1rem)', height: 'clamp(420px, 50vh, 480px)' }}>
            <TabsContent
              value="login"
              style={{
                display: activeTab === 'login' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '1rem',
                width: '100%',
                animation: activeTab === 'login' ? 'fadeIn 200ms ease-out' : 'none',
                height: '100%'
              }}
            >
            <form onSubmit={(e) => handleSubmit(e, 'login')} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2px' }}>
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-gray-300">
                  Email
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <Mail style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '3rem', position: 'relative', zIndex: 1 }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-gray-300">
                  Password
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '3rem', position: 'relative', zIndex: 1 }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              {/* Remember me & Forgot password row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{
                      width: '1rem',
                      height: '1rem',
                      cursor: 'pointer',
                      accentColor: '#14b8a6'
                    }}
                  />
                  <span className="text-sm text-gray-300">Remember me</span>
                </label>

                <button
                  type="button"
                  style={{
                    fontSize: '0.875rem',
                    color: '#9ca3af',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 200ms ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#d1d5db';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#9ca3af';
                  }}
                  onClick={async () => {
                    if (!email) {
                      setError('Please enter your email first');
                      return;
                    }
                    try {
                      setLoading(true);
                      const result = await resetPassword(email);
                      if (result.error) throw result.error;
                      setSuccess('Password reset email sent! Check your inbox.');
                      setTimeout(() => setSuccess(null), 4000);
                    } catch (err: any) {
                      setError(err.message || 'Failed to send reset email');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: 'linear-gradient(to right, #14b8a6, #0d9488)',
                  color: 'white',
                  padding: '0.625rem 1rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => handleButtonHover(e, 'teal')}
                onMouseLeave={(e) => handleButtonLeave(e, 'teal')}
              >
                {loading ? 'Loading...' : 'Login'}
              </button>
            </form>
          </TabsContent>

            <TabsContent
              value="register"
              style={{
                display: activeTab === 'register' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '1rem',
                width: '100%',
                animation: activeTab === 'register' ? 'fadeIn 200ms ease-out' : 'none',
                height: '100%'
              }}
            >
            <form onSubmit={(e) => handleSubmit(e, 'register')} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '2px' }}>
              <div className="space-y-2">
                <Label htmlFor="register-name" className="text-gray-300">
                  Name
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <User style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="register-name"
                    type="text"
                    placeholder="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ paddingLeft: '3rem', position: 'relative', zIndex: 1 }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email" className="text-gray-300">
                  Email
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <Mail style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '3rem', position: 'relative', zIndex: 1 }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password" className="text-gray-300">
                  Password
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      paddingLeft: '3rem',
                      position: 'relative',
                      zIndex: 1,
                      borderColor: confirmPassword.length > 0 && password !== confirmPassword ? '#ef4444' : undefined,
                      boxShadow: confirmPassword.length > 0 && password !== confirmPassword ? '0 0 0 1px #ef4444' : undefined
                    }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-confirm-password" className="text-gray-300">
                  Confirm Password
                </Label>
                <div className="relative" style={{ zIndex: 1 }}>
                  <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af', zIndex: 2 }} />
                  <Input
                    id="register-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      paddingLeft: '3rem',
                      position: 'relative',
                      zIndex: 1,
                      borderColor: confirmPassword.length > 0 && password !== confirmPassword ? '#ef4444' : undefined,
                      boxShadow: confirmPassword.length > 0 && password !== confirmPassword ? '0 0 0 1px #ef4444' : undefined
                    }}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}></div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: 'linear-gradient(to right, #eab308, #ca8a04)',
                  color: 'white',
                  padding: '0.625rem 1rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  e.currentTarget.style.background = 'linear-gradient(to right, #ca8a04, #a16207)';
                  e.currentTarget.style.boxShadow = '0 6px 15px -3px rgba(234, 179, 8, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to right, #eab308, #ca8a04)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? 'Loading...' : 'Sign Up'}
              </button>

              {/* Email sent confirmation message */}
              {emailSentMessage && (
                <div
                  className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400 animate-in fade-in-0 slide-in-from-top-2"
                  style={{
                    animation: 'fadeIn 300ms ease-out',
                  }}
                >
                  ✓ {emailSentMessage}
                </div>
              )}
            </form>
          </TabsContent>
          </div>
        </Tabs>

        <p className="text-xs text-center mt-4" style={{ color: '#6b7280', opacity: 0.7 }}>
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

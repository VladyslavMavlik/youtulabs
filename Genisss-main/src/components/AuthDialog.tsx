import { useState } from 'react';
import * as React from 'react';
import { Mail, Lock, Chrome, Apple } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/supabase';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log('🟠 AuthDialog render, open:', open);


  const handleSubmit = async (e: React.FormEvent, type: 'login' | 'register') => {
    e.preventDefault();
    console.log('🔵 Form submitted, type:', type, 'email:', email);
    setLoading(true);
    setError(null);

    try {
      console.log('🔵 Attempting authentication...');
      if (type === 'login') {
        const result = await signInWithEmail(email, password);
        console.log('🔵 Login result:', result);
        if (result.error) throw result.error;
      } else {
        const result = await signUpWithEmail(email, password);
        console.log('🔵 Signup result:', result);
        if (result.error) throw result.error;
      }
      console.log('🔵 Auth success, calling onSuccess');
      onSuccess();
    } catch (err: any) {
      console.error('🔴 Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: string) => {
    console.log('🔵 Social auth clicked, provider:', provider);
    setLoading(true);
    setError(null);

    try {
      if (provider === 'google') {
        console.log('🔵 Calling signInWithGoogle...');
        const result = await signInWithGoogle();
        console.log('🔵 Google auth result:', result);
        if (result.error) throw result.error;
        console.log('🔵 Google auth success, calling onSuccess');
        onSuccess();
      }
    } catch (err: any) {
      console.error('🔴 Social auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0a1a1a]/98 border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center text-white">
            Welcome to <span style={{ color: '#6ee7b7' }}>Youtu</span><span style={{ color: '#F16B27' }}>Labs</span>
          </DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            Create incredible stories with AI
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger
              value="login"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-teal-400"
            >
              Login
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-teal-400"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 mt-4">
            <form onSubmit={(e) => handleSubmit(e, 'login')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-gray-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-gray-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <button type="button" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
                Forgot password?
              </button>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
              >
                {loading ? 'Loading...' : 'Login'}
              </Button>
            </form>

            <div className="relative">
              <Separator className="bg-white/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a1a1a] px-2 text-sm text-gray-500">
                or
              </span>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                onClick={() => handleSocialAuth('google')}
                variant="outline"
                className="w-full bg-white hover:bg-gray-100 text-gray-900 border-0"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Continue with Google
              </Button>
              <Button
                type="button"
                onClick={() => handleSocialAuth('apple')}
                variant="outline"
                className="w-full bg-black hover:bg-gray-900 text-white border border-white/10"
              >
                <Apple className="w-4 h-4 mr-2" />
                Continue with Apple
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            <form onSubmit={(e) => handleSubmit(e, 'register')} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-name" className="text-gray-300">
                  Name
                </Label>
                <Input
                  id="register-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email" className="text-gray-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password" className="text-gray-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
              >
                Sign Up
              </Button>
            </form>

            <div className="relative">
              <Separator className="bg-white/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a1a1a] px-2 text-sm text-gray-500">
                or
              </span>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                onClick={() => handleSocialAuth('google')}
                variant="outline"
                className="w-full bg-white hover:bg-gray-100 text-gray-900 border-0"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Sign up with Google
              </Button>
              <Button
                type="button"
                onClick={() => handleSocialAuth('apple')}
                variant="outline"
                className="w-full bg-black hover:bg-gray-900 text-white border border-white/10"
              >
                <Apple className="w-4 h-4 mr-2" />
                Sign up with Apple
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-center text-gray-500 mt-4">
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);

      // Redirect to home after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black flex items-center justify-center p-4" style={{ scrollbarGutter: 'stable' }}>
        <div className="max-w-md w-full bg-[#0a1a1a]/98 border border-emerald-500/30 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl text-white font-semibold mb-2">Password Reset Successful!</h2>
          <p className="text-gray-400">Redirecting to home page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black flex items-center justify-center p-4" style={{ scrollbarGutter: 'stable' }}>
      <div className="max-w-md w-full bg-[#0a1a1a]/98 border border-emerald-500/30 rounded-xl p-8">
        <h2 className="text-2xl text-white font-semibold mb-2 text-center">Reset Your Password</h2>
        <p className="text-gray-400 text-center mb-6">Enter your new password below</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">
              New Password
            </Label>
            <div className="relative">
              <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af' }} />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  paddingLeft: '3rem',
                  borderColor: confirmPassword.length > 0 && password !== confirmPassword ? '#ef4444' : undefined,
                  boxShadow: confirmPassword.length > 0 && password !== confirmPassword ? '0 0 0 1px #ef4444' : undefined
                }}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-teal-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-gray-300">
              Confirm New Password
            </Label>
            <div className="relative">
              <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: '#9ca3af' }} />
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  paddingLeft: '3rem',
                  borderColor: confirmPassword.length > 0 && password !== confirmPassword ? '#ef4444' : undefined,
                  boxShadow: confirmPassword.length > 0 && password !== confirmPassword ? '0 0 0 1px #ef4444' : undefined
                }}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-teal-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'linear-gradient(to right, #14b8a6, #0d9488)',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Users, Gem, Shield, Search, X, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { subscriptionPlans } from '../lib/pricing';
import type { User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Header } from './Header';
import { MouseFollowBackground } from './MouseFollowBackground';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';
import {
  getAllUsersWithDetails,
  changeUserSubscriptionPlan,
  cancelUserSubscription,
  grantUserCredits,
  deductUserCredits,
  getUserCredits,
  setUserBalance
} from '../lib/adminApi';

interface AdminPanelProps {
  onBack: () => void;
  user: User | null;
  language?: Language;
  balance?: number;
}

interface UserWithSubscription {
  user_id: string;
  email: string;
  user_name: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  crystal_balance: number;
  paddle_subscription_id: string | null;
}

interface CreditDetail {
  credit_id: string;
  amount: number;
  consumed: number;
  remaining: number;
  source: string;
  granted_at: string;
  expires_at: string;
  is_expired: boolean;
}

export function AdminPanel({ onBack, user, language = 'en', balance }: AdminPanelProps) {
  const t = translations[language];
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithSubscription | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [creditReason, setCreditReason] = useState<string>('');
  const [actionType, setActionType] = useState<'change_plan' | 'add_credits' | 'deduct_credits' | 'set_balance'>('change_plan');
  const [modalPosition, setModalPosition] = useState<{ top: number; left: number } | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsDetails, setCreditsDetails] = useState<CreditDetail[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await getAllUsersWithDetails();
    if (!error && data) {
      setUsers(data);
    } else {
      toast.error('Failed to load users');
    }
    setLoading(false);
  };

  const loadUserCredits = async (userId: string) => {
    setLoadingCredits(true);
    const { data, error } = await getUserCredits(userId);
    if (!error && data) {
      setCreditsDetails(data.credits || []);
    } else {
      toast.error('Failed to load credits details');
    }
    setLoadingCredits(false);
  };

  const handleAction = async () => {
    if (!selectedUser) return;

    setUpdating(true);

    try {
      if (actionType === 'change_plan') {
        if (!selectedPlan) {
          toast.error('Please select a plan');
          setUpdating(false);
          return;
        }

        if (selectedPlan === 'none') {
          // Видалення підписки (forceRemove = true для видалення з БД без виклику Paddle)
          const result = await cancelUserSubscription(
            selectedUser.user_id,
            'next_billing_period',
            'Admin removed subscription',
            true // forceRemove = true
          );

          if (result.success) {
            toast.success('Subscription removed successfully');
          } else {
            toast.error(result.error || 'Failed to remove subscription');
          }
        } else {
          // Зміна плану через Paddle API
          const result = await changeUserSubscriptionPlan(
            selectedUser.user_id,
            selectedPlan as 'starter' | 'pro' | 'ultimate',
            'immediately'
          );

          if (result.success) {
            toast.success(`Subscription changed to ${selectedPlan.toUpperCase()}`);
          } else {
            toast.error(result.error || 'Failed to change plan');
          }
        }
      } else if (actionType === 'add_credits') {
        const amount = parseInt(creditAmount);
        if (isNaN(amount) || amount <= 0) {
          toast.error('Please enter a valid amount');
          setUpdating(false);
          return;
        }

        const result = await grantUserCredits(
          selectedUser.user_id,
          amount,
          creditReason || 'Admin grant',
          30
        );

        if (result.success) {
          toast.success(`Granted ${amount} credits`);
        } else {
          toast.error(result.error || 'Failed to grant credits');
        }
      } else if (actionType === 'deduct_credits') {
        const amount = parseInt(creditAmount);
        if (isNaN(amount) || amount <= 0) {
          toast.error('Please enter a valid amount');
          setUpdating(false);
          return;
        }

        const result = await deductUserCredits(
          selectedUser.user_id,
          amount,
          creditReason || 'Admin deduction'
        );

        if (result.success) {
          toast.success(`Deducted ${amount} credits`);
        } else {
          toast.error(result.error || 'Failed to deduct credits');
        }
      } else if (actionType === 'set_balance') {
        const balance = parseInt(creditAmount);
        if (isNaN(balance)) {
          toast.error('Please enter a valid balance');
          setUpdating(false);
          return;
        }

        const result = await setUserBalance(
          selectedUser.user_id,
          balance,
          creditReason || 'Manual balance adjustment'
        );

        if (result.success) {
          toast.success(`Balance set to ${balance} credits`);
        } else {
          toast.error(result.error || 'Failed to set balance');
        }
      }

      // Reload users після успішної операції
      await loadUsers();
      setShowManageModal(false);
      setSelectedUser(null);
      setSelectedPlan('');
      setCreditAmount('');
      setCreditReason('');
    } catch (error: any) {
      toast.error(error.message || 'Operation failed');
    } finally {
      setUpdating(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col overflow-y-scroll" style={{ minHeight: '200vh', scrollbarGutter: 'stable' }}>
      <MouseFollowBackground />

      <Header
        user={user}
        language={language}
        onLanguageChange={() => {}}
        balance={balance}
      />

      <div className="h-20 flex-shrink-0"></div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto px-8 py-8 pb-96 relative z-10 max-w-7xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={onBack}
              className="text-emerald-100 hover:text-emerald-50"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {t.back}
            </Button>
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-purple-400" />
              <h1 className="text-3xl font-bold text-emerald-100">{t.adminPanel}</h1>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div style={{ position: 'relative', maxWidth: '28rem' }}>
            <Search
              className="text-emerald-400"
              style={{
                position: 'absolute',
                left: '1.25rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '1.25rem',
                height: '1.25rem',
                zIndex: 10
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchUsers}
              style={{
                width: '100%',
                paddingLeft: '3.5rem',
                paddingRight: '4rem',
                paddingTop: '1rem',
                paddingBottom: '1rem',
                borderRadius: '0.5rem',
                backgroundColor: 'rgba(6, 78, 59, 0.4)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                color: '#d1fae5',
                outline: 'none'
              }}
              className="placeholder:text-emerald-400/40 focus:ring-2 focus:ring-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '1.25rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X className="w-5 h-5 text-emerald-400 hover:text-emerald-300" />
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-xl bg-emerald-950/40 border border-emerald-600/30"
          >
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6 text-emerald-400" />
              <h3 className="text-lg font-semibold text-emerald-100">{t.totalUsers}</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-50 mt-4">{users.length}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-xl bg-emerald-950/40 border border-emerald-600/30"
          >
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-semibold text-emerald-100">{t.activeSubscriptions}</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-50 mt-4">
              {users.filter(u => u.status === 'active').length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-xl bg-emerald-950/40 border border-emerald-600/30"
          >
            <div className="flex items-center gap-3 mb-2">
              <Gem className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-semibold text-emerald-100">{t.totalCrystals}</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-50 mt-4">
              {users.reduce((sum, u) => sum + (u.crystal_balance || 0), 0).toLocaleString()}
            </p>
          </motion.div>
        </div>

        {/* Users Table */}
        <div className="bg-emerald-950/40 border border-emerald-600/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-emerald-950/90">
                <tr className="border-b border-emerald-600/30">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-emerald-100">
                    {t.email}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-emerald-100">
                    {t.name}
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-emerald-100">
                    {t.plan}
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-emerald-100">
                    {t.status}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-emerald-100">
                    {t.crystals}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-emerald-100">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-emerald-400">
                      {t.loadingUsers}
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-emerald-400">
                      {t.noUsersFound}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.user_id} className="border-b border-emerald-600/20 hover:bg-emerald-900/20">
                      <td className="px-6 py-4 text-sm text-emerald-100">{u.email}</td>
                      <td className="px-6 py-4 text-sm text-emerald-100">{u.user_name || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            u.plan_id === 'ultimate' ? 'bg-purple-500/20 text-purple-300' :
                            u.plan_id === 'pro' ? 'bg-blue-500/20 text-blue-300' :
                            u.plan_id === 'starter' ? 'bg-green-500/20 text-green-300' :
                            'bg-gray-500/20 text-gray-300'
                          }`}>
                            {u.plan_id || 'None'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            u.status === 'active' ? 'bg-green-500/20 text-green-300' :
                            'bg-red-500/20 text-red-300'
                          }`}>
                            {u.status || 'None'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Gem className="w-4 h-4 text-purple-400" />
                          <span className="text-sm text-emerald-100">{u.crystal_balance?.toLocaleString() || 0}</span>
                          <button
                            onClick={async () => {
                              await loadUserCredits(u.user_id);
                              setSelectedUser(u);
                              setShowCreditsModal(true);
                            }}
                            className="ml-2 text-emerald-400 hover:text-emerald-300"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 relative">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setModalPosition({
                              top: rect.bottom + window.scrollY + 8,
                              left: rect.left + window.scrollX - 200
                            });
                            setSelectedUser(u);
                            setSelectedPlan(u.plan_id || '');
                            setShowManageModal(true);
                          }}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white text-sm font-medium transition-all shadow-md"
                        >
                          {t.manage}
                        </motion.button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* Manage Modal */}
      {showManageModal && selectedUser && modalPosition && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setShowManageModal(false);
              setSelectedUser(null);
              setModalPosition(null);
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'absolute',
              top: `${modalPosition.top}px`,
              left: `${modalPosition.left}px`,
              zIndex: 50,
              background: 'linear-gradient(to bottom right, #065f46, #064e3b)',
            }}
            className="border-2 border-emerald-500/40 rounded-2xl p-8 w-96 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-emerald-100">{t.manageSubscription}</h2>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setSelectedUser(null);
                  setModalPosition(null);
                }}
                className="text-emerald-400 hover:text-emerald-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-emerald-300 mb-1">{t.user}</p>
              <p className="text-emerald-100 font-medium">{selectedUser.email}</p>
              <p className="text-sm text-emerald-400 mt-1">Balance: {selectedUser.crystal_balance?.toLocaleString() || 0} crystals</p>
            </div>

            {/* Action Type Selector */}
            <div className="mb-4">
              <label className="text-sm text-emerald-300 mb-2 block">Action</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setActionType('change_plan')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    actionType === 'change_plan'
                      ? 'bg-purple-600 text-white'
                      : 'bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/30'
                  }`}
                >
                  Change Plan
                </button>
                <button
                  onClick={() => setActionType('add_credits')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    actionType === 'add_credits'
                      ? 'bg-purple-600 text-white'
                      : 'bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/30'
                  }`}
                >
                  Add Credits
                </button>
                <button
                  onClick={() => setActionType('deduct_credits')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    actionType === 'deduct_credits'
                      ? 'bg-purple-600 text-white'
                      : 'bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/30'
                  }`}
                >
                  Deduct Credits
                </button>
                <button
                  onClick={() => setActionType('set_balance')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    actionType === 'set_balance'
                      ? 'bg-purple-600 text-white'
                      : 'bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/30'
                  }`}
                >
                  Set Balance
                </button>
              </div>
            </div>

            {actionType === 'change_plan' && (
              <div className="mb-4">
                <label className="text-sm text-emerald-300 mb-2 block">Subscription Plan</label>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent className="bg-emerald-950/95 backdrop-blur-xl border border-emerald-600/30">
                    <SelectItem
                      value="none"
                      className="text-emerald-100/70 focus:text-emerald-50 focus:bg-emerald-900/30"
                    >
                      Cancel Subscription
                    </SelectItem>
                    {subscriptionPlans.map((plan) => (
                      <SelectItem
                        key={plan.id}
                        value={plan.id}
                        className="text-emerald-100/70 focus:text-emerald-50 focus:bg-emerald-900/30"
                      >
                        {plan.name} - ${plan.price}/month ({plan.crystals.toLocaleString()} credits)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-emerald-400/60 mt-2">
                  Changes via Paddle API (real billing change)
                </p>
              </div>
            )}

            {(actionType === 'add_credits' || actionType === 'deduct_credits' || actionType === 'set_balance') && (
              <>
                <div className="mb-4">
                  <label className="text-sm text-emerald-300 mb-2 block">
                    {actionType === 'set_balance' ? 'New Balance' : 'Amount'}
                  </label>
                  <input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder={actionType === 'set_balance' ? 'Enter new balance' : actionType === 'deduct_credits' ? 'Enter amount to deduct' : 'Enter amount to add'}
                    className="w-full px-3 py-2 bg-emerald-950/30 border border-emerald-600/30 rounded-lg text-emerald-100 placeholder:text-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  {actionType === 'set_balance' && (
                    <p className="text-xs text-emerald-400/60 mt-2">
                      This will set the exact balance (can be negative)
                    </p>
                  )}
                </div>
                <div className="mb-4">
                  <label className="text-sm text-emerald-300 mb-2 block">Reason</label>
                  <input
                    type="text"
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    placeholder="Optional reason"
                    className="w-full px-3 py-2 bg-emerald-950/30 border border-emerald-600/30 rounded-lg text-emerald-100 placeholder:text-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  {actionType === 'add_credits' && (
                    <p className="text-xs text-emerald-400/60 mt-2">
                      Credits expire in 30 days
                    </p>
                  )}
                  {actionType === 'deduct_credits' && (
                    <p className="text-xs text-emerald-400/60 mt-2">
                      Deducts credits using FIFO (oldest first)
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowManageModal(false);
                  setSelectedUser(null);
                }}
                variant="outline"
                className="flex-1 border-emerald-600/30 text-emerald-300 hover:bg-emerald-900/20"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={handleAction}
                disabled={updating}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {updating ? 'Processing...' : t.saveChanges}
              </Button>
            </div>
          </motion.div>
        </>
      )}

      {/* Credits Details Modal */}
      <AnimatePresence>
        {showCreditsModal && selectedUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowCreditsModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-8"
            >
              <div
                className="bg-gradient-to-br from-emerald-900 to-emerald-950 border-2 border-emerald-500/40 rounded-2xl p-8 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-emerald-100">Credits Details</h2>
                    <p className="text-sm text-emerald-400 mt-1">{selectedUser.email}</p>
                  </div>
                  <button
                    onClick={() => setShowCreditsModal(false)}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {loadingCredits ? (
                  <div className="text-center py-8 text-emerald-400">Loading credits...</div>
                ) : creditsDetails.length === 0 ? (
                  <div className="text-center py-8 text-emerald-400">No credits found</div>
                ) : (
                  <div className="space-y-3">
                    {creditsDetails.map((credit) => (
                      <div
                        key={credit.credit_id}
                        className={`p-4 rounded-lg border ${
                          credit.is_expired
                            ? 'bg-red-950/20 border-red-500/30'
                            : credit.remaining === 0
                            ? 'bg-gray-950/20 border-gray-500/30'
                            : 'bg-emerald-950/20 border-emerald-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              credit.source === 'subscription' ? 'bg-purple-500/20 text-purple-300' :
                              credit.source === 'purchase' ? 'bg-blue-500/20 text-blue-300' :
                              'bg-green-500/20 text-green-300'
                            }`}>
                              {credit.source}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-emerald-100">
                              {credit.remaining.toLocaleString()} / {credit.amount.toLocaleString()}
                            </div>
                            <div className="text-xs text-emerald-400">remaining</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-emerald-400">Granted:</span>
                            <span className="text-emerald-100 ml-2">
                              {new Date(credit.granted_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-emerald-400">Expires:</span>
                            <span className={`ml-2 ${credit.is_expired ? 'text-red-300' : 'text-emerald-100'}`}>
                              {new Date(credit.expires_at).toLocaleDateString()}
                              {credit.is_expired && ' (Expired)'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

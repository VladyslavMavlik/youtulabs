# YouTuLabs v1.2.14 - Stable Release

**Created:** December 8, 2025
**Base:** v1.2.13 (production-ready copy)

## 🎯 Main Features

### ✅ Crypto Payments (NOWPayments)
- Full integration with NOWPayments API
- Webhook handling with HMAC SHA512 verification
- Automatic credit allocation based on payment status
- Support for multiple cryptocurrencies (BTC, ETH, USDT, etc.)
- Idempotent processing (duplicate webhook protection)

### ✅ Unified Balance System
- Single source of truth: `user_credits` table
- Fast cache layer: `kv_store_7f10f791`
- FIFO credit consumption (oldest expires first)
- Automatic synchronization between systems

### ✅ Admin Panel
- Manual credit management (grant/deduct/set balance)
- Subscription management
- Real-time balance updates
- Full audit trail in `balance_transactions`

## 📊 Database Architecture

### Core Tables
1. **user_credits** - All user credits (crypto, card, bonus, subscription)
2. **crypto_payments** - Payment records
3. **crypto_webhooks** - Webhook audit trail
4. **user_subscriptions** - Active subscriptions
5. **kv_store_7f10f791** - Balance cache
6. **balance_transactions** - Transaction history

### Key Functions
- `process_nowpayments_webhook` - Webhook processing with credit allocation
- `process_crypto_subscription_payment` - Credit allocation and sync
- `consume_credits_fifo` - FIFO-based credit deduction (optimized)
- `admin_grant_credits` - Admin credit grants
- `admin_deduct_credits` - Admin credit deductions
- `admin_set_balance` - Set exact balance

## 🔧 Applied Migrations

### Critical Migrations
- **043** - Sync user_balances with crypto payments
- **044** - Fix user_subscriptions columns
- **045** - Fix admin functions for new system
- **046** - Optimize consume_credits_fifo (CTE + batch UPDATE)
- **047** - Sync kv_store with user_credits
- **048** - Remove problematic trigger
- **049** - Sync kv_store in Paddle functions (future use)
- **050** - Fix webhook credit processing (status-based)

## 🚀 How to Run

### Backend
```bash
cd /Volumes/T7\ 1/YouTulabs_V/v1.2.14
npm run dev        # Development with auto-reload
npm start          # Production
```

### Worker
```bash
npm run worker:dev # Development
npm run worker     # Production
```

### Frontend
```bash
cd Genisss-main
npm run dev        # Development
npm run build      # Production build
```

## 🔐 Environment Variables

All configured in `.env`:
- ✅ ANTHROPIC_API_KEY
- ✅ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
- ✅ NOWPAYMENTS_API_KEY / NOWPAYMENTS_IPN_SECRET
- ✅ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
- ✅ VOICE_API_KEY
- ✅ REDIS_URL

## 📝 Payment Flow

### Crypto Payment
1. User creates payment → `POST /api/crypto/create-payment`
2. Backend creates record in `crypto_payments` (status: `waiting`)
3. Backend calls NOWPayments API
4. User sends crypto to generated address
5. NOWPayments confirms → sends webhook
6. Webhook verified (HMAC) → `process_nowpayments_webhook`
7. Status checked:
   - `finished` → Credits granted ✅
   - `failed/expired` → No credits ❌
   - `waiting/confirming` → Wait ⏳
8. Credits added to `user_credits`
9. Balance synced to `kv_store`
10. User sees updated balance

## 🎨 Frontend Changes

### Admin Panel (`src/components/AdminPanel.tsx`)
- ✅ Grant credits
- ✅ Deduct credits
- ✅ Set exact balance
- ✅ Change subscription plan
- ✅ Cancel subscription

### Payment Pages
- Crypto payment flow with real-time status
- QR code display for payment address
- Automatic balance refresh on success

## 🐛 Known Issues

None critical. All main features tested and working.

## 📦 Dependencies

### Backend
- express
- @supabase/supabase-js
- bull (Redis queue)
- @anthropic-ai/sdk
- @aws-sdk/client-s3

### Frontend
- react + vite
- @supabase/supabase-js
- lucide-react (icons)
- react-hot-toast (notifications)

## 🔄 Differences from v1.2.13

This is a **stable copy** of v1.2.13 with all latest changes:
- All migrations applied
- All fixes included
- Optimized FIFO consumption
- Working webhook processing
- Admin panel fully functional

## 📞 Support

For issues or questions, check:
1. Backend logs: `/tmp/backend.log`
2. Migration files: `Genisss-main/supabase-migrations/`
3. Admin functions: Check Supabase Dashboard → Database → Functions

---

**Version:** 1.2.14
**Status:** ✅ Production Ready
**Last Updated:** December 8, 2025

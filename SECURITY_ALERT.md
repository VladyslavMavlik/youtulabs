# 🔴 CRITICAL SECURITY ALERT

## API Keys Exposed in Git Repository

**Status:** IMMEDIATE ACTION REQUIRED

### What Happened
The following sensitive credentials were accidentally committed to the git repository:
- Anthropic API Key
- Supabase Service Role Key
- Supabase Anon Key

### Immediate Actions Required

#### 1. Rotate Anthropic API Key
1. Go to https://console.anthropic.com/settings/keys
2. Delete the old key: `sk-ant-api03-7l5nByA6Cpk25i5clJnxx48...`
3. Create a new key
4. Update `.env` file with the new key
5. **DO NOT** commit the new key to git

#### 2. Rotate Supabase Keys
1. Go to Supabase Dashboard → Settings → API
2. Click "Reset service_role key" (⚠️ This will break existing backend services temporarily)
3. Update `.env` file with new keys:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_ANON_KEY` (if changed)

#### 3. Remove Keys from Git History (OPTIONAL but RECOMMENDED)
```bash
# Install BFG Repo-Cleaner
brew install bfg

# Remove .env from history
bfg --delete-files .env

# Force push (WARNING: This rewrites history)
git push --force
```

**Alternative:** Create a new repository and migrate code without .env file.

### Prevention Measures

#### Already Implemented
✅ `.env` is in `.gitignore`
✅ `.env.example` template created

#### Setup Instructions for New Developers
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in real credentials (obtain from team lead)

3. **NEVER** commit `.env` file

### Monitoring
- Check Anthropic usage dashboard for unusual activity
- Check Supabase logs for unauthorized access
- Set up billing alerts on both platforms

### Questions?
Contact: [Your Security Team]

---
**Created:** 2025-11-23
**Priority:** CRITICAL

---
name: security-audit
description: Run a comprehensive security audit on the NetGains AI codebase
---

# Security Audit

Run a comprehensive security audit on the NetGains AI codebase. This is a critical operation — do not skip or simplify any checks.

## Checklist

### 1. Authentication & Authorization

- Verify every API route in `src/app/api/` checks the user's auth token via `supabase.auth.getUser()` before processing
- Ensure no API route trusts client-side data without server-side verification
- Check that the admin bypass (`is_admin`) cannot be self-assigned by users
- Verify session tokens are properly validated and expired tokens are rejected

### 2. Row Level Security (RLS)

- List every Supabase table and confirm RLS is enabled on each
- Verify policies prevent users from reading/writing other users' data
- Confirm sensitive columns (`is_admin`, `consent_ai_data`) cannot be updated by users directly
- Check that no table is accidentally exposed without RLS

### 3. Rate Limiting

- Verify `/api/chat` has rate limiting (max 20 requests/min per user, 60/min per IP)
- Check that rate limit responses return 429 status codes
- Verify rate limiting cannot be bypassed by switching user agents or headers

### 4. Input Validation

- Confirm chat messages are capped at 2000 characters at the API level
- Check for any SQL injection vectors in Supabase queries
- Verify file uploads (if any) are validated for type and size
- Ensure user inputs are sanitized before being passed to Claude API

### 5. API Cost Protection

- Verify message caps are enforced SERVER-SIDE (not just client-side)
- Confirm the message count increments before the API call, not after
- Check that the smart routing (Haiku/Sonnet) cannot be bypassed
- Verify admin bypass only works for explicitly whitelisted users

### 6. Secrets & Keys

- Confirm Supabase service role key is NEVER in any `NEXT_PUBLIC_` variable
- Confirm no API keys are hardcoded in client-side code
- Check `.env.local` is in `.gitignore`
- Verify no secrets are committed in git history: `git log --all -p | grep -i "service_role\|secret\|password" | head -20`

### 7. Third-Party Integrations

- Verify RevenueCat webhook checks Bearer token authentication on every request
- Verify Pinecone queries always filter by authenticated `user_id`
- Confirm Anthropic API key is only used server-side
- Check that webhook endpoints reject unsigned/unauthorized requests

### 8. Data Isolation

- Verify Pinecone memory retrieval only returns vectors belonging to the authenticated user
- Check that workout, nutrition, and chat data queries always include `user_id` filter
- Confirm the account deletion endpoint deletes ALL user data (no orphaned records)

### 9. Account Security

- Check if email verification is required on signup
- Verify password requirements (minimum length, complexity)
- Check for brute force protection on login attempts
- Verify account deletion is irreversible and complete

## Output Format

For each section, report:

- ✅ **PASS** — what was checked and confirmed secure
- ⚠️ **WARNING** — potential issue that should be monitored
- 🚨 **CRITICAL** — must fix before going live

End with a summary of all critical and warning items with recommended fixes.

## After Audit

If critical issues are found:

1. Fix all CRITICAL items immediately
2. Re-run affected checks to verify fixes
3. Commit with message: `security: [description of fixes]`
4. Push to main

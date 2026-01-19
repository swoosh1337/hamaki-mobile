# Comprehensive Codebase Audit - Prioritized Fix Plan

## Audit Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 6 | Security vulnerabilities, data integrity risks |
| 🟠 High | 8 | Important bugs, performance issues |
| 🟡 Medium | 12 | Code quality, minor issues |

**Full audit report:** `documentation/CODEBASE_AUDIT_2026-01-17.md`

---

## Recommended Implementation Order

### Phase 1: Critical Security Fixes (This Week)

#### 1. Fix RLS on Users Table
**File:** New migration `supabase/migrations/20260117120000_fix_users_rls.sql`

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own data
CREATE POLICY "Users can read own data"
    ON public.users FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE TO authenticated
    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Service role full access (for Edge Functions & leaderboard)
CREATE POLICY "Service role full access"
    ON public.users FOR ALL TO service_role
    USING (true) WITH CHECK (true);
```

**Note:** Leaderboard fetches user info via Edge Function (service role) to display names/avatars.

#### 2. Prevent Video Like Double-Award
**Files:**
- New migration `supabase/migrations/20260117130000_video_like_tracking.sql`
- Modify `supabase/functions/verify-video-likes/index.ts`

```sql
-- Migration
CREATE TABLE user_video_like_awards (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, video_id)
);
ALTER TABLE user_video_like_awards ENABLE ROW LEVEL SECURITY;
```

#### 3. Prevent Subscription Double-Award
**Files:**
- New migration `supabase/migrations/20260117140000_subscription_tracking.sql`
- Modify `supabase/functions/verify-subscriptions/index.ts`

---

### Phase 2: High Priority Fixes (Next Sprint)

#### 4. Add Per-User Rate Limiting
**File:** `supabase/functions/award-xp/index.ts`

Add check before awarding XP:
```typescript
const MAX_REQUESTS_PER_MINUTE = 10;
const { count } = await supabase
    .from('edge_idempotency_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', 'award-xp')
    .gte('created_at', new Date(Date.now() - 60000).toISOString());

if ((count || 0) >= MAX_REQUESTS_PER_MINUTE) {
    return { error: 'Rate limit exceeded', status: 429 };
}
```

#### 5. Fix Rank Tie-Breaking
**File:** New migration `supabase/migrations/20260117150000_rank_tiebreaker.sql`

Update rank queries to use: `ORDER BY total_xp DESC, created_at ASC, id ASC`

#### 6. Fix N+1 Leaderboard Query
**File:** `services/supabase/leaderboardService.ts`

Use joined query instead of separate user fetches.

---

### Phase 3: Medium Priority (Backlog)

- Standardize error response formats across Edge Functions
- Add cron job monitoring/alerting
- Improve game asset loading with retry
- Add integration tests for Edge Functions

---

## Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| `supabase/migrations/20260117120000_fix_users_rls.sql` | Create | Critical |
| `supabase/migrations/20260117130000_video_like_tracking.sql` | Create | Critical |
| `supabase/migrations/20260117140000_subscription_tracking.sql` | Create | Critical |
| `supabase/functions/verify-video-likes/index.ts` | Modify | Critical |
| `supabase/functions/verify-subscriptions/index.ts` | Modify | Critical |
| `supabase/functions/award-xp/index.ts` | Modify | High |
| `supabase/migrations/20260117150000_rank_tiebreaker.sql` | Create | High |
| `services/supabase/leaderboardService.ts` | Modify | High |

---

## Verification

After implementing fixes:

1. **RLS Test:** Try to query other users' data from client - should fail
2. **Video Like Test:** Like video → get XP → unlike → relike → should NOT get XP again
3. **Subscription Test:** Subscribe → get XP → unsubscribe → resubscribe → should NOT get XP again
4. **Rate Limit Test:** Send 15 rapid XP requests → 11th+ should fail with 429
5. **Rank Test:** Two users with same XP should have deterministic, stable ranks

---

## User Decisions

1. **Video/Subscription XP:** One-time-ever award - track permanently, users cannot re-earn
2. **Leaderboard User Data:** Show names/avatars - use service role for leaderboard queries
3. **Score Validation:** Skip for now - current per-request limits are sufficient

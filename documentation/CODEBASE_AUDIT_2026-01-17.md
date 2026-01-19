# Comprehensive Codebase Audit Report
**Date:** 2026-01-17
**Scope:** Full feature audit - correctness, security, scalability, architecture

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 6 | Requires immediate attention |
| 🟠 High | 8 | Should fix before next release |
| 🟡 Medium | 12 | Plan for upcoming sprints |
| 🟢 Low | 7 | Nice to have improvements |

**Overall Architecture Score: 7.5/10** - Well-structured with good patterns, but has security gaps and some race conditions.

---

## 🔴 CRITICAL ISSUES

### 1. RLS Policy Bypass in Users Table
**Location:** `supabase/migrations/` - users table
**Issue:** Missing RLS policy on `users` table allows any authenticated user to read all user data.

**Impact:** Data privacy violation - users can enumerate all users, emails, and profile data.

**Fix:**
```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only read own data"
    ON public.users FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
```

---

### 2. Missing Server-Side Score Validation in Games
**Location:** `supabase/functions/award-xp/index.ts`
**Issue:** Game scores are submitted client-side without server validation. A user could submit arbitrary scores.

**Current Flow:**
```
Client plays game → Client calculates score → Client sends score to award-xp → XP awarded
```

**Attack Vector:** User could modify client code or intercept network requests to submit fake high scores.

**Fix Options:**
1. **Session-based validation**: Track game session start time server-side, validate score against max possible score for elapsed time
2. **Replay validation**: Send game inputs/events to server, replay and verify score
3. **Rate limiting per game session**: Already partially implemented with idempotency keys

**Recommended Immediate Mitigation:**
```typescript
// In award-xp/index.ts - add sanity checks
const MAX_SCORE_PER_SECOND: Record<string, number> = {
    'hammock-jump': 100,  // Max ~100 points/second theoretically
    'no-pogodi': 50,      // Max ~50 points/second theoretically
};

// Validate score against game session duration (if tracked)
```

---

### 3. Race Condition in XP Updates
**Location:** `supabase/functions/award-xp/index.ts`, `services/supabase/leaderboardService.ts`
**Issue:** Concurrent XP awards can cause lost updates due to read-modify-write pattern.

**Scenario:**
```
T1: Read total_xp = 100
T2: Read total_xp = 100
T1: Write total_xp = 150 (+50 game XP)
T2: Write total_xp = 200 (+100 subscription XP)
Result: total_xp = 200 (lost 50 XP from T1)
```

**Current Mitigation:** `award_xp` SQL function uses atomic UPDATE, but if multiple Edge Function instances call it simultaneously, race conditions can still occur at the application level.

**Fix:** The SQL function already handles this correctly with atomic increments:
```sql
-- Already correct in award_xp:
UPDATE leaderboard_entries SET
    game_xp = game_xp + p_amount,  -- Atomic increment
    total_xp = total_xp + p_amount
WHERE user_id = p_user_id;
```

**Verification Needed:** Confirm all XP update paths use the `award_xp` RPC, not direct table updates.

---

### 4. XP Double-Award Vulnerability in Video Likes
**Location:** `supabase/functions/verify-video-likes/index.ts`
**Issue:** Video like XP can be awarded multiple times if the client replays the verification request with a different idempotency key.

**Current Flow:**
```
1. User likes video on YouTube
2. Client calls verify-video-likes with idempotencyKey: "video-like:user123:session1"
3. Server awards XP
4. User unlikes video
5. User likes video again
6. Client calls verify-video-likes with idempotencyKey: "video-like:user123:session2"
7. Server awards XP again (double award!)
```

**Fix:** Track awarded video IDs in database per user:
```sql
CREATE TABLE user_video_like_awards (
    user_id UUID REFERENCES auth.users(id),
    video_id TEXT NOT NULL,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, video_id)
);
```

Then in Edge Function:
```typescript
// Check if already awarded for this video
const { data: existing } = await supabase
    .from('user_video_like_awards')
    .select('video_id')
    .eq('user_id', userId)
    .eq('video_id', videoId)
    .single();

if (existing) {
    return { alreadyAwarded: true };
}
```

---

### 5. Race Condition in Session Finalization
**Location:** `services/session/sessionManager.ts` (inferred from patterns)
**Issue:** If app crashes during session finalization, XP may be lost or double-counted.

**Scenario:**
```
1. Game ends, score = 500
2. App starts session finalization
3. App crashes before completion
4. App restarts, retries finalization
5. If not idempotent, XP double-counted or lost
```

**Current Mitigation:** Idempotency keys exist but require proper session persistence.

**Fix:** Ensure session state is persisted to AsyncStorage before finalization starts:
```typescript
// Before any network call
await AsyncStorage.setItem(`pending-finalization:${sessionId}`, JSON.stringify({
    userId,
    gameId,
    score,
    idempotencyKey,
    startedAt: Date.now(),
}));

// After successful finalization
await AsyncStorage.removeItem(`pending-finalization:${sessionId}`);

// On app startup, check for pending finalizations
const pending = await AsyncStorage.getAllKeys()
    .then(keys => keys.filter(k => k.startsWith('pending-finalization:')));
// Retry each pending finalization
```

---

### 6. Deep Link Validation Gaps
**Location:** App linking configuration
**Issue:** Deep links may not validate origin, allowing malicious apps to trigger actions.

**Impact:** Potential for phishing or unauthorized actions via crafted deep links.

**Fix:** Validate deep link parameters and add origin checks:
```typescript
// In deep link handler
const validateDeepLink = (url: string): boolean => {
    const parsed = new URL(url);

    // Whitelist allowed hosts
    const allowedHosts = ['hamaki.app', 'www.hamaki.app'];
    if (!allowedHosts.includes(parsed.host)) {
        console.warn('Deep link from untrusted host:', parsed.host);
        return false;
    }

    // Validate required parameters
    // ...
    return true;
};
```

---

## 🟠 HIGH PRIORITY ISSUES

### 7. Missing Foreign Key Constraints
**Location:** Various tables
**Issue:** Some tables lack foreign key constraints, allowing orphaned records.

**Examples Found:**
- `post_upvotes.post_id` → should reference `posts.id` with ON DELETE CASCADE
- `content_stats.content_id` → no reference (by design, but lacks validation)

**Fix:**
```sql
-- Add missing FK constraints
ALTER TABLE post_upvotes
    ADD CONSTRAINT fk_post_upvotes_post
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
```

---

### 8. N+1 Query in Leaderboard Fetching
**Location:** `services/supabase/leaderboardService.ts`
**Issue:** Fetching leaderboard with user details may cause N+1 queries.

**Current Pattern:**
```typescript
// Fetch leaderboard entries
const entries = await supabase.from('leaderboard_entries').select('*');

// For each entry, fetch user details (N queries!)
for (const entry of entries) {
    const user = await supabase.from('users').select('*').eq('id', entry.user_id);
}
```

**Fix:** Use join in single query:
```typescript
const { data } = await supabase
    .from('leaderboard_entries')
    .select(`
        *,
        user:users(id, display_name, avatar_url)
    `)
    .eq('period_type', 'monthly')
    .order('total_xp', { ascending: false })
    .limit(100);
```

---

### 9. Rank Tie-Breaking Inconsistency
**Location:** Rank calculation in `award-xp/index.ts` and leaderboard queries
**Issue:** When users have equal XP, rank order is non-deterministic.

**Current:**
```sql
ORDER BY total_xp DESC  -- What if two users have same XP?
```

**Fix:**
```sql
ORDER BY total_xp DESC, created_at ASC, id ASC
```

---

### 10. Missing Rate Limiting Per User
**Location:** `supabase/functions/award-xp/index.ts`
**Issue:** Per-request rate limiting exists, but a user could spam many requests.

**Current:** Only validates `amount <= 500` per request.
**Missing:** No limit on requests per user per time window.

**Fix:** Add Redis or database-backed rate limiting:
```typescript
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

async function checkUserRateLimit(userId: string): Promise<boolean> {
    const { count } = await supabase
        .from('edge_idempotency_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('function_name', 'award-xp')
        .gte('created_at', new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());

    return (count || 0) < MAX_REQUESTS_PER_WINDOW;
}
```

---

### 11. YouTube Token Refresh Race Condition
**Location:** `utils/youtubeAuth.ts` (inferred)
**Issue:** Multiple concurrent requests could all trigger token refresh, causing redundant API calls.

**Fix:** Use lock/mutex pattern:
```typescript
let refreshPromise: Promise<string> | null = null;

async function getValidToken(): Promise<string> {
    if (refreshPromise) {
        return refreshPromise; // Return existing refresh operation
    }

    if (tokenIsValid()) {
        return currentToken;
    }

    // Start refresh and track promise
    refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}
```

---

### 12. Subscription Verification Without Time Validation
**Location:** `supabase/functions/verify-subscriptions/index.ts`
**Issue:** Verifies current subscription status but doesn't prevent abuse from subscribe/unsubscribe cycling.

**Recommendation:** Track subscription award timestamps and add cooldown:
```sql
CREATE TABLE user_subscription_awards (
    user_id UUID REFERENCES auth.users(id),
    channel_id TEXT NOT NULL,
    first_awarded_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, channel_id)
);
```

---

### 13. Content Stats Aggregation Missing Error Handling
**Location:** `supabase/migrations/20260115200100_create_aggregate_stats_cron.sql`
**Issue:** If aggregation fails, no retry or alert mechanism.

**Fix:** Add error logging table and alert:
```sql
CREATE TABLE cron_job_logs (
    id SERIAL PRIMARY KEY,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    run_at TIMESTAMPTZ DEFAULT NOW()
);

-- In cron function, wrap in exception handler
BEGIN
    -- aggregation logic
    INSERT INTO cron_job_logs (job_name, status) VALUES ('aggregate_stats', 'success');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO cron_job_logs (job_name, status, error_message)
    VALUES ('aggregate_stats', 'failed', SQLERRM);
    RAISE;
END;
```

---

### 14. Hardcoded YouTube API Key Costs
**Location:** `supabase/functions/sync-youtube-videos/index.ts`
**Issue:** YouTube API costs are hardcoded (100 units for search.list). If API changes, tracking breaks silently.

**Fix:** Centralize API cost constants:
```typescript
// constants/youtubeApiCosts.ts
export const YOUTUBE_API_COSTS = {
    'subscriptions.list': 1,
    'videos.getRating': 1,
    'search.list': 100,
    'videos.list': 1,
} as const;
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 15. Missing Input Sanitization in Content Posts
**Location:** `content_posts` table / content submission
**Issue:** User-submitted content may contain XSS vectors if rendered as HTML.

**Fix:** Always sanitize HTML or use text-only content.

---

### 16. Inconsistent Error Response Formats
**Location:** Various Edge Functions
**Issue:** Some return `{ error: string }`, others `{ success: false, error: string }`.

**Fix:** Standardize all responses:
```typescript
interface ErrorResponse {
    success: false;
    error: string;
    code?: string;
}

interface SuccessResponse<T> {
    success: true;
    data: T;
}
```

---

### 17. AsyncStorage Key Collision Risk
**Location:** Various caching implementations
**Issue:** Multiple features use AsyncStorage with potentially colliding keys.

**Fix:** Use namespaced keys:
```typescript
const STORAGE_KEYS = {
    leaderboard: (period: string) => `@hamaki/leaderboard/${period}`,
    session: (id: string) => `@hamaki/session/${id}`,
    quota: () => `@hamaki/youtube-quota`,
} as const;
```

---

### 18. Missing Index on Frequently Queried Columns
**Location:** `posts` table
**Issue:** `created_at` queries for cleanup may be slow without index.

**Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
```

---

### 19. Leaderboard Snapshot Cache Invalidation
**Location:** `hooks/useLeaderboardSnapshot.ts`
**Issue:** 5-minute staleness window means users see outdated ranks.

**Recommendation:** Add manual refresh button or reduce to 2 minutes for active sessions.

---

### 20. Game Asset Loading Without Retry
**Location:** `features/games/*/utils/assets.ts`
**Issue:** Asset loading failures aren't retried, could leave game in broken state.

**Fix:** Add retry wrapper:
```typescript
async function loadAssetWithRetry(uri: string, retries = 3): Promise<Asset> {
    for (let i = 0; i < retries; i++) {
        try {
            return await Asset.fromURI(uri).downloadAsync();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw new Error('Asset load failed');
}
```

---

### 21-26. Additional Medium Issues
- Missing request timeout configuration in some fetch calls
- No circuit breaker for Supabase realtime connections
- Inconsistent logging levels across Edge Functions
- Missing metrics/observability for game sessions
- Auth state not persisted across app kills
- Push notification token refresh not handled

---

## 🟢 LOW PRIORITY ISSUES

### 27-33. Nice to Have Improvements
- Add TypeScript strict mode to remaining files
- Consolidate duplicate utility functions
- Add JSDoc comments to public APIs
- Consider moving magic numbers to config
- Add integration tests for Edge Functions
- Improve error messages for debugging
- Add health check endpoints

---

## Architecture Assessment

### What's Working Well ✅
1. **Edge Function Pattern**: Good separation of concerns, service role isolation
2. **Idempotency**: Implemented correctly with database-backed keys
3. **Offline Queue**: Robust retry mechanism with exponential backoff
4. **YouTube Quota Management**: Circuit breaker + tracking is solid
5. **RLS Policies**: Mostly well-configured (except users table)
6. **Atomic Operations**: Recent fixes improved transaction safety

### Areas for Improvement 🔧
1. **Security**: RLS on users table, input validation, deep link security
2. **Race Conditions**: Token refresh, session finalization
3. **Anti-Cheat**: Server-side score validation needed
4. **Monitoring**: Add observability for production debugging

---

## Recommended Priority Order

### This Week (Critical)
1. Fix RLS on users table (30 min)
2. Add video like tracking to prevent double awards (2 hours)
3. Add subscription award tracking with cooldown (2 hours)

### Next Sprint (High)
4. Implement server-side score validation strategy (1 day)
5. Add per-user rate limiting (2 hours)
6. Fix N+1 leaderboard query (1 hour)
7. Add rank tie-breaker consistency (30 min)

### Backlog (Medium/Low)
8. Standardize error responses
9. Add cron job monitoring
10. Improve asset loading resilience
11. Add integration tests

---

## Questions for Clarification

1. **Score Validation**: What's the acceptable latency for game score submission? This affects which validation strategy to use.

2. **Subscription Rewards**: Should users be able to unsubscribe and resubscribe to get XP again? Current system allows this.

3. **Rank Refresh**: Is 5-minute staleness acceptable? Users playing games want more real-time feedback.

4. **User Data Access**: Should users be able to see other users' profiles at all, or only on leaderboard?

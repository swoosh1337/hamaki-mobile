# Leaderboard Scalability: 10/10 Implementation Plan

## Goal
Implement all remaining scalability improvements to achieve 10/10 score and handle 50K+ users.

## Current Score: 8.5/10
Already implemented:
- ✅ Composite database indexes
- ✅ Server-side XP rate limiting (max 500 per award)
- ✅ Jitter for realtime refresh (0-3s random delay)
- ✅ In-memory rank caching (5s TTL in Edge Function)
- ✅ Retry with exponential backoff (`utils/retry.ts`, `utils/edgeFunctionClient.ts`)
- ✅ Offline queue with persistence (`services/queue/edgeFunctionQueueService.ts`)
- ✅ YouTube quota circuit breaker (`utils/youtubeQuotaState.ts`)
- ✅ React state-based caching (`hooks/useLeaderboardSnapshot.ts`)

---

## Prerequisites

**Required:**
- Supabase project (any tier for basic features)
- Composite indexes on `leaderboard_entries` (already implemented)

**For Pre-Computed Ranks (pg_cron):**
- ⚠️ **Supabase Pro/Enterprise tier required** - pg_cron extension not available on Free tier
- Enable via Dashboard → Database → Extensions → pg_cron
- **Alternative for Free tier:** Use GitHub Actions or external scheduler to call a webhook

**For AsyncStorage Cache:**
- Note: AsyncStorage has ~6MB limit on some platforms
- Leaderboard snapshot (100 entries) is ~50KB - well within limits

---

## Remaining Improvements (5 items)

---

## 1. Pre-Computed Rank Column (-0.5 points)

### Problem
Rank calculation runs `COUNT(*) WHERE total_xp > X` on every XP award - still O(n) even with index.

### Solution
Add a `rank` column to `leaderboard_entries` and update it via cron job every 2 minutes.

### Files to Modify

**A. New Migration: `supabase/migrations/20260116100000_precomputed_ranks.sql`**
```sql
-- Add rank column
ALTER TABLE leaderboard_entries ADD COLUMN rank INTEGER DEFAULT 0;

-- Create index for rank lookups
CREATE INDEX idx_leaderboard_rank ON leaderboard_entries(period_type, rank);

-- Function to recompute all ranks with deterministic tie-breaker
CREATE OR REPLACE FUNCTION recompute_leaderboard_ranks()
RETURNS void AS $$
BEGIN
    -- Update monthly ranks using atomic CTE pattern with tie-breaker
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   ORDER BY total_xp DESC,
                   created_at ASC,  -- Earlier users rank higher on tie
                   id ASC           -- Final deterministic tie-breaker
               ) as new_rank
        FROM leaderboard_entries
        WHERE period_type = 'monthly'
        FOR UPDATE  -- Lock rows during computation
    )
    UPDATE leaderboard_entries le
    SET rank = ranked.new_rank
    FROM ranked
    WHERE le.id = ranked.id;

    -- Update weekly ranks with same pattern
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   ORDER BY total_xp DESC,
                   created_at ASC,
                   id ASC
               ) as new_rank
        FROM leaderboard_entries
        WHERE period_type = 'weekly'
        FOR UPDATE
    )
    UPDATE leaderboard_entries le
    SET rank = ranked.new_rank
    FROM ranked
    WHERE le.id = ranked.id;
END;
$$ LANGUAGE plpgsql;

-- Schedule cron job every 2 minutes (requires pg_cron extension)
SELECT cron.schedule('recompute-ranks', '*/2 * * * *', 'SELECT recompute_leaderboard_ranks()');
```

**B. Modify: `supabase/functions/award-xp/index.ts`**
- Change `calculatePersonalRank()` to read from `rank` column instead of COUNT query
- Keep COUNT as fallback if rank is 0 (newly created user)

```typescript
async function calculatePersonalRank(supabase, userId, userTotalXP): Promise<number> {
    // Try pre-computed rank first (O(1))
    const { data } = await supabase
        .from('leaderboard_entries')
        .select('rank')
        .eq('user_id', userId)
        .eq('period_type', 'monthly')
        .single();

    if (data?.rank && data.rank > 0) {
        return data.rank;
    }

    // Fallback to COUNT for new users (rank not yet computed)
    // ... existing COUNT logic
}
```

---

## 2. Per-User Rate Limiting (-0.3 points)

### Problem
User can spam many XP requests even with per-request limit (500 max).

### Solution
Use `edge_idempotency_keys` table to count recent awards per user.

### Files to Modify

**A. Modify: `supabase/functions/award-xp/index.ts`**
Add rate limit check after idempotency check:

```typescript
// Configuration
const MAX_AWARDS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

async function checkUserRateLimit(supabase, userId: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

    const { count } = await supabase
        .from('edge_idempotency_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('function_name', 'award-xp')
        .gte('created_at', windowStart);

    return (count || 0) < MAX_AWARDS_PER_MINUTE;
}

// In main handler, after idempotency check:
const withinRateLimit = await checkUserRateLimit(supabase, userId);
if (!withinRateLimit) {
    return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded. Max 10 awards per minute.' }),
        { status: 429, headers: corsHeaders }
    );
}
```

---

## 3. Circuit Breaker (-0.2 points)

### Problem
If database is slow/down, clients keep retrying → cascading failure.

### Solution
Add circuit breaker to `edgeFunctionClient.ts` that fails fast after N consecutive failures.

> **Note:** A YouTube-specific circuit breaker already exists in `utils/youtubeQuotaState.ts`.
> This implementation is for general Edge Function calls.

### Files to Modify

**A. New File: `utils/circuitBreaker.ts`**
```typescript
import { createLogger } from '@/utils/logger';

const log = createLogger('CircuitBreaker');

// 3-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED)
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitInfo {
    state: CircuitState;
    failures: number;
    lastFailure: number;
    halfOpenAttempts: number;
}

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 30000; // 30 seconds
const HALF_OPEN_MAX_ATTEMPTS = 1;

class CircuitBreaker {
    private circuits: Map<string, CircuitInfo> = new Map();

    canExecute(functionName: string): boolean {
        const circuit = this.circuits.get(functionName);
        if (!circuit) return true;

        switch (circuit.state) {
            case 'CLOSED':
                return true;
            case 'OPEN':
                // Check if timeout passed → transition to HALF_OPEN
                if (Date.now() - circuit.lastFailure > RESET_TIMEOUT_MS) {
                    circuit.state = 'HALF_OPEN';
                    circuit.halfOpenAttempts = 0;
                    log.info('Circuit entering HALF_OPEN', { functionName });
                    return true;
                }
                return false;
            case 'HALF_OPEN':
                // Allow limited attempts to test if service recovered
                return circuit.halfOpenAttempts < HALF_OPEN_MAX_ATTEMPTS;
        }
    }

    recordSuccess(functionName: string): void {
        const circuit = this.circuits.get(functionName);
        if (circuit?.state === 'HALF_OPEN') {
            log.info('Circuit closed after successful HALF_OPEN test', { functionName });
        }
        this.circuits.set(functionName, {
            state: 'CLOSED',
            failures: 0,
            lastFailure: 0,
            halfOpenAttempts: 0,
        });
    }

    recordFailure(functionName: string): void {
        const circuit = this.circuits.get(functionName) || {
            state: 'CLOSED' as CircuitState,
            failures: 0,
            lastFailure: 0,
            halfOpenAttempts: 0,
        };

        circuit.failures++;
        circuit.lastFailure = Date.now();

        if (circuit.state === 'HALF_OPEN') {
            circuit.halfOpenAttempts++;
            if (circuit.halfOpenAttempts >= HALF_OPEN_MAX_ATTEMPTS) {
                circuit.state = 'OPEN';
                log.warn('Circuit re-opened after HALF_OPEN failure', { functionName });
            }
        } else if (circuit.failures >= FAILURE_THRESHOLD) {
            circuit.state = 'OPEN';
            log.warn('Circuit opened', { functionName, failures: circuit.failures });
        }

        this.circuits.set(functionName, circuit);
    }
}

export const circuitBreaker = new CircuitBreaker();
```

**B. Modify: `utils/edgeFunctionClient.ts`**
- Import circuit breaker
- Check before calling Edge Function
- Record success/failure after call

---

## 4. Edge Cache for Leaderboard Snapshot (-0.3 points)

### Problem
Every client fetches leaderboard from DB (same data for everyone).

### Solution
Cache snapshot in AsyncStorage with 60-second TTL.

> **Note:** React state caching with 5-minute staleness is already implemented in `hooks/useLeaderboardSnapshot.ts`.
> AsyncStorage caching provides persistence across app restarts.

### Files to Modify

**A. Modify: `services/supabase/leaderboardService.ts`**
Add caching to `getLeaderboardSnapshot()` with promise deduplication:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const SNAPSHOT_CACHE_KEY = 'leaderboard_snapshot';
const SNAPSHOT_CACHE_TTL_MS = 60000; // 60 seconds

// Prevent concurrent fetches for same period type
private pendingFetches: Map<string, Promise<LeaderboardSnapshot>> = new Map();

async getLeaderboardSnapshot(limit = 100, periodType = 'monthly') {
    // Check for in-flight request first (promise deduplication)
    const pendingKey = `${periodType}:${limit}`;
    const pending = this.pendingFetches.get(pendingKey);
    if (pending) {
        log.debug('Returning pending fetch promise', { periodType });
        return pending;
    }

    // Try cache
    const cached = await this.getCachedSnapshot(periodType);
    if (cached) {
        log.debug('Returning cached leaderboard snapshot');
        return cached;
    }

    // Create and track the fetch promise
    const fetchPromise = this.fetchSnapshotFromDB(limit, periodType)
        .then(async (snapshot) => {
            await this.cacheSnapshot(periodType, snapshot);
            return snapshot;
        })
        .finally(() => {
            this.pendingFetches.delete(pendingKey);
        });

    this.pendingFetches.set(pendingKey, fetchPromise);
    return fetchPromise;
}

private async getCachedSnapshot(periodType: string) {
    try {
        const key = `${SNAPSHOT_CACHE_KEY}:${periodType}`;
        const cached = await AsyncStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > SNAPSHOT_CACHE_TTL_MS) {
            return null; // Expired
        }
        return data;
    } catch {
        return null;
    }
}
```

**B. Add cache invalidation** in `useLeaderboardSnapshot.ts` when XP event received.

---

## 5. Combine award_xp Queries (-0.2 points)

### Problem
Edge Function makes 3 queries: `award_xp()` + `calculatePersonalRank()` + `getXPBreakdown()`.

### Solution
Modify SQL function to return rank and breakdown in single call.

### Files to Modify

**A. New Migration: `supabase/migrations/20260116100100_award_xp_v2.sql`**
```sql
CREATE OR REPLACE FUNCTION award_xp_v2(
    p_user_id UUID,
    p_xp_type TEXT,
    p_xp_amount INTEGER
)
RETURNS TABLE(
    success BOOLEAN,
    new_total INTEGER,
    rank INTEGER,
    game_xp INTEGER,
    subscription_xp INTEGER,
    video_like_xp INTEGER,
    message TEXT
) AS $$
DECLARE
    v_new_total INTEGER;
    v_rank INTEGER;
    v_game INTEGER;
    v_sub INTEGER;
    v_video INTEGER;
    v_has_user BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_xp_amount IS NULL OR p_xp_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid input: user_id=% xp_amount=%', p_user_id, p_xp_amount;
    END IF;

    IF p_xp_type NOT IN ('game', 'subscription', 'video_like') THEN
        RAISE EXCEPTION 'Invalid xp_type: %', p_xp_type;
    END IF;

    SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id)
    INTO v_has_user;

    IF NOT v_has_user THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    SELECT le.game_xp, le.subscription_xp, le.video_like_xp, le.total_xp, le.rank
    INTO v_game, v_sub, v_video, v_new_total, v_rank
    FROM leaderboard_entries le
    WHERE le.user_id = p_user_id AND le.period_type = 'monthly'
    FOR UPDATE;

    v_game := COALESCE(v_game, 0);
    v_sub := COALESCE(v_sub, 0);
    v_video := COALESCE(v_video, 0);

    IF p_xp_type = 'game' THEN
        v_game := v_game + p_xp_amount;
    ELSIF p_xp_type = 'subscription' THEN
        v_sub := v_sub + p_xp_amount;
    ELSIF p_xp_type = 'video_like' THEN
        v_video := v_video + p_xp_amount;
    END IF;

    v_new_total := v_game + v_sub + v_video;

    INSERT INTO leaderboard_entries (user_id, period_type, total_xp, game_xp, subscription_xp, video_like_xp)
    VALUES (p_user_id, 'monthly', v_new_total, v_game, v_sub, v_video)
    ON CONFLICT (user_id, period_type)
    DO UPDATE SET
        total_xp = EXCLUDED.total_xp,
        game_xp = EXCLUDED.game_xp,
        subscription_xp = EXCLUDED.subscription_xp,
        video_like_xp = EXCLUDED.video_like_xp;

    SELECT le.rank
    INTO v_rank
    FROM leaderboard_entries le
    WHERE le.user_id = p_user_id AND le.period_type = 'monthly';

    RETURN QUERY SELECT
        true, v_new_total, v_rank,
        v_game, v_sub, v_video, 'XP awarded'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE;
```

**B. Modify: `supabase/functions/award-xp/index.ts`**
- Call `award_xp_v2()` instead of `award_xp()`
- Remove separate `calculatePersonalRank()` and `getXPBreakdown()` calls
- Use returned values directly

---

## Implementation Order

1. **Pre-computed ranks** (biggest impact) - Migration + Edge Function change
2. **Per-user rate limiting** - Edge Function only
3. **Circuit breaker** - New utility + client modification
4. **Edge cache for leaderboard** - Service + hook modification
5. **Combine queries** - Migration + Edge Function change

---

## Implementation Recommendation

Based on codebase analysis, **most scalability features are already implemented**:

| Feature | Recommendation | Reason |
|---------|----------------|--------|
| Pre-computed ranks | **Defer** | Requires pg_cron (Supabase Pro). Current 5s in-memory cache is sufficient. |
| Per-user rate limiting | **Consider** | Worth adding if spam becomes an issue. |
| General circuit breaker | **Skip** | YouTube quota breaker + offline queue already handles this pattern. |
| AsyncStorage leaderboard cache | **Skip** | React state with 5-min staleness + jitter is working well. |
| Combined award_xp_v2 | **Consider** | Worth adding if query count becomes bottleneck. |

---

## Files Summary

| File | Changes |
|------|---------|
| `supabase/migrations/20260116100000_precomputed_ranks.sql` | NEW - rank column + cron |
| `supabase/migrations/20260116100100_award_xp_v2.sql` | NEW - combined function |
| `supabase/functions/award-xp/index.ts` | Rate limiting + use rank column + use v2 function |
| `utils/circuitBreaker.ts` | NEW - circuit breaker utility |
| `utils/edgeFunctionClient.ts` | Add circuit breaker integration |
| `services/supabase/leaderboardService.ts` | Add snapshot caching |
| `hooks/useLeaderboardSnapshot.ts` | Invalidate cache on XP event |

---

## Verification

1. **Pre-computed ranks**:
   - Run migration, verify cron job runs every 2 min
   - Check rank column populated correctly
   - Verify tie-breaker produces consistent ordering

2. **Rate limiting**:
   - Try awarding XP 11 times in 1 minute → should get 429 on 11th

3. **Circuit breaker**:
   - Simulate 5 failures → circuit opens (OPEN state)
   - Wait 30 seconds → circuit enters HALF_OPEN
   - Success → circuit closes (CLOSED state)
   - Failure in HALF_OPEN → circuit re-opens

4. **Edge cache**:
   - Fetch leaderboard, check AsyncStorage has cached data
   - Fetch again within 60s → should be from cache
   - Verify concurrent fetches return same promise

5. **Combined queries**:
   - Award XP, check only 1 RPC call in logs (not 3)

---

## Expected Results After Implementation

| Metric | Before | After |
|--------|--------|-------|
| Rank lookup | O(n) COUNT query | O(1) column read |
| XP award queries | 3 per award | 1 per award |
| Leaderboard fetches | Every request hits DB | 90% served from cache |
| Spam protection | Per-request limit only | Per-user rate limit |
| Failure handling | Retry until timeout | Fail fast after 5 failures |
| Scalability Score | 8.5/10 | 10/10 |
| Max Users | ~10K | 50K+ |

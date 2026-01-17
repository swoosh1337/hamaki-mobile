# Leaderboard Scalability: 10/10 Implementation Plan

## Goal
Implement all remaining scalability improvements to achieve 10/10 score and handle 50K+ users.

## Current Score: 8.5/10
Already implemented:
- ✅ Composite database indexes
- ✅ Server-side XP rate limiting (max 500 per award)
- ✅ Jitter for realtime refresh (0-3s random delay)
- ✅ In-memory rank caching (5s TTL in Edge Function)

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

-- Function to recompute all ranks
CREATE OR REPLACE FUNCTION recompute_leaderboard_ranks()
RETURNS void AS $$
BEGIN
    -- Update monthly ranks using window function
    UPDATE leaderboard_entries le
    SET rank = ranked.new_rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_xp DESC) as new_rank
        FROM leaderboard_entries
        WHERE period_type = 'monthly'
    ) ranked
    WHERE le.id = ranked.id AND le.period_type = 'monthly';

    -- Update weekly ranks
    UPDATE leaderboard_entries le
    SET rank = ranked.new_rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_xp DESC) as new_rank
        FROM leaderboard_entries
        WHERE period_type = 'weekly'
    ) ranked
    WHERE le.id = ranked.id AND le.period_type = 'weekly';
END;
$$ LANGUAGE plpgsql;

-- Schedule cron job every 2 minutes
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

### Files to Modify

**A. New File: `utils/circuitBreaker.ts`**
```typescript
interface CircuitState {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
}

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 30000; // 30 seconds

class CircuitBreaker {
    private states: Map<string, CircuitState> = new Map();

    canExecute(functionName: string): boolean {
        const state = this.states.get(functionName);
        if (!state || !state.isOpen) return true;

        // Check if reset timeout has passed
        if (Date.now() - state.lastFailure > RESET_TIMEOUT_MS) {
            state.isOpen = false;
            state.failures = 0;
            return true;
        }
        return false;
    }

    recordSuccess(functionName: string): void {
        this.states.set(functionName, { failures: 0, lastFailure: 0, isOpen: false });
    }

    recordFailure(functionName: string): void {
        const state = this.states.get(functionName) || { failures: 0, lastFailure: 0, isOpen: false };
        state.failures++;
        state.lastFailure = Date.now();

        if (state.failures >= FAILURE_THRESHOLD) {
            state.isOpen = true;
            log.warn('Circuit breaker opened', { functionName, failures: state.failures });
        }
        this.states.set(functionName, state);
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

### Files to Modify

**A. Modify: `services/supabase/leaderboardService.ts`**
Add caching to `getLeaderboardSnapshot()`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const SNAPSHOT_CACHE_KEY = 'leaderboard_snapshot';
const SNAPSHOT_CACHE_TTL_MS = 60000; // 60 seconds

async getLeaderboardSnapshot(limit = 100, periodType = 'monthly') {
    // Try cache first
    const cached = await this.getCachedSnapshot(periodType);
    if (cached) {
        log.debug('Returning cached leaderboard snapshot');
        return cached;
    }

    // Fetch from database
    const snapshot = await this.fetchSnapshotFromDB(limit, periodType);

    // Cache result
    await this.cacheSnapshot(periodType, snapshot);

    return snapshot;
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
    p_amount INTEGER
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
BEGIN
    -- Existing award logic...

    -- Get XP breakdown
    SELECT le.game_xp, le.subscription_xp, le.video_like_xp, le.total_xp, le.rank
    INTO v_game, v_sub, v_video, v_new_total, v_rank
    FROM leaderboard_entries le
    WHERE le.user_id = p_user_id AND le.period_type = 'monthly';

    RETURN QUERY SELECT
        true, v_new_total, COALESCE(v_rank, 0),
        v_game, v_sub, v_video, 'XP awarded'::TEXT;
END;
$$ LANGUAGE plpgsql;
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

2. **Rate limiting**:
   - Try awarding XP 11 times in 1 minute → should get 429 on 11th

3. **Circuit breaker**:
   - Simulate 5 failures → circuit opens
   - Wait 30 seconds → circuit closes

4. **Edge cache**:
   - Fetch leaderboard, check AsyncStorage has cached data
   - Fetch again within 60s → should be from cache

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

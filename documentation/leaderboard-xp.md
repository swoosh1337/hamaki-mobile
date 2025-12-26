# Leaderboard & XP System

This document provides detailed documentation for the Hamaki Mobile leaderboard system, including XP awarding, cron jobs, network failure handling, idempotency, and UI refresh patterns.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Files & Locations](#files--locations)
4. [Database Schema](#database-schema)
5. [XP Award Flow](#xp-award-flow)
6. [Idempotency & Network Failure Handling](#idempotency--network-failure-handling)
7. [Leaderboard Refresh Patterns](#leaderboard-refresh-patterns)
8. [Cron Jobs & Reset Schedules](#cron-jobs--reset-schedules)
9. [Period Types](#period-types)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)

---

## 1. Overview

### Purpose

The leaderboard system tracks user XP earned through various activities:

| XP Source | Award Trigger | Typical Amount |
|-----------|---------------|----------------|
| Game XP | Playing games (NoPogod, etc.) | 10-500 XP |
| Subscription XP | Verifying YouTube subscriptions | 700-1,000 XP |
| Video Like XP | Liking YouTube videos | 100-200 XP |

### Key Principles

1. **Idempotent XP Awards**: Same action can't award XP twice (via idempotency keys)
2. **Dual Period Tracking**: Both `weekly` and `monthly` leaderboards maintained
3. **Batched Refresh**: Global leaderboard updates on intervals, not per-XP
4. **Instant Personal Feedback**: User's own rank returned immediately from award
5. **Resilient to Network Failures**: Queue + retry system for failed requests

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                            Mobile App                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Game Engine                              │   │
│  │   NoPogod / Hammock Jump / etc                                   │   │
│  │   └─► On game end: invokeEdgeFunction('award-xp', ...)          │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│  ┌───────────────────────────▼─────────────────────────────────────┐   │
│  │                  Edge Function Queue Service                     │   │
│  │   - Stores pending requests in AsyncStorage                      │   │
│  │   - Retries on network failure (ex. backoff: 1s, 2s, 4s...)     │   │
│  │   - Deduplicates by idempotency key                             │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│  ┌───────────────────────────▼─────────────────────────────────────┐   │
│  │                    Hooks Layer                                   │   │
│  │   useLeaderboardSnapshot() - Global truth (batched)             │   │
│  │   useMyLeaderboardStatus() - Personal rank (instant)            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      Supabase Edge Functions                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       award-xp                                   │   │
│  │   1. Validate idempotency key (prevent duplicates)              │   │
│  │   2. Log XP transaction                                          │   │
│  │   3. Call award_xp() SQL function                                │   │
│  │   4. Return new_total_xp + personal_rank                         │   │
│  └───────────────────────────┬─────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   PostgreSQL Functions                           │   │
│  │   award_xp(user_id, xp_type, amount)                            │   │
│  │   └─► Upserts BOTH weekly + monthly leaderboard_entries          │   │
│  │   └─► Updates users.xp_points                                    │   │
│  │   └─► Returns (new_total_xp, monthly_rank, weekly_rank)         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Files & Locations

### Client (Mobile)

| File | Purpose |
|------|---------|
| `services/supabase/leaderboardService.ts` | Query leaderboard entries |
| `services/supabase/userService.ts` | Get user XP stats |
| `hooks/useLeaderboardSnapshot.ts` | Global leaderboard (batched) |
| `hooks/useMyLeaderboardStatus.ts` | Personal rank (instant) |
| `hooks/useLeaderboard.ts` | Combined hook |
| `services/queue/edgeFunctionQueueService.ts` | Retry queue for failures |
| `utils/edgeFunctionClient.ts` | Edge function wrapper |
| `app/(tabs)/leaderboard.tsx` | Leaderboard UI screen |

### Backend (Supabase)

| File | Purpose |
|------|---------|
| `supabase/functions/award-xp/` | XP award Edge Function |
| `supabase/functions/monthly-leaderboard-reset/` | Monthly reset cron |
| `supabase/migrations/20251226000200_fix_award_xp_weekly.sql` | Core SQL functions |

---

## 4. Database Schema

### `leaderboard_entries` Table

```sql
CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
    
    -- XP by source
    game_xp INTEGER DEFAULT 0,
    subscription_xp INTEGER DEFAULT 0,
    video_like_xp INTEGER DEFAULT 0,
    
    -- Total (computed)
    total_xp INTEGER GENERATED ALWAYS AS (game_xp + subscription_xp + video_like_xp) STORED,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(user_id, period_type)
);
```

**Key Points:**
- **Two rows per user**: One `weekly`, one `monthly`
- **total_xp is computed**: Sum of all XP sources
- **Unique constraint**: `(user_id, period_type)` prevents duplicates

### `xp_transactions` Table

```sql
CREATE TABLE xp_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    xp_type TEXT NOT NULL,       -- 'game', 'subscription', 'video_like'
    amount INTEGER NOT NULL,
    idempotency_key TEXT UNIQUE, -- Prevents duplicate awards
    game_id TEXT,                -- For game XP
    session_id TEXT,             -- For game XP
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### `leaderboard_refresh_events` Table

```sql
CREATE TABLE leaderboard_refresh_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Used by cron to signal clients to refresh.

---

## 5. XP Award Flow

### When User Completes a Game

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Game Ends                                                          │
│    └─► NoPogodGame.tsx calculates XP based on score                  │
│    └─► Generates idempotency key: `game-{sessionId}-{timestamp}`     │
│                                                                       │
│ 2. Call Edge Function                                                 │
│    └─► invokeEdgeFunction('award-xp', {                              │
│          userId, xpType: 'game', amount: 150,                        │
│          gameId, sessionId, idempotencyKey                           │
│        })                                                             │
│                                                                       │
│ 3. Edge Function Processing                                           │
│    └─► Check idempotency_key in xp_transactions                      │
│    └─► If exists: return existing values (no re-award)               │
│    └─► If new: call award_xp() SQL function                          │
│                                                                       │
│ 4. SQL Function: award_xp()                                           │
│    └─► UPSERT leaderboard_entries WHERE period_type='weekly'         │
│    └─► UPSERT leaderboard_entries WHERE period_type='monthly'        │
│    └─► UPDATE users SET xp_points = xp_points + amount               │
│    └─► Calculate ranks                                                │
│    └─► RETURN (new_total_xp, monthly_rank, weekly_rank)              │
│                                                                       │
│ 5. Response to App                                                    │
│    └─► { success: true, new_total_xp: 7500, personal_rank: 3 }       │
│    └─► App updates local profile immediately                         │
│                                                                       │
│ 6. Leaderboard UI (Delayed)                                           │
│    └─► Global leaderboard refreshes on interval (5 min)              │
│    └─► Or user pulls to refresh                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Idempotency & Network Failure Handling

### Idempotency Keys

Every XP award includes a unique idempotency key:

```typescript
// Game XP
const idempotencyKey = `game-${sessionId}-${Date.now()}`;

// Subscription XP
const idempotencyKey = `sub-${userId}-${channelId}`;

// Video Like XP
const idempotencyKey = `video-${userId}-${videoId}`;
```

**How it works:**
1. Before awarding XP, Edge Function checks `xp_transactions.idempotency_key`
2. If key exists → return cached result (no XP awarded)
3. If new → award XP and store key

### Network Failure Queue

When network fails, requests are queued for retry:

```typescript
// edgeFunctionQueueService.ts
interface QueuedRequest {
    id: string;
    functionName: string;
    body: Record<string, unknown>;
    idempotencyKey: string;
    attempts: number;
    createdAt: number;
    nextRetryAt: number;
}
```

**Retry Strategy:**
| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 second |
| 3 | 2 seconds |
| 4 | 4 seconds |
| 5 | 8 seconds |
| 6+ | 30 seconds (max) |

**Queue Lifecycle:**
1. Request fails → saved to AsyncStorage queue
2. App periodically processes queue (every 30s or on foreground)
3. Successful requests removed from queue
4. Failed requests incremented and rescheduled
5. Idempotency ensures no double-awards even if retry succeeds late

---

## 7. Leaderboard Refresh Patterns

### Why Not Instant Refresh?

If every XP award triggered a full leaderboard refresh:
- 100 users × 10 games/day = 1,000 refreshes/day
- Each refresh = N+1 queries * M clients
- **Scales poorly**

### Batched Refresh (Global Truth)

```typescript
// useLeaderboardSnapshot.ts
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Refresh triggers:
// 1. Periodic interval (every 5 minutes)
// 2. App returns to foreground
// 3. Realtime subscription to leaderboard_refresh_events
// 4. Manual pull-to-refresh
```

### Instant Personal Updates

```typescript
// useMyLeaderboardStatus.ts
// Personal rank returned from award-xp Edge Function
// Updates immediately in profile without waiting for global refresh
```

### Pull-to-Refresh

```typescript
// leaderboard.tsx
<ScrollView
    refreshControl={
        <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
        />
    }
>
```

User can manually trigger refresh by pulling down on leaderboard.

---

## 8. Cron Jobs & Reset Schedules

### Weekly Reset (Every Monday 00:00 UTC)

```sql
-- Resets game_xp for all weekly entries
-- Keeps subscription_xp and video_like_xp (lifetime achievements)

SELECT cron.schedule(
    'weekly-leaderboard-reset',
    '0 0 * * 1',  -- Every Monday at midnight UTC
    $$SELECT reset_weekly_leaderboard()$$
);

CREATE FUNCTION reset_weekly_leaderboard() RETURNS void AS $$
BEGIN
    UPDATE leaderboard_entries
    SET game_xp = 0, updated_at = NOW()
    WHERE period_type = 'weekly';
END;
$$ LANGUAGE plpgsql;
```

### Monthly Reset (First of Each Month 00:00 UTC)

```typescript
// supabase/functions/monthly-leaderboard-reset/index.ts
// Called by pg_cron

// 1. Export current monthly leaderboard to storage
// 2. Reset monthly leaderboard entries
// 3. Clear weekly entries (fresh start for new month)
```

### Leaderboard Refresh Events (Every 5 Minutes)

```sql
SELECT cron.schedule(
    'emit-leaderboard-refresh',
    '*/5 * * * *',  -- Every 5 minutes
    $$SELECT emit_leaderboard_refresh('monthly')$$
);

CREATE FUNCTION emit_leaderboard_refresh(p_period_type TEXT) RETURNS void AS $$
BEGIN
    INSERT INTO leaderboard_refresh_events (period_type)
    VALUES (p_period_type);
END;
$$ LANGUAGE plpgsql;
```

Mobile app subscribes to this table and refreshes when new row appears.

---

## 9. Period Types

### Weekly (`period_type = 'weekly'`)

- **Resets**: Every Monday 00:00 UTC
- **Tracks**: Only `game_xp` (competitive gameplay)
- **Purpose**: Weekly competition with prizes

### Monthly (`period_type = 'monthly'`)

- **Resets**: First of each month
- **Tracks**: All XP types (game + subscription + video likes)
- **Purpose**: Long-term engagement tracking

### Profile Display

```typescript
// userService.getUserXPStats()
// Fetches BOTH entries to display:
// - weeklyXP: weekly.game_xp
// - totalXP: monthly.total_xp
```

---

## 10. Testing

### Test Files

| File | Coverage |
|------|----------|
| `__tests__/screens/LeaderboardScreen.test.tsx` | UI rendering, tab switching |
| `__tests__/hooks/useLeaderboardSnapshot.test.ts` | Snapshot fetching, staleness |
| `__tests__/hooks/useMyLeaderboardStatus.test.ts` | Personal rank |
| `__tests__/services/leaderboardService.test.ts` | Service layer |
| `__tests__/services/queue/edgeFunctionQueueService.test.ts` | Retry queue |

### Run Tests

```bash
# All leaderboard tests
npm test -- --testPathPattern="leaderboard|Leaderboard"

# Specific hook
npm test -- --testPathPattern="useLeaderboardSnapshot"
```

---

## 11. Troubleshooting

### XP Not Updating

| Symptom | Cause | Solution |
|---------|-------|----------|
| XP stuck at 0 | Idempotency key collision | Check for duplicate sessionIds |
| Profile shows wrong XP | getUserXPStats using `.single()` | Should fetch both weekly+monthly |
| Weekly = Monthly XP | Bug in query mapping | Check useLeaderboardSnapshot periodType |

### Leaderboard Not Refreshing

| Symptom | Cause | Solution |
|---------|-------|----------|
| Same data after game | Batched refresh (5 min) | Pull to refresh or wait |
| No realtime updates | Missing subscription | Check leaderboard_refresh_events sub |
| Stale after foreground | AppState listener missing | Verify useLeaderboardSnapshot setup |

### Network Failures

| Symptom | Cause | Solution |
|---------|-------|----------|
| XP lost after offline | Queue not processing | Check edgeFunctionQueueService |
| Double XP | Missing idempotency key | Always include idempotencyKey |
| Queue stuck | Max retries exceeded | Clear queue manually |

---

## Quick Reference

### Key Constants

```typescript
// Refresh intervals
REFRESH_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
STALE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 minutes

// Period types
type PeriodType = 'weekly' | 'monthly';

// Default limits
LEADERBOARD_LIMIT = 100;  // Top 100 users
```

### SQL Functions

```sql
award_xp(user_id, xp_type, amount)
  → Returns (new_total_xp, monthly_rank, weekly_rank)

reset_weekly_leaderboard()
  → Clears weekly game_xp

emit_leaderboard_refresh(period_type)
  → Signals clients to refresh
```

---

*Last Updated: December 2024*

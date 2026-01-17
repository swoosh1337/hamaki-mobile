# Implementation Plan: Hybrid Event-Driven Leaderboard

## Overview

Implement hybrid leaderboard with **minimal changes** to existing architecture. The key insight:
- **Leaderboard = derived view** (not raw mutation stream)
- **Edge Functions = authority** for XP mutations
- **Instant feedback** for current user, **periodic reconciliation** for global list
- **Realtime subscriptions to snapshots**, not raw mutations (no per-XP chaos)

**Goals:**
1. XP mutations through Edge Functions only
2. Instant personal rank feedback after games
3. Periodic global leaderboard refresh (cron + client interval)
4. Remove direct Supabase from UI screens
5. No per-XP broadcast to all clients

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     HYBRID LEADERBOARD                          │
├─────────────────────────────────────────────────────────────────┤
│  PERSONAL TRUTH (Instant)                                       │
│  - Game ends → award-xp Edge Function                           │
│  - Returns: { new_total_xp, personal_rank }                     │
│  - UI updates local state immediately                           │
├─────────────────────────────────────────────────────────────────┤
│  GLOBAL TRUTH (Batched)                                         │
│  - Cron recomputes leaderboard every 5 minutes                  │
│  - Emits ONE update to leaderboard_snapshots                    │
│  - Clients refresh on: interval + app foreground + cron event   │
│  - NO subscription to leaderboard_entries mutations             │
└─────────────────────────────────────────────────────────────────┘
```

## Current State vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| UI Supabase imports | `leaderboard.tsx`, `community.tsx` | None (hooks/services only) |
| Game XP awarding | `updateLeaderboardPoints()` direct DB | `award-xp` Edge Function |
| Leaderboard updates | Subscribe to ALL `leaderboard_entries` changes | Subscribe to snapshot refresh events |
| Personal rank | Refetch entire leaderboard | Edge Function returns `personal_rank` |
| Global list refresh | On every XP mutation (spam!) | Periodic interval + cron event |

---

## Phase 1: Create `award-xp` Edge Function

**Goal:** Single secure entry point for all XP mutations with instant rank feedback

### Files to Create:
- `supabase/functions/award-xp/index.ts`

### Request/Response:
```typescript
// Request
{ userId: string, xpType: 'game' | 'subscription' | 'video_like', amount: number }

// Response
{
  success: true,
  new_total_xp: 1280,
  personal_rank: 42,   // User's current rank (calculated server-side)
  xp_breakdown: { game: 500, subscription: 600, video_like: 180 }
}
```

**Naming Choice:** `personal_rank` instead of `estimated_rank` to avoid confusion. Users don't need to know it's eventually reconciled with the global snapshot.

### Implementation Steps:
1. Validate request (userId, xpType, amount > 0)
2. Call `award_xp()` SQL function (already exists in migration)
3. Query user's new rank: `SELECT COUNT(*) + 1 FROM leaderboard_entries WHERE total_xp > ?`
4. Return response with new_total_xp and personal_rank

### Key Benefit:
- **No client-side rank calculation**
- **No second API call to get rank**
- **UI updates instantly with server-confirmed values**

---

## Phase 2: Unified Realtime Abstraction

**Goal:** Centralize realtime subscriptions, prevent spam, proper cleanup

### Files to Create:
- `hooks/useRealtimeSubscription.ts` - Core realtime hook

### Implementation Pattern:
```typescript
interface UseRealtimeOptions<T> {
  table: string;
  schema?: string;
  filter?: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  onPayload: (payload: RealtimePayload<T>) => void;
  enabled?: boolean;
}

function useRealtimeSubscription<T>(options: UseRealtimeOptions<T>): void
```

### Features:
- Proper cleanup with `.unsubscribe()` (not deprecated `.removeChannel()`)
- Typed payloads
- Server-side filtering via `filter` param
- Enabled/disabled toggle

---

## Phase 3: Hybrid Leaderboard Hooks

**Goal:** Personal truth instant, global truth batched via snapshots

### Files to Create:
- `hooks/useMyLeaderboardStatus.ts` - Personal XP + rank (instant updates from Edge Function)
- `hooks/useLeaderboardSnapshot.ts` - Global top N (snapshot-based, batched refresh)

### Files to Modify:
- `hooks/useLeaderboard.ts` - Refactor to use new hooks internally
- `app/(tabs)/leaderboard.tsx` - Remove subscription to `leaderboard_entries`

### useMyLeaderboardStatus (Personal Truth - Immediate):
```typescript
interface MyLeaderboardStatus {
  personalRank: number | null;  // Immediate feedback from Edge Function
  myXP: { game: number; subscription: number; videoLike: number; total: number };
  updateFromAwardXP: (result: AwardXPResult) => void;  // Instant update
  refetch: () => Promise<void>;
}
```

**Note:** `personalRank` is the user's rank calculated at XP award time. It may differ slightly from snapshot until next reconciliation.

### useLeaderboardSnapshot (Global Truth - Authoritative):
```typescript
interface LeaderboardSnapshot {
  entries: LeaderboardEntry[];  // Top N only (default: 100)
  lastUpdated: Date;
  isStale: boolean;             // True if > 5 minutes old
  authoritative: true;          // This is the source of truth for rankings
  refetch: () => Promise<void>;
}
```

**Important Constraints:**
- **Snapshot size limit:** Top 100 entries max (not full table scan)
- **Authoritative flag:** Prevents future devs from incorrectly merging with personal rank
- **Mobile optimization:** Small payload, fast rendering

### Refresh Strategy (Belt + Suspenders):
1. **Periodic interval**: Refresh every 5 minutes
2. **App foreground**: Refresh when app returns from background (AppState)
3. **Snapshot events**: Subscribe to `leaderboard_refresh_events` table (cron emits)
4. **NO subscription to `leaderboard_entries`** (removes per-XP spam)

### Database: Add Refresh Events Table
```sql
CREATE TABLE leaderboard_refresh_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL,  -- 'weekly' | 'monthly' | 'all_time'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Cron job INSERTs one row every 5 minutes
-- Clients subscribe to INSERTs only
```

---

## Phase 4: Create Sponsor Service

**Goal:** Remove direct Supabase from leaderboard.tsx

### Files to Create:
- `services/supabase/sponsorService.ts`

### Implementation:
```typescript
export const sponsorService = {
  async getActiveSponsors(): Promise<Sponsor[]>,
  async getSponsorWithPrizes(sponsorId: string): Promise<SponsorWithPrizes>,
}
```

---

## Phase 5: Remove Direct Supabase from UI

**Goal:** Enforce service layer boundaries

### Files to Modify:

#### `app/(tabs)/leaderboard.tsx`
- Remove `import { supabase }`
- Use `sponsorService` for prizes
- Remove manual realtime channel management
- Use `useLeaderboardSnapshot()` instead of `useLeaderboard()`
- Use `useMyLeaderboardStatus()` for current user

#### `app/(tabs)/community.tsx`
- Remove `import { supabase }`
- Use `useRealtimeSubscription()` for posts updates
- Keep using `usePosts()` hook

---

## Phase 6: Migrate Game XP to Edge Function

**Goal:** All game XP through `award-xp` Edge Function

### Files to Modify:

#### `components/games/NoPogodGame.tsx` (lines 292-380)
Current:
```typescript
await userService.updateUserXP(userProfile.google_id, newXP);
await leaderboardService.updateLeaderboardPoints(userProfile.id, xpToAward);
```

New:
```typescript
const result = await invokeEdgeFunction<AwardXPResult>({
  functionName: 'award-xp',
  body: { userId: userProfile.id, xpType: 'game', amount: xpToAward },
  silentFail: true,
});

if (result.success) {
  // Instant personal truth update
  updateMyLeaderboardStatus(result.data);
}
```

#### `components/games/HammockJumpGame.tsx`
- Same changes as NoPogodGame

---

## Phase 7: Disable Deprecated XP Paths

**Goal:** Prevent accidental use of deprecated methods

### Files to Modify:

#### `services/supabase/leaderboardService.ts`
```typescript
/**
 * @deprecated Use award-xp Edge Function instead
 * @throws Error always - method is permanently disabled (synchronous throw)
 */
updateLeaderboardPoints(): never {
  throw new Error(
    'DEPRECATED: updateLeaderboardPoints is disabled. Use award-xp Edge Function.'
  );
}
```

**Important:** This is a **synchronous throw** (not async) and **permanent**. The method signature uses `never` return type to make TypeScript flag any code that tries to use the result. This cannot be tree-shaken away or bypassed.

---

## Phase 8: Testing

### Tests to Create:
- `__tests__/hooks/useRealtimeSubscription.test.ts`
- `__tests__/hooks/useMyLeaderboardStatus.test.ts`
- `__tests__/hooks/useLeaderboardSnapshot.test.ts`
- `__tests__/services/sponsorService.test.ts`
- `__tests__/edge-functions/awardXp.test.ts`

### Test Scenarios:
1. Realtime subscription cleanup on unmount
2. Personal rank update after game XP (optimistic update)
3. Global leaderboard batched refresh on app foreground
4. Edge Function retry + cache fallback
5. Deprecated method throws error

---

## Implementation Order (Multiple PRs)

### PR 1: `award-xp` Edge Function + Database
**Files:**
- `supabase/functions/award-xp/index.ts` (create)
- `supabase/migrations/XXXXXX_leaderboard_refresh_events.sql` (create)
- `__tests__/edge-functions/awardXp.test.ts` (create)

**Deliverable:** Edge Function that awards XP and returns `{ new_total_xp, personal_rank }`

---

### PR 2: Unified Realtime Hook
**Files:**
- `hooks/useRealtimeSubscription.ts` (create)
- `__tests__/hooks/useRealtimeSubscription.test.ts` (create)

**Deliverable:** Reusable hook with proper cleanup, typed payloads, filtering

---

### PR 3: Hybrid Leaderboard Hooks
**Files:**
- `hooks/useMyLeaderboardStatus.ts` (create)
- `hooks/useLeaderboardSnapshot.ts` (create)
- `hooks/useLeaderboard.ts` (modify - use new hooks internally)
- `__tests__/hooks/useMyLeaderboardStatus.test.ts` (create)
- `__tests__/hooks/useLeaderboardSnapshot.test.ts` (create)

**Deliverable:** Separated personal truth (instant) from global truth (batched)

---

### PR 4: Sponsor Service + Leaderboard Screen Migration
**Files:**
- `services/supabase/sponsorService.ts` (create)
- `app/(tabs)/leaderboard.tsx` (modify - remove supabase import, use new hooks)
- `__tests__/services/sponsorService.test.ts` (create)

**Deliverable:** Leaderboard screen has NO direct supabase imports

---

### PR 5: Community Screen Migration
**Files:**
- `app/(tabs)/community.tsx` (modify - remove supabase import, use `useRealtimeSubscription`)

**Deliverable:** Community screen has NO direct supabase imports

---

### PR 6: Game XP Migration + Deprecate Old Methods
**Files:**
- `components/games/NoPogodGame.tsx` (modify - use `award-xp` Edge Function)
- `components/games/HammockJumpGame.tsx` (modify - use `award-xp` Edge Function)
- `services/supabase/leaderboardService.ts` (modify - throw in `updateLeaderboardPoints`)

**Deliverable:** All game XP goes through Edge Function, deprecated method throws error

---

### PR 7: Cron Job for Leaderboard Refresh
**Files:**
- `supabase/functions/refresh-leaderboard/index.ts` (create)
- Supabase cron configuration

**Deliverable:** Cron emits refresh events every 5 minutes

---

## Critical Files Summary

### Create:
- `supabase/functions/award-xp/index.ts` - XP mutation + rank calculation
- `supabase/functions/refresh-leaderboard/index.ts` - Cron job for snapshots
- `supabase/migrations/XXXXXX_leaderboard_refresh_events.sql` - Refresh events table
- `hooks/useRealtimeSubscription.ts` - Unified realtime abstraction
- `hooks/useMyLeaderboardStatus.ts` - Personal truth (instant)
- `hooks/useLeaderboardSnapshot.ts` - Global truth (batched)
- `services/supabase/sponsorService.ts` - Sponsors/prizes service

### Modify:
- `app/(tabs)/leaderboard.tsx` - Remove supabase import, use new hooks
- `app/(tabs)/community.tsx` - Remove supabase import, use realtime hook
- `components/games/NoPogodGame.tsx` - Use `award-xp` Edge Function
- `components/games/HammockJumpGame.tsx` - Use `award-xp` Edge Function
- `services/supabase/leaderboardService.ts` - Throw in `updateLeaderboardPoints`
- `hooks/useLeaderboard.ts` - Use new hooks internally

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  GAME ENDS                                                       │
│  ↓                                                               │
│  invokeEdgeFunction('award-xp', { userId, xpType, amount })     │
│  ↓                                                               │
│  Edge Function: award_xp() SQL + rank calculation                │
│  ↓                                                               │
│  Response: { new_total_xp: 1280, personal_rank: 42 }            │
│  ↓                                                               │
│  UI: updateFromAwardXP(result) → Instant local state update     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  GLOBAL LEADERBOARD REFRESH                                      │
│  ↓                                                               │
│  Cron (every 5 min): INSERT INTO leaderboard_refresh_events     │
│  ↓                                                               │
│  Supabase Realtime: Clients receive INSERT event                 │
│  ↓                                                               │
│  useLeaderboardSnapshot: refetch() → Fresh top N list           │
│  ↓                                                               │
│  UI: Updated global leaderboard (no per-XP spam)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Behavioral Changes

| Before | After |
|--------|-------|
| Every XP mutation → all clients refetch | XP mutation → only that user's UI updates |
| Subscribe to `leaderboard_entries` | Subscribe to `leaderboard_refresh_events` |
| Client calculates rank | Server returns `personal_rank` |
| `updateLeaderboardPoints()` direct DB | `award-xp` Edge Function only |
| 2 API calls per game (XP + rank) | 1 API call per game (both in response) |
| Full table on mobile | Top 100 snapshot only |

---

## Coding Standards (from CONTRIBUTING.md)

- Use `createLogger()` for all logging
- All hooks return typed interfaces
- Services have no React dependencies
- Edge Functions use `invokeEdgeFunction()` wrapper
- Tests follow AAA pattern (Arrange, Act, Assert)
- Follow existing patterns in `__tests__/` folder

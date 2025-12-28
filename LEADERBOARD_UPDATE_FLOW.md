# Leaderboard Update Flow & Eventual Consistency

> **Last Updated:** 2025-12-28  
> **Author:** Architecture Documentation

## Overview

This document explains how the leaderboard update system works, including instant UI updates, background synchronization, and eventual consistency guarantees.

---

## Complete Flow Scenarios

### **Scenario 1: Edge Function Succeeds (Happy Path)** ✅

```
1. User finishes game (score: 500 → 50 XP)
2. Game calls invokeEdgeFunction('award-xp', { amount: 50 })
   │
   ├─> Edge Function executes atomically:
   │   ├─ Updates user XP in database
   │   ├─ Updates leaderboard_entries table
   │   └─ Returns: { new_total_xp: 150, personal_rank: 42, xp_breakdown: {...} }
   │
3. Game receives success response
4. updateUserProfile({ xp_points: 150 })           // Local user state
5. updateFromAwardXP(result.data)                   // Local leaderboard state
6. invalidateXPStatsCache()                         // Clear cache
   │
   └─> UI updates instantly ⚡
       ├─ Profile shows 150 XP
       ├─ Leaderboard shows rank #42
       └─ Weekly XP updates

RESULT: Immediate consistency (database + UI both updated)
```

---

### **Scenario 2: Edge Function Fails (Retryable - 500, 502, 503, 504)** 🔄

```
1. User finishes game (score: 500 → 50 XP)
2. Game calls invokeEdgeFunction('award-xp', { amount: 50 })
   │
   ├─> Edge Function times out / server error
   │   └─ Returns: { success: false, status: 503, error: "Service unavailable" }
   │
3. Game checks: isRetryableError(503) → TRUE
4. edgeFunctionQueueService.addToQueue({            // Add to retry queue
     id: 'xp-session123-50',
     idempotencyKey: 'user123-nopogod-session123-50',
     amount: 50,
     ...
   })
5. const newXP = userProfile.xp_points + 50         // Calculate optimistic value
6. updateUserProfile({ xp_points: newXP })          // Local user state (optimistic)
7. updateFromAwardXP({                              // Local leaderboard state (optimistic)
     new_total_xp: newXP,
     personal_rank: 0,  // Unknown - will update when queue processes
     xp_breakdown: { game: newXP, ... }
   })
   │
   └─> UI updates instantly with OPTIMISTIC data ⚡
       ├─ Profile shows 150 XP (optimistic)
       ├─ Leaderboard shows rank #0 or "updating..."
       └─ Weekly XP updates (optimistic)

BACKGROUND SYNC:
   │
   ├─> Queue processor retries every 30s
   ├─> Eventually succeeds
   ├─> Database updated with real XP + rank
   ├─> invalidateXPStatsCache() called
   │
   └─> On next app focus / profile refresh:
       └─ Rank updates from 0 → 42 (real rank)

RESULT: Eventual consistency
- Immediate: XP shown optimistically
- Later: Rank synced when queue succeeds
```

---

### **Scenario 3: Edge Function Fails (Permanent - 400, 401, 403, 404, 422)** ❌

```
1. User finishes game
2. Game calls invokeEdgeFunction('award-xp')
   │
   ├─> Edge Function rejects: { success: false, status: 403, error: "Forbidden" }
   │
3. Game checks: isRetryableError(403) → FALSE
4. log.error('Permanent error, not queuing')        // Don't retry
5. const newXP = userProfile.xp_points + 50
6. updateUserProfile({ xp_points: newXP })          // Still update locally
7. updateFromAwardXP({ new_total_xp: newXP, ... })  // Update leaderboard locally
   │
   └─> UI shows optimistic XP, but NO database update
       (User keeps XP locally, but loses it on next sync)

RESULT: Temporary inconsistency
- This is edge case (auth errors, validation errors)
- XP will be lost on next profile refresh from server
```

---

### **Scenario 4: Network Error / Exception** 🌐

```
1. User finishes game (offline or network error)
2. Game calls invokeEdgeFunction('award-xp')
   │
   ├─> Network request throws exception
   │   └─ catch (error) { ... }
   │
3. edgeFunctionQueueService.addToQueue(...)         // Queue for retry
4. const newXP = userProfile.xp_points + 50
5. updateUserProfile({ xp_points: newXP })
6. updateFromAwardXP({ new_total_xp: newXP, ... })
   │
   └─> UI updates optimistically ⚡

BACKGROUND SYNC (same as Scenario 2):
   └─> Queue retries when online
       └─> Eventually syncs to server

RESULT: Eventual consistency (same as Scenario 2)
```

---

## Eventual Consistency Mechanisms

### **1. Edge Function Queue** (Primary Sync)

**File:** `services/queue/edgeFunctionQueueService.ts`

```typescript
edgeFunctionQueueService
├─ Stores failed requests in AsyncStorage
├─ Retries every 30 seconds
├─ Uses idempotency keys to prevent duplicates
└─ Processes in background until success
```

**Key Features:**
- Persistent across app restarts (AsyncStorage)
- Automatic retry with exponential backoff
- Idempotency protection via unique keys
- Processes queue on app launch and periodically

### **2. XP Stats Cache Invalidation**

**File:** `utils/xpStatsCache.ts`

```typescript
invalidateXPStatsCache(userId)
├─ Clears 5-minute TTL cache
└─ Forces fresh fetch on next profile view
```

**Purpose:**
- Ensures profile page shows latest XP
- Cache prevents excessive database queries
- Invalidation after XP award forces refresh

### **3. Leaderboard Snapshot Refresh**

**File:** `hooks/useLeaderboardSnapshot.ts`

```typescript
useLeaderboardSnapshot
├─ Refreshes every 5 minutes (periodic)
├─ Refreshes on app foreground
├─ Refreshes on realtime events (cron job)
└─ Global truth for top 100 rankings
```

**Purpose:**
- Batched updates to prevent database spam
- Global leaderboard doesn't update per XP award
- Realtime events trigger refresh for all users

### **4. Pull-to-Refresh**

```typescript
User pulls down on profile/leaderboard
├─ Calls forceRefetch() (bypasses cache)
└─ Gets latest from server
```

**Purpose:**
- Manual sync trigger for users
- Bypasses all caches
- Immediate fresh data from database

---

## Data Flow Summary

| Layer | On Success | On Failure | Eventual Sync |
|-------|-----------|------------|---------------|
| **Database** | ✅ Updated immediately | ❌ Not updated | ✅ Queue retries |
| **Local User Profile** | ✅ Updated from server | ✅ Optimistic update | ✅ Syncs on refresh |
| **Local Leaderboard** | ✅ Real rank immediately | ⚠️ Rank=0 (optimistic) | ✅ Syncs when queue succeeds |
| **Global Leaderboard** | ⏰ 5-minute batch | ⏰ 5-minute batch | ✅ Periodic refresh |

---

## Consistency Guarantees

### 1. **Strong Consistency** (Success path)
- Database and UI updated atomically
- Real rank returned immediately
- No eventual sync needed

### 2. **Optimistic UI + Eventual Consistency** (Failure path)
- User sees XP immediately (optimistic)
- Rank shows "unknown" (0) until sync
- Background queue ensures database sync
- Cache invalidation forces refresh

### 3. **Idempotency Protection**
- Every XP award has unique key: `userId-gameId-sessionId-amount`
- Duplicate requests are safely ignored
- Queue can retry without creating duplicates
- Server validates idempotency key

### 4. **Conflict Resolution**
- **Server is source of truth**
- On next refresh, server data overwrites local optimistic data
- If queue fails permanently, XP is lost (rare edge case)
- User can pull-to-refresh to force sync

---

## Code References

### **Game Components**
- `components/games/NoPogodGame.tsx` - No Pogodi game XP award
- `components/games/HammockJumpGame.tsx` - Hammock Jump game XP award

### **Hooks**
- `hooks/useMyLeaderboardStatus.ts` - Personal rank/XP state
- `hooks/useLeaderboardSnapshot.ts` - Global leaderboard state
- `hooks/useUserProfile.ts` - User profile with XP

### **Services**
- `services/queue/edgeFunctionQueueService.ts` - Background retry queue
- `services/supabase/leaderboardService.ts` - Database queries
- `utils/edgeFunctionClient.ts` - Edge Function invocation
- `utils/xpStatsCache.ts` - XP caching logic

### **Edge Functions**
- `supabase/functions/award-xp/index.ts` - Server-side XP logic

---

## Testing

### **Unit Tests**
```bash
npm test -- --testPathPattern="useMyLeaderboardStatus.instantUpdate"
```

**Coverage:**
- ✅ Instant updates from successful Edge Function response
- ✅ Multiple consecutive updates
- ✅ Ignoring failed award results
- ✅ Integration with game XP award flow

### **Manual Testing Scenarios**

1. **Success Flow:**
   - Play game → Finish → Check leaderboard immediately
   - Expect: Instant rank update

2. **Offline Flow:**
   - Turn off WiFi → Play game → Finish
   - Expect: XP updates, rank=0
   - Turn on WiFi → Wait 30s
   - Expect: Rank updates to real value

3. **Server Error Flow:**
   - Simulate 503 error → Play game → Finish
   - Expect: XP updates optimistically
   - Background queue retries automatically

---

## Architecture Diagram

```
┌──────────────┐
│  Game Ends   │
└──────┬───────┘
       │
       ▼
┌─────────────────────┐
│ invokeEdgeFunction  │
│    ('award-xp')     │
└─────────┬───────────┘
          │
          ├─────────────────┬─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ SUCCESS │       │ RETRY   │       │ ERROR   │
    │  (2xx)  │       │ (5xx)   │       │ (4xx)   │
    └────┬────┘       └────┬────┘       └────┬────┘
         │                 │                 │
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐      ┌─────────┐
    │ Update  │      │  Queue   │      │ Update  │
    │ Profile │      │  Retry   │      │ Local   │
    │   + DB  │      │          │      │  Only   │
    └────┬────┘      └────┬─────┘      └────┬────┘
         │                │                  │
         ▼                ▼                  │
    ┌─────────────────────────────────┐     │
    │   updateFromAwardXP(result)     │◄────┘
    │  - Updates local leaderboard    │
    │  - Shows XP instantly           │
    │  - Updates rank (or 0 if unknown)│
    └─────────────────────────────────┘
                   │
                   ▼
            ┌──────────────┐
            │ UI Updated ⚡│
            └──────────────┘
                   │
                   │ (Background)
                   ▼
         ┌──────────────────────┐
         │  Queue Processes     │
         │  - Retry every 30s   │
         │  - Update database   │
         │  - Invalidate cache  │
         └──────────────────────┘
```

---

## Key Takeaways

1. **UI always updates instantly** - Users never wait for server response
2. **Optimistic updates** - Show XP immediately, sync rank later if needed
3. **Background queue** - Ensures eventual database consistency
4. **Idempotency** - Safe to retry without duplicates
5. **Server is source of truth** - Local state reconciled on refresh

---

## Future Improvements

- [ ] Add offline indicator when rank=0 (show "Syncing..." badge)
- [ ] Exponential backoff for queue retries
- [ ] Metrics/analytics for queue success rate
- [ ] WebSocket for real-time rank updates (instead of 5-min polling)
- [ ] Optimistic rank estimation (predict rank based on local XP)

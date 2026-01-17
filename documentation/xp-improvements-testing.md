# XP System Improvements - Testing Guide

This document provides instructions for testing the two XP system improvements:
1. **Global leaderboard auto-refresh after XP award**
2. **Non-retryable error handling (no optimistic updates)**

---

## 1. Global Leaderboard Auto-Refresh

### What Changed
- Created `utils/xpEvents.ts` - a simple event emitter for XP events
- Updated `hooks/useLeaderboardSnapshot.ts` to subscribe to XP events
- Updated both games (`HammockJumpGame.tsx`, `NoPogodGame.tsx`) to emit events after successful XP award

### How It Works
```
Game completes → XP awarded via Edge Function → emitXPAwarded(amount) called
                                                        ↓
                                    useLeaderboardSnapshot receives event
                                                        ↓
                                    Immediately refetches leaderboard (force=true)
```

### Testing Steps

#### Test A: Normal Flow (Happy Path)
1. Open the app and navigate to the Leaderboard tab
2. Note your current XP and rank
3. Play either game (Hammock Jump or No Pogodi) and finish with a score
4. **Expected behavior**:
   - Your personal XP updates immediately (this already worked)
   - The global leaderboard refreshes within 1-2 seconds after game over
   - You should see updated ranks in the leaderboard list
5. Check logs for: `XP awarded event received, refreshing leaderboard`

#### Test B: Console Verification
1. Enable debug logging in the app
2. Play a game and complete it
3. Look for these log messages in order:
   ```
   [HammockJumpGame] Awarded X XP for Hammock Jump game
   [XPEvents] Emitting XP awarded event
   [Hook:LeaderboardSnapshot] XP awarded event received, refreshing leaderboard
   [Hook:LeaderboardSnapshot] Fetching leaderboard snapshot (reason: xp_awarded)
   [Hook:LeaderboardSnapshot] Snapshot updated
   ```

#### Test C: Duplicate Prevention
1. Play a game but use the same session (e.g., by network issues causing retry)
2. If the server returns `duplicate: true`, the XP event should NOT be emitted
3. Leaderboard should not refresh unnecessarily

---

## 2. Non-Retryable Error Handling

### What Changed
- Previously: Both retryable AND non-retryable errors applied optimistic XP updates
- Now: Only retryable errors (network issues, 500/502/503/504) apply optimistic updates
- Non-retryable errors (400, 401, 403, 404, 422) do NOT apply optimistic updates

### Why This Matters
| Error Type | Status Codes | Should Apply Optimistic XP? | Reason |
|------------|--------------|----------------------------|--------|
| Retryable | 500, 502, 503, 504 | ✅ Yes | Will sync later via queue |
| Non-retryable | 400, 401, 403, 404, 422 | ❌ No | Will never sync - don't mislead user |

### Testing Steps

#### Test A: Simulate Retryable Error (500)
1. Use a proxy tool (Charles, mitmproxy) or modify Edge Function to return 500
2. Play a game and complete it
3. **Expected behavior**:
   - XP is added to queue for retry
   - Optimistic XP is applied locally
   - User sees their XP increase
   - Log shows: `XP award queued for retry`

#### Test B: Simulate Non-Retryable Error (400/401/403/404/422)
1. Use a proxy tool to return 401 (Unauthorized) or 400 (Bad Request)
2. Play a game and complete it
3. **Expected behavior**:
   - XP is NOT added to queue (permanent failure)
   - Optimistic XP is NOT applied locally
   - User's displayed XP stays the same
   - Log shows: `Permanent XP award failure, XP not applied`

#### Test C: Verify Using Code
To test without network manipulation, you can temporarily modify `isRetryableError`:

```typescript
// In types/edgeFunctionQueue.ts, temporarily change:
export function isRetryableError(status: number | undefined): boolean {
  // For testing non-retryable behavior, return false always:
  return false;

  // Original logic:
  // if (!status) return true;
  // return status >= 500 || status === 0 || status === 408 || status === 429;
}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `utils/xpEvents.ts` | **NEW** - XP event emitter utility |
| `hooks/useLeaderboardSnapshot.ts` | Added subscription to XP events |
| `components/games/HammockJumpGame.tsx` | Emit XP event, fix non-retryable handling |
| `components/games/NoPogodGame.tsx` | Emit XP event, fix non-retryable handling |

---

## Rollback Instructions

If issues arise:

1. **Disable XP event emission** - Comment out `emitXPAwarded()` calls in both games
2. **Revert non-retryable handling** - Move optimistic update code back outside the if-block

---

## Monitoring

After deployment, monitor these metrics:

1. **Leaderboard fetch frequency** - Should see increase right after game completions
2. **XP discrepancies** - Should decrease (fewer users with inflated local XP)
3. **Error logs** - Look for `Permanent XP award failure` entries to understand failure patterns

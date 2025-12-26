# Subscription Verification System

This document details the YouTube subscription verification system using **server-side Edge Functions**.

---

## Overview

### Purpose

Users earn XP by subscribing to 4 YouTube channels:

| Channel | XP Reward |
|---------|-----------|
| HamaKi (Main) | 1,000 XP |
| Miro | 700 XP |
| Bastos | 700 XP |
| Koro | 700 XP |

**Total Possible**: 3,100 XP

### Key Principles

1. **Zero Client-Side YouTube API Calls**: All verification via Edge Functions
2. **Gate Model**: Verified once → never auto-rechecked
3. **XP Deduplication**: Award XP only once per channel (never revoked)
4. **Early-Exit Pagination**: Stop fetching when all channels found
5. **User-Initiated**: Verification only on button press

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Mobile App                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           ChannelSubscriptionManager.tsx                 │    │
│  │  - "დაადასტურე გამოწერა" verify button                   │    │
│  │  - XP earned/available badges                            │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                              │                                   │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │           subscriptionService.ts                         │    │
│  │  - verifyAndAwardSubscriptionXP()                        │    │
│  │    → supabase.functions.invoke('verify-subscriptions')   │    │
│  │  - getSubscriptionStatuses()                              │    │
│  │    → Reads from youtube_subscription_verifications table  │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              verify-subscriptions                        │    │
│  │  1. Check DB for already-verified channels               │    │
│  │  2. Early-exit pagination for YouTube API                │    │
│  │  3. Award XP for newly verified                          │    │
│  │  4. Store results in youtube_subscription_verifications  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
└──────────────────────────────┼──────────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                      ▼
┌───────────────────────┐           ┌────────────────────────────┐
│   YouTube Data API    │           │        Supabase DB         │
│   subscriptions.list  │           │  - users.xp_points         │
│   (Server-Side Only)  │           │  - youtube_subscription_   │
│                       │           │    verifications           │
└───────────────────────┘           └────────────────────────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/verify-subscriptions/index.ts` | Edge Function |
| `services/youtube/subscriptionService.ts` | Client service (calls Edge Function) |
| `hooks/useYouTubeVerification.ts` | React hook for UI |
| `components/subscriptions/ChannelSubscriptionManager.tsx` | UI component |

---

## Edge Function: `verify-subscriptions`

### Input

```typescript
{
    channels: [
        { channelId: "UCxxx", channelKey: "hamaki" },
        { channelId: "UCyyy", channelKey: "miro" },
        // ...
    ],
    userId: "user-uuid"
}
```

### Processing Flow

1. **DB Short-Circuit**:
   ```typescript
   // Check if already verified in youtube_subscription_verifications
   for (const channel of channels) {
       const existing = await db.query(channel);
       if (existing?.subscribed && existing?.xp_awarded) {
           // Skip - already verified
           results[channel] = { ...existing, alreadyVerified: true };
       }
   }
   ```

2. **Early-Exit Pagination**:
   ```typescript
   let foundCount = 0;
   let pageToken = undefined;
   
   do {
       const response = await fetch(subscriptions.list);
       for (const sub of response.items) {
           if (targetChannelIds.includes(sub.channelId)) {
               foundChannels.add(sub.channelId);
               foundCount++;
           }
       }
       // EARLY EXIT: Stop when all channels found
       if (foundCount >= targetChannelIds.length) break;
       pageToken = response.nextPageToken;
   } while (pageToken);
   ```

3. **XP Award**:
   ```typescript
   for (const channel of newlyVerified) {
       await db.update('users', {
           xp_points: user.xp_points + channel.xpReward
       });
       await db.upsert('youtube_subscription_verifications', {
           subscribed: true,
           xp_awarded: true
       });
   }
   ```

### Output

```json
{
    "success": true,
    "results": [
        { "channelKey": "hamaki", "subscribed": true, "xpAwarded": 1000, "alreadyVerified": false },
        { "channelKey": "miro", "subscribed": true, "xpAwarded": 0, "alreadyVerified": true }
    ],
    "totalXPAwarded": 1000
}
```

---

## Gate Model

Subscriptions use a "gate" model:

| Action | Result |
|--------|--------|
| First verification (subscribed) | XP awarded, stored in DB |
| Second verification (still subscribed) | No API call, return cached |
| Unsubscribe then resubscribe | No additional XP |

**Database Constraint:**
```sql
CHECK ((subscribed = false AND xp_awarded = false) OR (subscribed = true))
```
This ensures XP is NEVER awarded for unsubscribed state.

---

## Quota Usage

| Scenario | Old (Client-Side) | New (Edge Function) |
|----------|-------------------|---------------------|
| First verification | 4-16 API calls | 1-5 API calls |
| Already verified | 4-16 API calls | **0 API calls** |
| All 4 found early | 16 API calls | **1 API call** |

---

## Mobile App Usage

```typescript
// In subscriptionService.ts
export async function verifyAndAwardSubscriptionXP(
    accessToken: string,
    userId: string
): Promise<VerifySubscriptionsResult> {
    const { data, error } = await supabase.functions.invoke('verify-subscriptions', {
        body: { channels: CHANNELS, userId },
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (error) throw error;
    return data;
}

// Get statuses (from DB, no API)
export async function getSubscriptionStatuses(userId: string): Promise<SubscriptionStatus[]> {
    const { data } = await supabase
        .from('youtube_subscription_verifications')
        .select('*')
        .eq('user_id', userId);
    return transformToStatuses(data);
}
```

---

## Background Verification & Auto-Refresh

### Overview

When a Google user logs in, background verification runs automatically. The UI needs to reflect the updated status without requiring the user to manually refresh.

### Problem Solved

**Issue**: Background verification in `AuthContext` updates the database, but the `useYouTubeVerification` hook maintains its own React state which becomes stale.

**Solution**: A lightweight version-based polling mechanism that:
1. Detects when background verification completes
2. Auto-refreshes the hook state from DB
3. Stops polling after first update (since verification only runs once per login)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AuthContext (Login)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           performBackgroundChecks()                      │    │
│  │  1. areAllChannelsVerified() - skip if already done      │    │
│  │  2. verifyAndAwardSubscriptionXP() - call Edge Function  │    │
│  │  3. incrementDataVersion() - signal update               │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼ AsyncStorage: version++
┌─────────────────────────────────────────────────────────────────┐
│                useYouTubeVerification Hook                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Poll every 2s (setInterval)                             │    │
│  │  - getDataVersion() from AsyncStorage                    │    │
│  │  - If version > lastKnown → loadCachedData() + STOP     │    │
│  │  - Magic Link users: skip polling entirely               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `services/youtube/verificationDataVersion.ts` | Version tracking service |
| `contexts/AuthContext.tsx` | Calls `incrementDataVersion()` after verification |
| `hooks/useYouTubeVerification.ts` | Polls for version changes |

### Key Functions

```typescript
// verificationDataVersion.ts
export async function getDataVersion(): Promise<number>
export async function incrementDataVersion(): Promise<number>
export async function hasNewerData(lastKnown: number): Promise<boolean>
```

### Polling Behavior

| Condition | Behavior |
|-----------|----------|
| Google user | Poll every 2s until version change |
| Magic Link user | No polling (no verification needed) |
| Version change detected | Load data from DB, STOP polling |
| Component unmount | Clear interval |

### Why This Approach?

1. **Lightweight**: Only reads a number from AsyncStorage (~1ms)
2. **No network overhead**: AsyncStorage is local storage
3. **Self-stopping**: Stops after first update (verification runs once)
4. **Clean separation**: AuthContext doesn't need to know about hooks

---

## UI Caching & Performance Optimization

### Overview

The Settings Modal uses cached data instead of forcing a fresh verification on every open, improving performance and user experience.

### Previous Behavior (Inefficient)

```typescript
// ❌ OLD: Forced refresh on every modal open
useEffect(() => {
    if (visible && authMethod === 'google') {
        refreshAll(); // Triggered DB queries every time
    }
}, [visible, authMethod, refreshAll]);
```

**Problems:**
- Database queries on every modal open
- Unnecessary network overhead
- Slower UI response
- Wasted resources for unchanged data

### Current Behavior (Optimized)

```typescript
// ✅ NEW: Use cached data from hook
const { pendingActionCount, subscriptionStatuses, videoLikeStatuses } = useYouTubeVerification();

// Hook automatically:
// 1. Loads cached data on mount (from DB, fast)
// 2. Polls for background updates via version tracking
// 3. Updates UI automatically when data changes
```

**Benefits:**
- **Instant UI**: Shows cached data immediately
- **No redundant queries**: Data loaded once on mount
- **Auto-updates**: Polling detects background changes
- **Better UX**: Faster modal open, responsive UI

### How It Works

1. **On App Launch**: `useYouTubeVerification` hook mounts and loads data from database
2. **Background Polling**: Hook polls `verificationDataVersion` every 2 seconds
3. **Settings Modal Opens**: Uses already-loaded data from hook (instant)
4. **Background Verification Completes**: Version increments, hook detects change and refreshes
5. **Polling Stops**: After first update (verification only runs once per login)

### Cache Storage Layers

| Layer | Purpose | TTL |
|-------|---------|-----|
| `verificationCacheService` | AsyncStorage cache for subscriptions/videos | 7 days (subs), 24h (videos) |
| `useYouTubeVerification` React state | In-memory state for UI | Session (cleared on unmount) |
| Database (`youtube_subscription_verifications`) | Source of truth | Permanent |

### Files

| File | Purpose |
|------|---------|
| `services/youtube/verificationCacheService.ts` | AsyncStorage caching with TTL |
| `hooks/useYouTubeVerification.ts` | React state management + polling |
| `components/ui/SettingsModal.tsx` | Consumes cached data from hook |

### Cache Invalidation

```typescript
// Automatic invalidation
- Background verification completes → incrementDataVersion()
- Hook detects version change → loadCachedData()
- UI updates automatically

// Manual invalidation
- User clicks verify button → verifySubscriptions() or verifyVideoLikes()
- Fresh data fetched → cache updated → UI refreshed
```

### Performance Metrics

| Action | Before (with refreshAll) | After (with caching) |
|--------|--------------------------|----------------------|
| Open Settings Modal | ~500ms (DB query) | ~50ms (React state) |
| Background updates | Manual refresh required | Auto-detected (2s poll) |
| API calls on modal open | 1-2 Edge Function calls | 0 calls |

---

## Testing

```bash
npm test -- --testPathPattern="subscriptionService"
npm test -- --testPathPattern="verificationDataVersion"
npm test -- --testPathPattern="subscriptionVerificationFlow"
npm test -- --testPathPattern="subscriptionServiceEdgeCases"
npm test -- --testPathPattern="videoLikeServiceEdgeCases"
```

### Test Cases

**Core Functionality:**
- ✅ First verification awards XP
- ✅ Already verified returns cached (0 API calls)
- ✅ Early exit when all channels found
- ✅ XP never revoked on unsubscribe
- ✅ Version increment triggers hook refresh
- ✅ Polling stops after first version change
- ✅ Magic Link users skip polling

**Edge Cases:**
- ✅ Empty/whitespace access tokens rejected
- ✅ Edge Function errors handled gracefully
- ✅ Database errors fallback to empty state
- ✅ XP calculations for partial subscriptions
- ✅ Leaderboard update failures don't block verification
- ✅ Concurrent requests handled correctly
- ✅ Mixed already-verified and new channels
- ✅ Missing/null video IDs handled
- ✅ Token trimming before API calls

**Caching:**
- ✅ Settings modal uses cached data (no forced refresh)
- ✅ Hook automatically loads data on mount
- ✅ Background updates detected via polling
- ✅ Cache invalidation on manual verification

---

*Last Updated: December 2024*

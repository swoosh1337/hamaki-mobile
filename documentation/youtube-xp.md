# YouTube XP System

This document provides comprehensive documentation for the YouTube XP verification system, which awards XP to users for subscribing to YouTube channels and liking videos.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Files & Structure](#3-files--structure)
4. [Type Definitions](#4-type-definitions)
5. [Services](#5-services)
6. [React Hook](#6-react-hook)
7. [UI Components](#7-ui-components)
8. [XP Deduplication Logic](#8-xp-deduplication-logic)
9. [Caching Strategy](#9-caching-strategy)
10. [Verification Flows](#10-verification-flows)
11. [Database Schema](#11-database-schema)
12. [Testing](#12-testing)
13. [Edge Cases](#13-edge-cases)

---

## 1. Overview

### Purpose
The YouTube XP system rewards users for engaging with HamaKi-related YouTube channels. Users can earn XP by:

- **Subscribing to channels**: 1000 XP for HamaKi, 700 XP for each secondary channel
- **Liking latest videos**: 200 XP for HamaKi videos, 100 XP for secondary channel videos

### Key Principles

1. **Manual-Only Verification**: All XP checks are user-initiated from Settings to comply with YouTube API policies
2. **XP Deduplication**: XP is awarded only ONCE per action (per channel subscription, per video ID)
3. **No XP Revocation**: Once XP is awarded, it is never taken back (even if user unsubscribes)
4. **Smart Caching**: Minimize YouTube API calls with 7-day subscription cache and 24-hour video ID cache
5. **Graceful Degradation**: API errors don't affect existing XP or crash the app

### Channels

| Channel Key | Channel Name | Subscription XP | Video Like XP |
|-------------|--------------|-----------------|---------------|
| `hamaki` | HamaKi | 1,000 | 200 |
| `miro` | MiroMask | 700 | 100 |
| `bastos` | ბასტოს | 700 | 100 |
| `koro` | კორო | 700 | 100 |

**Total Possible XP**: 3,100 (subscriptions) + 500 (video likes) = **3,600 XP**

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                     │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐      │
│  │  ChannelSubscriptionManager │    │     VideoLikesManager       │      │
│  │  - Displays subscription    │    │  - Displays video like      │      │
│  │    status per channel       │    │    status per channel       │      │
│  │  - "Verify" button          │    │  - Video thumbnails         │      │
│  │  - Last verified timestamp  │    │  - "New video!" badges      │      │
│  └─────────────────────────────┘    └─────────────────────────────┘      │
│                └────────────────────────────────────┘                     │
│                                    │                                      │
└────────────────────────────────────┼──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            React Hook Layer                               │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                   useYouTubeVerification()                      │      │
│  │  - subscriptionStatuses: SubscriptionStatus[]                   │      │
│  │  - videoLikeStatuses: VideoLikeStatus[]                         │      │
│  │  - isVerifyingSubscriptions, isVerifyingVideoLikes              │      │
│  │  - verifySubscriptions(), verifyVideoLikes()                    │      │
│  │  - pendingActionCount (for badges)                              │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                    │                                      │
└────────────────────────────────────┼──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Service Layer                                  │
│  ┌────────────────────────────┐    ┌────────────────────────────┐        │
│  │    subscriptionService     │    │     videoLikeService       │        │
│  │  - checkAllChannelSubs()   │    │  - checkAllVideoLikes()    │        │
│  │  - verifyAndAwardSubXP()   │    │  - verifyAndAwardVideoXP() │        │
│  │  - getEarnedSubXP()        │    │  - getCachedVideoStatuses()│        │
│  └─────────────┬──────────────┘    └──────────────┬─────────────┘        │
│                │                                   │                      │
│                └──────────────┬───────────────────┘                      │
│                               ▼                                           │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                 verificationCacheService                        │      │
│  │  - getCache() / saveCache()                                     │      │
│  │  - getCachedSubscription() / updateSubscriptionStatus()         │      │
│  │  - getCachedVideo() / updateVideoCache()                        │      │
│  │  - needsFullSubscriptionCheck() (7-day TTL)                     │      │
│  │  - isVideoIdCacheValid() (24-hour TTL)                          │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                    │                                      │
└────────────────────────────────────┼──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          External Services                                │
│  ┌────────────────────────┐    ┌────────────────────────────────┐        │
│  │   YouTube Data API     │    │          Supabase              │        │
│  │  - subscriptions.list  │    │  - users table                 │        │
│  │  - videos.getRating    │    │    - subscription_xp_awarded   │        │
│  │  - search.list         │    │    - video_like_xp_awarded     │        │
│  └────────────────────────┘    │    - xp_points                 │        │
│                                └────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Local Storage                                    │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                      AsyncStorage                               │      │
│  │  Key: @hamaki_verification_cache                                │      │
│  │  - subscriptions: { statuses: {...}, lastFullCheck: timestamp } │      │
│  │  - videos: { videos: {...} }                                    │      │
│  └────────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Files & Structure

```
/types/
  └── youtube.ts           # All type definitions

/services/youtube/
  ├── subscriptionService.ts      # Subscription verification & XP
  ├── videoLikeService.ts         # Video like verification & XP
  └── verificationCacheService.ts # AsyncStorage caching

/hooks/
  └── useYouTubeVerification.ts   # React hook for UI

/components/subscriptions/
  ├── ChannelSubscriptionManager.tsx  # Subscription UI
  └── VideoLikesManager.tsx           # Video likes UI

/components/ui/
  └── SettingsModal.tsx           # Settings with badge count
```

---

## 4. Type Definitions

### `types/youtube.ts`

```typescript
// Channel identifier (4 supported channels)
type ChannelKey = 'hamaki' | 'miro' | 'bastos' | 'koro';

// Channel configuration
interface YouTubeChannel {
    id: string;           // YouTube channel ID
    name: string;         // Display name
    handle: string;       // @handle for URL
}

// Subscription status for a channel
interface SubscriptionStatus {
    channelKey: ChannelKey;
    channelName: string;
    isSubscribed: boolean;
    xpReward: number;
    xpAwarded: boolean;      // True if XP already given
    lastChecked: number;     // Timestamp of last API check
}

// Video like status for a channel
interface VideoLikeStatus {
    channelKey: ChannelKey;
    channelName: string;
    latestVideoId: string | null;
    videoTitle: string | null;
    videoThumbnail?: string;
    isLiked: boolean;
    xpReward: number;
    xpAwarded: boolean;      // True if XP for THIS video given
    lastChecked: number;
}

// Result from verification operations
interface VerifySubscriptionsResult {
    success: boolean;
    statuses: SubscriptionStatus[];
    totalXPAwarded: number;
    errors: string[];
}

interface VerifyVideoLikesResult {
    success: boolean;
    statuses: VideoLikeStatus[];
    totalXPAwarded: number;
    errors: string[];
}

// Database stored data
interface SubscriptionXPAwarded {
    hamaki: boolean;
    miro: boolean;
    bastos: boolean;
    koro: boolean;
}

// Video likes are tracked per VIDEO ID (not per channel)
interface VideoLikeXPAwarded {
    [videoId: string]: boolean;  // e.g., { "dQw4w9WgXcQ": true }
}
```

### Constants

```typescript
// XP Rewards
const SUBSCRIPTION_XP = {
    hamaki: 1000,
    miro: 700,
    bastos: 700,
    koro: 700,
};

const VIDEO_LIKE_XP = {
    hamaki: 200,
    miro: 100,
    bastos: 100,
    koro: 100,
};

// Cache TTL
const SUBSCRIPTION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days
const VIDEO_CACHE_TTL = 24 * 60 * 60 * 1000;             // 24 hours
```

---

## 5. Services

### Subscription Service (`subscriptionService.ts`)

#### `checkAllChannelSubscriptions(accessToken: string)`
Checks if user is subscribed to all 4 channels.

**API Used**: `subscriptions.list` (1 unit per channel = 4 units)

**Returns**: `Record<ChannelKey, boolean>`

```typescript
const subs = await checkAllChannelSubscriptions(token);
// { hamaki: true, miro: true, bastos: false, koro: false }
```

#### `verifyAndAwardSubscriptionXP(accessToken, userId, googleId, forceRefresh)`
Main verification function. Checks subscriptions and awards XP.

**Flow**:
1. Check cache validity (7-day TTL)
2. If cache valid and !forceRefresh, use cached data
3. Otherwise, make API calls to check subscriptions
4. For each subscribed channel where xpAwarded=false:
   - Add XP to user's total
   - Set xpAwarded=true in database
5. Update cache with new statuses
6. Return result with total XP awarded

**Returns**: `VerifySubscriptionsResult`

```typescript
const result = await verifyAndAwardSubscriptionXP(token, 'user-123', 'google-456', false);
// { success: true, statuses: [...], totalXPAwarded: 1700, errors: [] }
```

### Video Like Service (`videoLikeService.ts`)

#### `getLatestVideo(channelId, channelKey, forceRefresh)`
Gets the latest video from a channel.

**API Used**: `search.list` (100 units per call)

**Caching**: Results cached for 24 hours to minimize expensive search API calls.

#### `checkVideoLike(accessToken, videoId)`
Checks if user has liked a specific video.

**API Used**: `videos.getRating` (1 unit per call)

**Returns**: `boolean`

#### `verifyAndAwardVideoLikeXP(accessToken, userId)`
Main verification function for video likes.

**Flow**:
1. Get latest video for each channel (from cache or API)
2. Check if user liked each video
3. For each liked video where xpAwarded=false for THAT video ID:
   - Add XP to user's total
   - Mark video ID as awarded in database
4. Return result

**Key Difference from Subscriptions**: XP is tracked per VIDEO ID, not per channel. When a new video is released, user can earn XP again by liking it.

### Cache Service (`verificationCacheService.ts`)

#### Storage Structure
```typescript
interface VerificationCache {
    subscriptions: {
        statuses: Partial<Record<ChannelKey, {...}>>;
        lastFullCheck: number;  // Timestamp
    };
    videos: {
        videos: Partial<Record<ChannelKey, {
            videoId: string;
            title: string;
            thumbnail?: string;
            cachedAt: number;
        }>>;
    };
    lastUpdated: number;
}
```

#### Key Methods

| Method | Purpose |
|--------|---------|
| `getCache()` | Load cache from AsyncStorage |
| `saveCache()` | Save cache to AsyncStorage |
| `needsFullSubscriptionCheck()` | Check if 7-day TTL expired |
| `isVideoIdCacheValid()` | Check if 24-hour TTL expired |
| `updateSubscriptionStatus()` | Update single channel status |
| `updateVideoCache()` | Update video cache for channel |
| `invalidateCache()` | Clear all cached data |

---

## 6. React Hook

### `useYouTubeVerification()`

Central hook that manages all YouTube verification state for UI components.

```typescript
const {
    // Subscription state
    subscriptionStatuses,      // SubscriptionStatus[]
    isVerifyingSubscriptions,  // boolean
    subscriptionError,         // string | null
    
    // Video like state
    videoLikeStatuses,         // VideoLikeStatus[]
    isVerifyingVideoLikes,     // boolean
    videoLikeError,            // string | null
    
    // Actions
    verifySubscriptions,       // () => Promise<VerifySubscriptionsResult>
    verifyVideoLikes,          // () => Promise<VerifyVideoLikesResult>
    refreshAll,                // () => Promise<void>
    
    // Computed
    pendingActionCount,        // number (for badge display)
    lastVerified,              // number (timestamp)
} = useYouTubeVerification();
```

#### Pending Action Count
Calculated as:
```typescript
pendingActionCount = 
    subscriptionStatuses.filter(s => s.isSubscribed && !s.xpAwarded).length +
    videoLikeStatuses.filter(s => s.isLiked && !s.xpAwarded).length;
```

This powers the badge in Settings showing how many XP rewards are available.

---

## 7. UI Components

### ChannelSubscriptionManager

Displays subscription status for all 4 channels.

**Features**:
- Shows subscription status (✓ Subscribed / Not Subscribed)
- Shows XP earned or available per channel
- "Verify Subscription" button
- "Last verified" timestamp
- Opens YouTube channel when tapped

**Usage**:
```tsx
<ChannelSubscriptionManager />
```

### VideoLikesManager

Displays video like status for all 4 channels.

**Features**:
- Shows latest video thumbnail per channel
- "New video!" badge when new video available
- Like status indicator
- "Check Likes" button
- Opens video in YouTube when tapped

### SettingsModal (Badge Integration)

Shows red badge on "Channel Subscriptions" and "Like Latest Videos" cards when there are pending XP rewards.

```tsx
{pendingSubscriptions > 0 && (
    <View style={styles.badge}>
        <Text style={styles.badgeText}>{pendingSubscriptions}</Text>
    </View>
)}
```

---

## 8. XP Deduplication Logic

### Subscription XP Deduplication

**Problem**: User could subscribe, get XP, unsubscribe, resubscribe, get XP again.

**Solution**: Track `subscription_xp_awarded` per channel in database.

```typescript
// Database structure
subscription_xp_awarded: {
    hamaki: true,   // XP given, NEVER reset
    miro: true,
    bastos: false,  // Not yet subscribed
    koro: false
}
```

**Rules**:
1. XP awarded only when `isSubscribed=true` AND `xpAwarded=false`
2. Once `xpAwarded=true`, it stays true forever
3. Unsubscribing does NOT reset the flag
4. Resubscribing does NOT trigger new XP

### Video Like XP Deduplication

**Problem**: User could like, get XP, unlike, like again.

**Solution**: Track XP per VIDEO ID (not per channel).

```typescript
// Database structure
video_like_xp_awarded: {
    "dQw4w9WgXcQ": true,  // Old HamaKi video - XP given
    "abc123xyz": true,    // Old Miro video - XP given
}
```

**Rules**:
1. XP awarded only when `isLiked=true` AND `xpAwarded=false` for THAT video ID
2. New video = new opportunity (different video ID)
3. Unlike → re-like same video = no new XP

---

## 9. Caching Strategy

### Subscription Cache (7-day TTL)

```
Cache Valid?
    ├── YES → Return cached statuses (0 API calls)
    └── NO → Make API calls (4 units)
                └── Update cache
```

**Why 7 days?** Subscription status rarely changes. Weekly verification is sufficient.

### Video ID Cache (24-hour TTL)

```
Cache Valid per Channel?
    ├── YES → Use cached video ID (1 API call for rating)
    └── NO → Fetch latest video (100 units)
                 └── Update cache
                 └── Check rating (1 unit)
```

**Why 24 hours?** New videos are released periodically. Daily check catches new content while minimizing expensive search API calls.

### API Quota Optimization

| Scenario | Before | After |
|----------|--------|-------|
| App resume (background check) | ~509 units | 0 units |
| Daily heavy user | ~10,180 units | <100 units |
| Weekly verification | - | ~20-108 units |

---

## 10. Verification Flows

### Flow 1: User Taps "Verify Subscription"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User opens Settings → Channel Subscriptions                   │
│    └── ChannelSubscriptionManager renders                        │
│    └── useYouTubeVerification() initializes                      │
│                                                                  │
│ 2. User taps "Verify Subscription"                               │
│    └── verifySubscriptions() called                              │
│    └── isVerifyingSubscriptions = true                           │
│                                                                  │
│ 3. Service checks each channel                                   │
│    └── subscriptionService.verifyAndAwardSubscriptionXP()        │
│    └── Uses cache if valid (7-day TTL)                           │
│    └── Otherwise makes YouTube API calls                         │
│                                                                  │
│ 4. For each subscribed channel:                                  │
│    └── Check if xpAwarded=false                                  │
│    └── If false: Award XP, set xpAwarded=true in DB              │
│                                                                  │
│ 5. Update UI                                                     │
│    └── subscriptionStatuses updated                              │
│    └── isVerifyingSubscriptions = false                          │
│    └── Toast: "Earned 1000 XP!" (if any XP awarded)              │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: User Taps "Check Likes"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User opens Settings → Like Latest Videos                      │
│    └── VideoLikesManager renders                                 │
│    └── Shows cached video thumbnails                             │
│                                                                  │
│ 2. User taps "Check Likes"                                       │
│    └── verifyVideoLikes() called                                 │
│                                                                  │
│ 3. For each channel:                                             │
│    └── Get latest video (cache or API)                           │
│    └── Check if user liked video (API)                           │
│                                                                  │
│ 4. For each liked video:                                         │
│    └── Check if xpAwarded[videoId]=false                         │
│    └── If false: Award XP, set xpAwarded[videoId]=true           │
│                                                                  │
│ 5. Update UI                                                     │
│    └── videoLikeStatuses updated                                 │
│    └── "New video!" badge clears if liked                        │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3: Login Background Check

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User logs in with Google OAuth                                │
│    └── AuthContext.signIn() succeeds                             │
│                                                                  │
│ 2. Background check triggered (non-blocking)                     │
│    └── performBackgroundChecks() in AuthContext                  │
│    └── verifyAndAwardSubscriptionXP() called                     │
│                                                                  │
│ 3. Subscription verified silently                                │
│    └── XP awarded if applicable                                  │
│    └── Notification sent if subscribed/not subscribed            │
│                                                                  │
│ 4. User profile refreshed                                        │
│    └── Updated XP shown in profile                               │
└─────────────────────────────────────────────────────────────────┘

NOTE: Video likes are NOT checked on login - manual only from Settings.
```

---

## 11. Database Schema

### `users` Table

```sql
-- Subscription XP tracking (per channel, never reset)
subscription_xp_awarded JSONB DEFAULT '{"hamaki":false,"miro":false,"bastos":false,"koro":false}'

-- Video XP tracking (per video ID)
video_like_xp_awarded JSONB DEFAULT '{}'

-- Total XP
xp_points INTEGER DEFAULT 0
```

### Example Data

```json
{
    "subscription_xp_awarded": {
        "hamaki": true,
        "miro": true,
        "bastos": false,
        "koro": false
    },
    "video_like_xp_awarded": {
        "dQw4w9WgXcQ": true,
        "abc123xyz": true,
        "newVideo456": false
    },
    "xp_points": 2400
}
```

---

## 12. Testing

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `__tests__/services/youtube/verificationCacheService.test.ts` | 15 | Cache TTL, storage, invalidation |
| `__tests__/services/youtube/subscriptionService.test.ts` | 11 | XP awarding, deduplication |
| `__tests__/services/youtube/videoLikeService.test.ts` | 11 | Video likes, per-video XP |

### Run Tests

```bash
# Run all YouTube tests
npm test -- --testPathPattern="youtube"

# Run specific test file
npm test -- __tests__/services/youtube/subscriptionService.test.ts
```

### Test Coverage Areas

- ✅ Cache TTL validation (7-day and 24-hour)
- ✅ XP deduplication (subscribe/unsubscribe/subscribe)
- ✅ XP deduplication (like/unlike/like)
- ✅ New video = new XP opportunity
- ✅ API error handling (no XP revocation)
- ✅ Partial failure handling (continue with other channels)
- ✅ Database interaction mocking

---

## 13. Edge Cases

### Handled Edge Cases

| Scenario | Behavior |
|----------|----------|
| Subscribe → Unsubscribe → Subscribe | No duplicate XP (xpAwarded stays true) |
| Like → Unlike → Like same video | No duplicate XP (videoId marked as awarded) |
| New video released | New XP opportunity (different videoId) |
| API quota exceeded | Graceful error, no XP revocation |
| Network timeout | Error shown, retry available |
| User without YouTube scope | Feature hidden in Settings |
| Demo user | Skip YouTube features entirely |
| Multiple devices | XP stored in database, syncs across devices |

### API Error Behavior

1. **Never revoke XP**: If API fails, existing XP is preserved
2. **Continue checking**: If one channel fails, others still checked
3. **Cache fallback**: If API fails but cache exists, use cached data
4. **User notification**: Show error message with retry option

---

## Summary

The YouTube XP system provides a robust, cache-optimized way to reward users for YouTube engagement while respecting API quotas and ensuring XP integrity through deduplication logic.

**Key Takeaways**:
- All verification is user-initiated (Settings)
- XP is awarded once per action and never revoked
- Smart caching reduces API usage by 95%+
- Comprehensive test coverage ensures reliability

---

*Last Updated: December 2024*

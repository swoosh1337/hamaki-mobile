# Supabase Edge Functions

This document describes the Edge Functions used in the Hamaki mobile app for server-side YouTube verification.

---

## Overview

Edge Functions run on Supabase's Deno runtime and handle all YouTube API calls server-side, eliminating client-side API usage and providing predictable quota management.

### Core Principle

> **The client never talks to YouTube. The server decides what is "latest". The database is the source of truth.**

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       Mobile App                                   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  supabase.functions.invoke('verify-subscriptions', {...})   │   │
│  │  supabase.functions.invoke('verify-video-likes', {...})     │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                   Supabase Edge Functions                          │
│  ┌────────────────┐   ┌────────────────┐   ┌──────────────────┐   │
│  │ sync-youtube-  │   │    verify-     │   │   verify-video-  │   │
│  │    videos      │   │ subscriptions  │   │      likes       │   │
│  │  (Cron: 4h)    │   │ (User-init)    │   │  (User-init)     │   │
│  └───────┬────────┘   └───────┬────────┘   └────────┬─────────┘   │
│          │                    │                     │              │
│          └────────────────────┴─────────────────────┘              │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │
                               ▼
                   ┌───────────────────────┐
                   │   YouTube Data API    │
                   │    (Server-side)      │
                   └───────────────────────┘
```

---

## Edge Functions

### 1. `sync-youtube-videos`

**Purpose:** Sync latest videos from YouTube channels to database.

**Trigger:** Postgres cron (every 4 hours)

**Path:** `supabase/functions/sync-youtube-videos/index.ts`

**Input:**
```typescript
// No input needed - called via cron
POST /functions/v1/sync-youtube-videos
Authorization: Bearer {SERVICE_ROLE_KEY}
```

**Behavior:**
1. Iterate configured channels (hamaki, miro, bastos, koro)
2. Call YouTube `search.list` for each channel
3. Compare with existing `latest_video_id` in `youtube_channel_state`
4. Upsert if new video found

**Output:**
```json
{
    "success": true,
    "results": {
        "hamaki": { "videoId": "abc123", "status": "updated" },
        "miro": { "videoId": "xyz789", "status": "unchanged" }
    }
}
```

**Quota:** ~100 units per channel × 4 = ~400 units per run

---

### 2. `verify-subscriptions`

**Purpose:** Verify user's YouTube subscriptions and award XP.

**Trigger:** User-initiated (button press)

**Path:** `supabase/functions/verify-subscriptions/index.ts`

**Input:**
```typescript
POST /functions/v1/verify-subscriptions
Authorization: Bearer {USER_OAUTH_TOKEN}
Content-Type: application/json

{
    "channels": [
        { "channelId": "UCxxx", "channelKey": "hamaki" },
        { "channelId": "UCyyy", "channelKey": "miro" }
    ],
    "userId": "user-uuid"
}
```

**Behavior:**
1. **DB Short-Circuit:** Check `youtube_subscription_verifications` table first
   - If already verified → return immediately (0 API calls)
2. **Early-Exit Pagination:** Check user's subscriptions
   - Stop as soon as all required channels found
3. **Award XP:** For newly verified subscriptions
4. **Store Results:** Upsert to `youtube_subscription_verifications`

**Output:**
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

**Quota:** 1-5 units (with early-exit)

---

### 3. `verify-video-likes`

**Purpose:** Verify user has liked specific videos and award XP.

**Trigger:** User-initiated (button press)

**Path:** `supabase/functions/verify-video-likes/index.ts`

**Input:**
```typescript
POST /functions/v1/verify-video-likes
Authorization: Bearer {USER_OAUTH_TOKEN}
Content-Type: application/json

{
    "videos": [
        { "videoId": "video-123", "channelKey": "hamaki" },
        { "videoId": "video-456", "channelKey": "miro" }
    ],
    "userId": "user-uuid"
}
```

**Behavior:**
1. Check user's existing `video_like_xp_awarded` in DB
2. Filter out already-awarded videos
3. Batch call YouTube `videos.getRating` (1 API unit total)
4. Award XP for newly liked videos
5. Update `video_like_xp_awarded` in users table

**Output:**
```json
{
    "success": true,
    "results": [
        { "videoId": "video-123", "channelKey": "hamaki", "liked": true, "xpAwarded": 200 },
        { "videoId": "video-456", "channelKey": "miro", "liked": false, "xpAwarded": 0 }
    ],
    "totalXPAwarded": 200
}
```

**Quota:** 1 unit (batched)

---

## Deployment

### Deploy All Functions

```bash
supabase functions deploy
```

### Deploy Single Function

```bash
supabase functions deploy verify-subscriptions
```

### Set Environment Variables

```bash
supabase secrets set YOUTUBE_API_KEY=your-api-key
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |

---

## Calling from Mobile App

```typescript
import { supabase } from '@/services/supabase';

// Verify subscriptions
const { data, error } = await supabase.functions.invoke('verify-subscriptions', {
    body: { channels, userId },
    headers: { Authorization: `Bearer ${userAccessToken}` },
});

if (error) throw error;
console.log('XP awarded:', data.totalXPAwarded);
```

---

## Quota Summary

| Function | Trigger | Quota |
|----------|---------|-------|
| `sync-youtube-videos` | Cron (4h) | ~400/run = ~2,400/day |
| `verify-subscriptions` | User press | 1-5 units |
| `verify-video-likes` | User press | 1 unit |

**Total daily quota:** ~2,400 (cron) + ~10-50 (user actions) = **predictable & bounded**

---

## Verification Rules

### Subscriptions (Gate Model)

- Verified once → never auto-rechecked
- XP awarded once, never revoked
- Manual re-verification available

### Video Likes (Signal Model)

- Can be re-verified per video
- XP per unique video ID
- New video = new XP opportunity

---

*Last Updated: December 2024*

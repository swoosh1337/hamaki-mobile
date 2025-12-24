# YouTube XP System

Documentation for the YouTube XP verification system using **server-side Edge Functions**.

---

## Overview

### Purpose

Users earn XP by engaging with YouTube channels:

| Action | HamaKi | Miro | Bastos | Koro |
|--------|--------|------|--------|------|
| Subscribe | 1,000 XP | 700 XP | 700 XP | 700 XP |
| Like video | 200 XP | 100 XP | 100 XP | 100 XP |

**Total Possible**: 3,100 (subscriptions) + 500 (video likes) = **3,600 XP**

### Key Principles

1. **Zero Client-Side YouTube API Calls**: All verification via Edge Functions
2. **User-Initiated**: Only on button press (Settings → Verify)
3. **XP Deduplication**: Award once per action, never revoked
4. **Database-Driven**: Videos from `youtube_channel_state` table
5. **Gate vs Signal**:
   - **Subscriptions (Gate)**: Verified once → never auto-rechecked
   - **Video Likes (Signal)**: New video = new XP opportunity

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Mobile App                                 │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                         UI Layer                           │    │
│  │  ┌─────────────────────┐    ┌─────────────────────────┐   │    │
│  │  │ ChannelSubscription │    │   VideoLikesManager     │   │    │
│  │  │      Manager        │    │   (shows video from DB) │   │    │
│  │  └──────────┬──────────┘    └────────────┬────────────┘   │    │
│  │             │                            │                 │    │
│  │  ┌──────────▼────────────────────────────▼────────────┐   │    │
│  │  │             useYouTubeVerification()                │   │    │
│  │  └──────────────────────────┬──────────────────────────┘   │    │
│  └─────────────────────────────┼──────────────────────────────┘    │
│                                │                                    │
│  ┌─────────────────────────────▼──────────────────────────────┐    │
│  │                       Service Layer                         │    │
│  │  subscriptionService.ts  │  videoLikeService.ts             │    │
│  │  ↓ invoke Edge Function  │  ↓ invoke Edge Function          │    │
│  │  ↓ read from DB          │  ↓ read videos from DB           │    │
│  └─────────────────────────────┬──────────────────────────────┘    │
└────────────────────────────────┼───────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                   Supabase Edge Functions                          │
│  ┌────────────────────┐      ┌────────────────────────┐           │
│  │ verify-subscriptions│      │   verify-video-likes   │           │
│  │ - Early-exit paging│      │   - Batch getRating    │           │
│  │ - Gate model       │      │   - Signal model       │           │
│  └─────────┬──────────┘      └───────────┬────────────┘           │
│            └──────────────┬──────────────┘                         │
│                           ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                     YouTube Data API                        │   │
│  │              (Server-Side Only, Never Client)               │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/verify-subscriptions/` | Subscription Edge Function |
| `supabase/functions/verify-video-likes/` | Video likes Edge Function |
| `supabase/functions/sync-youtube-videos/` | Cron: sync latest videos |
| `services/youtube/subscriptionService.ts` | Client subscription service |
| `services/youtube/videoLikeService.ts` | Client video like service |
| `services/supabase/channelStateService.ts` | Read video data from DB |
| `hooks/useYouTubeVerification.ts` | React hook |

---

## Subscription Verification

### Flow

```
User clicks "Verify"
        │
        ▼
┌──────────────────────────────┐
│ subscriptionService.         │
│ verifyAndAwardSubscriptionXP │
│ → invoke('verify-subs')      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Edge Function:               │
│ 1. Check DB for existing     │←─ DB short-circuit
│ 2. Call YouTube if needed    │←─ Early-exit pagination
│ 3. Award XP, update DB       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Updated:                     │
│ - users.xp_points            │
│ - youtube_subscription_      │
│   verifications              │
│ - leaderboard_entries        │
└──────────────────────────────┘
```

### Gate Model

| Scenario | API Calls | XP |
|----------|-----------|-----|
| First verify (subscribed) | 1-5 | ✅ Awarded |
| Second verify | 0 | Already awarded |
| Unsubscribe → resubscribe | 0 | Already awarded |

---

## Video Like Verification

### Flow

```
User clicks "Check Likes"
        │
        ▼
┌──────────────────────────────┐
│ videoLikeService.            │
│ verifyAndAwardVideoLikeXP    │
│ → Get videos from DB         │
│ → invoke('verify-video-likes')│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Edge Function:               │
│ 1. Check already awarded     │
│ 2. Batch getRating call      │←─ 1 API unit total
│ 3. Award XP for liked videos │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Updated:                     │
│ - users.xp_points            │
│ - users.video_like_xp_awarded│
└──────────────────────────────┘
```

### Signal Model

| Scenario | XP |
|----------|-----|
| Like video A | ✅ 200 XP |
| Like video A again | Already awarded |
| New video B released, like it | ✅ 200 XP |

XP tracked per VIDEO ID, not per channel.

---

## Database Schema

### `users.subscription_xp_awarded`

```json
{
    "hamaki": true,   // XP claimed - NEVER reset
    "miro": false,
    "bastos": true,
    "koro": false
}
```

### `users.video_like_xp_awarded`

```json
{
    "videoId123": true,
    "videoId456": true
}
```

### `youtube_subscription_verifications`

```sql
-- Per-user, per-channel verification state
(user_id, channel_id) PRIMARY KEY
subscribed BOOLEAN
xp_awarded BOOLEAN

-- Constraint: Cannot award XP if not subscribed
CHECK ((subscribed=false AND xp_awarded=false) OR subscribed=true)
```

---

## Quota Usage

| Action | Units |
|--------|-------|
| sync-youtube-videos (cron 4h) | ~400/run |
| verify-subscriptions (user) | 0-5 |
| verify-video-likes (user) | 1 |

**Daily total**: ~2,400 (cron) + ~50 (users) = **bounded & predictable**

---

## Testing

```bash
# All YouTube tests
npm test -- --testPathPattern="youtube"

# Specific services
npm test -- --testPathPattern="subscriptionService|videoLikeService"
```

---

*Last Updated: December 2024*

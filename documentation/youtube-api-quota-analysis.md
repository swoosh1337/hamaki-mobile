# YouTube API Quota Analysis

## Overview

This document explains when YouTube API calls are made, quota costs, and daily usage estimates.

**YouTube Free Tier:** 10,000 units/day

---

## API Endpoints Used

| Endpoint | Quota Cost | Used By |
|----------|-----------|---------|
| `subscriptions.list` | 1 unit/call | verify-subscriptions |
| `videos.getRating` | 1 unit/call | verify-video-likes |
| `search.list` | 100 units/call | sync-youtube-videos |

---

## 1. Subscription Verification (`verify-subscriptions`)

### When It Runs

| Trigger | Condition | Frequency |
|---------|-----------|-----------|
| **Login** | After Remember Me modal, background | Once per login |
| **App Resume** | Only if 24+ hours since last check | Max once/day |
| **Manual Button** | User clicks "დაადასტურე გამოწერა" | User-initiated |
| **Profile Screen** | When screen focused (Google users) | On navigation |

### Short-Circuit Logic (0 API calls)

```
IF all 4 channels have:
   subscribed = true AND xp_awarded = true
THEN
   Return cached data → 0 API calls
```

### API Call Details

```
GET /youtube/v3/subscriptions
  ?part=snippet
  ?mine=true
  ?maxResults=50
  ?pageToken={optional}
```

### Quota Cost Per User

| Scenario | API Calls | Quota Units |
|----------|-----------|-------------|
| All channels already verified | 0 | **0 units** |
| User has <50 subscriptions | 1 | **1 unit** |
| User has 50-100 subscriptions | 2 | **2 units** |
| User has 100-200 subscriptions | 3-4 | **3-4 units** |
| Heavy subscriber (500+) | 10+ | **10+ units** |

**Optimization:** Early-exit pagination stops as soon as all 4 channels found.

### Daily Cost Per User

| User Type | Checks/Day | Quota/Day |
|-----------|------------|-----------|
| New user (first login) | 1 | 1-4 units |
| Returning user (all verified) | 0 | **0 units** |
| Active user (app resume) | 0-1 | 0-2 units |

**Average:** ~0.5 units/user/day (most users already verified)

---

## 2. Video Like Verification (`verify-video-likes`)

### When It Runs

| Trigger | Condition | Frequency |
|---------|-----------|-----------|
| **Manual Button** | User clicks "დაადასტურე ლაიქები" | User-initiated only |
| **Never automatic** | No background checks | - |

### Short-Circuit Logic (0 API calls)

```
IF all videos in user.video_like_xp_awarded have xpAwarded = true
THEN
   Return cached data → 0 API calls
```

### API Call Details

```
GET /youtube/v3/videos/getRating
  ?id=VIDEO1,VIDEO2,VIDEO3,VIDEO4
```

**Key:** Batches ALL videos in single call (up to 50 videos).

### Quota Cost Per User

| Scenario | API Calls | Quota Units |
|----------|-----------|-------------|
| All videos already verified | 0 | **0 units** |
| 1-50 videos to check | 1 | **1 unit** |

**Always 1 unit max** (or 0 if cached).

### Daily Cost Per User

| User Type | Checks/Day | Quota/Day |
|-----------|------------|-----------|
| User who verified all likes | 0 | **0 units** |
| User checking new video | 0-1 | 0-1 units |

**Average:** ~0.1 units/user/day (user-initiated, most already verified)

---

## 3. Video Sync (`sync-youtube-videos`)

### When It Runs

| Trigger | Condition | Frequency |
|---------|-----------|-----------|
| **pg_cron** | Server scheduled | Every 4 hours |

**NOT user-initiated** - This is a server background job.

### API Call Details

```
GET /youtube/v3/search
  ?channelId={channelId}
  ?part=snippet
  ?order=date
  ?maxResults=1
  ?type=video
```

### Quota Cost (Fixed)

| Channels | Calls/Sync | Quota/Sync | Syncs/Day | Daily Total |
|----------|------------|------------|-----------|-------------|
| 4 channels | 4 | 400 units | 6 | **2,400 units** |

**This is fixed cost regardless of user count.**

---

## Total Daily Quota Usage

### Fixed Costs (Server)

| Function | Daily Quota |
|----------|-------------|
| sync-youtube-videos | 2,400 units |
| **Subtotal** | **2,400 units** |

### Variable Costs (Per User)

| Function | Avg Quota/User/Day |
|----------|-------------------|
| verify-subscriptions | ~0.5 units |
| verify-video-likes | ~0.1 units |
| **Subtotal** | **~0.6 units/user/day** |

### Scaling Estimates

| Daily Active Users | User Quota | Fixed Quota | Total | % of 10K |
|-------------------|------------|-------------|-------|----------|
| 100 | 60 | 2,400 | 2,460 | **25%** |
| 500 | 300 | 2,400 | 2,700 | **27%** |
| 1,000 | 600 | 2,400 | 3,000 | **30%** |
| 5,000 | 3,000 | 2,400 | 5,400 | **54%** |
| 10,000 | 6,000 | 2,400 | 8,400 | **84%** |
| 12,500+ | 7,500+ | 2,400 | 10,000+ | **100%+** ⚠️ |

**Break-even:** ~12,500 DAU before hitting quota limit.

---

## Why Current Architecture Is Efficient

### 1. Aggressive Caching

| Cache | TTL | Saves |
|-------|-----|-------|
| Subscription verification | Permanent (once verified) | ~99% of repeat checks |
| Video like verification | Permanent (once awarded) | ~99% of repeat checks |
| 24-hour verification window | 24 hours | ~95% of app resume checks |

### 2. DB Short-Circuit

```
BEFORE calling YouTube API:
├─ Check youtube_subscription_verifications table
├─ Check user.video_like_xp_awarded JSONB
└─ If already verified → return immediately (0 API calls)
```

### 3. Batch API Calls

- `videos.getRating` accepts comma-separated video IDs
- All 4 videos checked in **1 API call** instead of 4

### 4. Early-Exit Pagination

- `subscriptions.list` stops pagination when all channels found
- User with 1000 subscriptions but channels in first page = 1 API call

### 5. User-Initiated Only

- Video like verification **never runs automatically**
- Subscription verification limited to login + 24-hour intervals

---

## Per-User Lifecycle Quota Cost

### New User (First Day)

| Action | Quota |
|--------|-------|
| Login → subscription verification | 1-4 units |
| Manual subscription verify (if needed) | 0-2 units |
| Manual video like verify | 1 unit |
| **Total first day** | **2-7 units** |

### Returning User (Verified)

| Action | Quota |
|--------|-------|
| App resume (24h+ gap) | 0-2 units |
| Profile screen focus | 0 units (cached) |
| Settings modal | 0 units (cached) |
| **Total per day** | **0-2 units** |

### Monthly Cost Per User

| User Type | Monthly Quota |
|-----------|---------------|
| New user (first month) | ~10-20 units |
| Active verified user | ~5-15 units |
| Inactive user | 0 units |

---

## Recommendations

### Current State: Good

Your architecture is well-optimized for the free tier:
- Fixed cost: 2,400/day (24%)
- Variable cost: ~0.6/user/day
- Safe up to ~12,500 DAU

### If You Exceed Quota

**Option 1: Reduce sync frequency**
```
Every 4 hours → Every 6 hours
2,400 units → 1,600 units/day
Saves 800 units (more headroom for users)
```

**Option 2: Increase YouTube API quota**
- Apply for quota increase (free, requires justification)
- Or upgrade to paid tier

**Option 3: Remove one channel from sync**
```
4 channels → 3 channels
400 units/sync → 300 units/sync
Saves 600 units/day
```

---

## Summary

| Metric | Value |
|--------|-------|
| Daily fixed cost | 2,400 units (24%) |
| Per-user cost (avg) | ~0.6 units/day |
| Safe DAU capacity | ~12,500 users |
| Free tier limit | 10,000 units/day |

**Verdict:** Current architecture is efficient and scales well within free tier limits.

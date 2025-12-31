# Video Likes Verification - Known Issue & Fix Plan

## Issue

Users see "No recent video found" for all 4 channels when opening the Video Likes screen, despite showing "0 / 500 XP" available.

## Root Cause

1. **Initial load only reads cache** - `getCachedVideoStatuses()` doesn't fetch from YouTube API
2. **Cache is empty** for new users or after 24h TTL expires
3. **API call only happens** when user presses "გადამოწმება" (Check) button
4. **If API fails** (missing API key, quota exceeded) → shows "No recent video found"

## Current Flow

```
User opens screen
  → loadCachedData()
    → getCachedVideoStatuses()
      → Cache empty → returns latestVideoId: null
        → UI shows "No recent video found"
```

## Fix Plan (Option A - Recommended)

### Auto-fetch on screen open

Add `useEffect` in `VideoLikesManager.tsx` to auto-verify when cache is empty:

```typescript
useEffect(() => {
  // If all videos are missing (cache empty), auto-fetch
  if (videoLikeStatuses.every(s => !s.latestVideoId)) {
    verifyVideoLikes();
  }
}, []);
```

### Better error handling

In `videoLikeService.ts`, improve `getLatestVideo`:
- Log warning when `EXPO_PUBLIC_YOUTUBE_API_KEY` is empty
- Return descriptive errors instead of silent null

## Alternative Options

### Option B: Show "Press Check to Load" State
Instead of "No recent video found", show a CTA button.

### Option C: Server-Side Video Caching
Store video IDs in Supabase, updated by cron job.

## Verification Before Fix

1. Check if `EXPO_PUBLIC_YOUTUBE_API_KEY` is set in `.env`
2. Verify API key has YouTube Data API v3 enabled
3. Check API quota hasn't been exceeded

## Files to Modify

- `components/subscriptions/VideoLikesManager.tsx` - Add auto-fetch useEffect
- `services/youtube/videoLikeService.ts` - Better error logging

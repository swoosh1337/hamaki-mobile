# Push Notification System

This document details the push notification system for new video notifications.

---

## Overview

### Purpose

The notification system alerts users when new videos are uploaded to any of the 4 monitored YouTube channels.

### Key Principles

1. **Server-Sent**: Notifications triggered by Edge Function (not client polling)
2. **Works When App Closed**: Uses Expo Push Service via APNs/FCM
3. **Batched**: 500 notifications/batch with 2-min delays (respects Expo limits)
4. **Token Cleanup**: Auto-removes invalid tokens (uninstalled apps)
5. **No First-Time Spam**: New users get existing videos silently initialized

---

## Architecture

```
sync-youtube-videos (cron every 4h)
          │
          │ Finds new video
          ▼
┌─────────────────────────────────┐
│ send-new-video-notification    │
│ Edge Function                   │
│ 1. Query users with push tokens │
│ 2. Batch in groups of 500       │
│ 3. Send via Expo Push API       │
│ 4. Clear invalid tokens         │
└────────────────────┬────────────┘
                     │
                     ▼
┌─────────────────────────────────┐
│       Expo Push Service         │
│  (APNs for iOS, FCM for Android)│
└────────────────────┬────────────┘
                     │
                     ▼
    User's phone (even if app closed)
```

---

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/send-new-video-notification/` | Edge Function for push |
| `supabase/functions/sync-youtube-videos/` | Triggers notifications |
| `utils/notifications.ts` | Token registration & saving |
| `contexts/AuthContext.tsx` | Saves token on login |

---

## Push Token Flow

### On Login

```typescript
// In AuthContext.tsx
registerForPushNotificationsAsync().then(async (token) => {
    if (token && userId) {
        await savePushTokenToDatabase(userId, token);
    }
});
```

### Database Storage

```sql
-- users table
expo_push_token TEXT,           -- Expo push token
push_notifications_enabled BOOLEAN DEFAULT true
```

---

## Batching Strategy

Since Expo Push has a **600 notifications/minute** limit:

```typescript
const BATCH_SIZE = 500;  // Stay under 600 limit
const BATCH_DELAY_MS = 2 * 60 * 1000;  // 2 minutes
```

| Users | Batches | Total Time |
|-------|---------|------------|
| 500 | 1 | Instant |
| 1,000 | 2 | ~2 min |
| 2,000 | 4 | ~6 min |
| 5,000 | 10 | ~18 min |

---

## Token Invalidation

Invalid tokens are automatically cleared:

```typescript
if (ticket.details?.error === 'DeviceNotRegistered') {
    // User uninstalled app - clear token
    await supabase
        .from('users')
        .update({ expo_push_token: null })
        .in('expo_push_token', invalidTokens);
}
```

| Error | Meaning | Action |
|-------|---------|--------|
| `DeviceNotRegistered` | App uninstalled | Clear token |
| `InvalidCredentials` | Invalid Expo credentials | Log error |
| `MessageRateExceeded` | Over quota | Retry with delay |

---

## Notification Content

```typescript
{
    to: user.expo_push_token,
    title: '🎬 ახალი ვიდეო დაიდოოო!',
    body: videoTitle,
    data: {
        videoId,
        channelKey,
        channelName,
        type: 'new_video',
    },
    sound: 'default',
}
```

---

## First-Time User Handling

When a new user logs in, `KNOWN_VIDEOS_KEY` is empty. The system:
1. Stores all current videos as "known" silently
2. Does NOT send notifications for existing videos
3. Only future new videos trigger notifications

---

## Comparison: Old vs New

| Aspect | Old (Polling) | New (Server-Sent) |
|--------|---------------|-------------------|
| Trigger | App foreground every 15 min | Edge Function on new video |
| App closed | ❌ No notifications | ✅ Push delivered by OS |
| Battery | Constant polling | On-demand only |
| Latency | Up to 15 min delay | Near-instant |

---

## Testing

```bash
# Run notification tests
npm test -- --testPathPattern="notifications"
```

---

*Last Updated: December 2024*

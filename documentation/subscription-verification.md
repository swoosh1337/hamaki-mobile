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

## Testing

```bash
npm test -- --testPathPattern="subscriptionService"
```

### Test Cases

- ✅ First verification awards XP
- ✅ Already verified returns cached (0 API calls)
- ✅ Early exit when all channels found
- ✅ XP never revoked on unsubscribe

---

*Last Updated: December 2024*

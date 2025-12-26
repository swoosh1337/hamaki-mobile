# YouTube API Quota Analysis

This document analyzes YouTube API quota usage for the subscription/video verification system and provides optimization strategies for scaling.

---

## YouTube API Quota Costs

| Endpoint | Cost per Call | Used For |
|----------|---------------|----------|
| `subscriptions.list` | **1 unit** | Checking channel subscriptions |
| `videos.getRating` | **1 unit** | Checking if user liked a video |
| `search.list` | **100 units** | Getting latest video from each channel |

**Daily Quota Limit:** 10,000 units/day (free tier)

---

## Current Usage Per Verification

### Subscription Check
| Scenario | API Calls | Units |
|----------|-----------|-------|
| Best case (all 4 channels in first page) | 1 | **1 unit** |
| Average (~100 subscriptions) | 2 | **2 units** |
| Heavy subscriber (500+ subs) | 10+ | **10+ units** |
| Cache hit (7-day TTL) | 0 | **0 units** |

### Video Likes Check
| Step | Calls | Units |
|------|-------|-------|
| Fetch latest videos (4 channels) | 4 | **400 units** |
| Check likes (4 videos) | 4 | **4 units** |
| **Total (no cache)** | 8 | **~404 units** |
| **With video cache (24h)** | 4 | **4 units** |

---

## Realistic Daily Usage

| User Type | Daily Units | Notes |
|-----------|-------------|-------|
| Light (1x/week) | ~8/day avg | Cache miss on search.list |
| Regular (1x/day) | 4-6/day | Videos cached, only getRating |
| Heavy (3x/day) | ~12/day | Multiple like checks |

---

## Scalability Estimate

With **10,000 units/day**:

| Scenario | Max Active Users/Day |
|----------|---------------------|
| Worst case (all hit search.list) | ~25 users |
| Cached (only getRating calls) | 1,600-2,500 users |
| **Realistic mix** | **500-1,000 users** |

---

## Current Optimizations ✅

1. **7-day subscription cache** - Reduces sub checks by ~85%
2. **24-hour video ID cache** - Reduces expensive search.list by ~95%
3. **Bulk fetch with early termination** - 1 API call instead of 4
4. **User-initiated only** - No automatic polling

---

## Future Optimization Ideas 🚀

### High Impact

#### 1. Server-Side Video ID Caching
Pre-fetch video IDs on backend (once per hour for all channels). Users only make `getRating` calls.
- **Saves:** 400 units per user per day
- **Implementation:** Supabase Edge Function + cron job

#### 2. Webhook for New Videos (YouTube Push Notifications)
Subscribe to YouTube's PubSubHubbub for real-time video notifications instead of polling.
- **Saves:** All search.list calls
- **Cost:** Free (push-based)
- **Complexity:** Medium (requires public webhook endpoint)

#### 3. Increase Video Cache TTL
Extend video ID cache from 24h to 72h. Users don't need real-time latest video data.
- **Saves:** 66% of search.list calls
- **Implementation:** 1 line change

### Medium Impact

#### 4. Batch Video Rating Checks
The `videos.getRating` endpoint supports multiple video IDs in one call.
```
GET /videos/getRating?id=VIDEO1,VIDEO2,VIDEO3,VIDEO4
```
- **Saves:** 3 units per verification (4 calls → 1 call)

#### 5. Rate Limiting Per User
Limit verifications to max 3x per day per user client-side.
- **Saves:** Prevents abuse
- **Implementation:** Local storage counter

#### 6. Subscription Change Detection
Only re-check subscriptions if user explicitly requests it, not on every app open.
- Already implemented ✅ (user-initiated)

### Low Impact / Future

#### 7. Apply for Higher Quota
Request quota increase from Google Cloud Console (requires justification).
- **Potential:** 100,000+ units/day

#### 8. Multiple API Keys
Rotate between multiple project API keys to multiply quota.
- **Risk:** Violates ToS if detected

#### 9. Proxy Through Backend
All API calls go through your backend which has its own quota.
- **Benefit:** Better rate limiting, centralized caching
- **Cost:** Backend infrastructure

---

## Recommended Next Steps

1. **Immediate:** Increase video cache TTL to 48-72h (1 line change)
2. **Short-term:** Implement batched getRating (4 calls → 1 call)
3. **Medium-term:** Server-side video ID fetching with Edge Function
4. **Long-term:** YouTube PubSubHubbub for real-time updates

---

## Monitoring

Consider tracking:
- API calls per user per day
- Cache hit ratio
- Quota usage alerts at 50%, 80%, 100%

# Hamaki Edge Functions: Complete Analysis

## Overview

You have **6 edge functions** in your Supabase backend:

| Function | Type | Purpose |
|----------|------|---------|
| `award-xp` | Client-invoked | XP mutations with idempotency + rank calculation |
| `verify-subscriptions` | Client-invoked | YouTube subscription verification + XP |
| `verify-video-likes` | Client-invoked | YouTube video like verification + XP |
| `sync-youtube-videos` | System (pg_cron) | Background video sync every 4 hours |
| `monthly-leaderboard-reset` | Admin | Monthly leaderboard export + reset |
| `send-new-video-notification` | System (triggered) | Push notifications for new videos |

---

## Rate Limiting & Abuse Prevention

Client-invoked edge functions should enforce per-user and per-IP limits to prevent abuse and protect external API quotas. Use a short window limit plus exponential backoff guidance for clients; if the limit is hit, return a 429 and instruct the client to retry with increasing delays. Where possible, add a cache/short-circuit before any external API call.

**Recommendations (client-invoked):**
- `award-xp`: 30 requests/min per user; 10 requests/min per IP for anonymous/unauthenticated traffic.
- `verify-subscriptions`: 5 requests/min per user; 2 requests/min per IP for anonymous/unauthenticated traffic.
- `verify-video-likes`: 10 requests/min per user; 3 requests/min per IP for anonymous/unauthenticated traffic.
- All endpoints: check idempotency (`edge_idempotency_keys`) before doing work; if a key is already present, return cached result and do not count toward the external API quota.

**External API quota protection:**
- `verify-subscriptions` and `verify-video-likes` must short-circuit on existing verification data to avoid unnecessary YouTube API calls.
- Cache successful verification responses for a short TTL to handle rapid retries without extra API hits.

**Enforcement points and monitoring:**
- Enforce rate limits in edge function middleware or an API gateway layer (e.g., per-user + per-IP buckets).
- Add monitoring/alerting on spikes (429 rates, per-IP bursts, YouTube API error rates) to detect abuse early.

## Edge Function Details

### 1. `award-xp` - XP Mutation Gateway

**Purpose:** Single secure entry point for ALL XP mutations

**What it does:**
- Validates XP award requests (userId, xpType, amount)
- Database-backed idempotency via `edge_idempotency_keys` table
- Calls `award_xp()` SQL function (service-role only)
- Calculates personal rank server-side
- Returns XP breakdown (game, subscription, video_like)

**Invoked from:** Games (NoPogod, HammockJump), Queue service

**Why server-side is REQUIRED:**
- Idempotency must be enforced at database level (distributed edge instances)
- Rank calculation requires consistent view of all users
- Prevents client forging XP awards
- RLS blocks direct leaderboard mutations

---

### 2. `verify-subscriptions` - YouTube Channel Verification

**Purpose:** Verify YouTube channel subscriptions and award XP

**What it does:**
- DB short-circuit: Already verified → returns immediately (0 API calls)
- Calls YouTube Subscriptions API with user's OAuth token
- Early-exit pagination (stops when all channels found)
- Awards XP once per channel (never revoked)
- Updates both monthly and weekly leaderboards

**Channels:** HamaKi (1000 XP), Miro/Bastos/Koro (700 XP each)

---

### 3. `verify-video-likes` - Video Like Verification

**Purpose:** Verify if user liked specific YouTube videos

**What it does:**
- Batch check via YouTube `videos.getRating` API (1 API call)
- Awards XP per video (once per video)
- Tracks awarded likes in `users.video_like_xp_awarded` JSONB

**XP:** hamaki (200 XP), miro/bastos/koro (100 XP each)

---

### 4. `sync-youtube-videos` - Background Video Sync

**Purpose:** Server-side sync of latest videos from YouTube channels

**What it does:**
- Runs via pg_cron every 4 hours
- Fetches from YouTube `search.list` API
- Updates `youtube_channel_state` table
- Creates/updates `content_posts` for home carousel
- Triggers push notifications for new videos

---

### 5. `monthly-leaderboard-reset` - Monthly Reset

**Purpose:** Export leaderboard snapshot and reset game XP

**What it does:**
- Exports leaderboard to CSV with SHA-256 checksum
- Uploads to Supabase Storage
- Resets `game_xp` only (subscription/video XP permanent)
- Supports dry-run mode

---

### 6. `send-new-video-notification` - Push Notifications

**Purpose:** Broadcast push notifications when new video uploaded

**What it does:**
- Batches notifications (500 per batch, 2-min delays)
- Respects Expo Push API rate limits
- Clears invalid tokens from database

---

## Current Retry & Mitigation Strategies

### Three-Layer Retry System

```
Layer 1: Edge Function Client (immediate retries)
    ↓ fail
Layer 2: Queue Service (persistent queue)
    ↓ fail
Layer 3: AsyncStorage (survives app restart)
```

### Layer 1: Edge Function Client

**Location:** `utils/edgeFunctionClient.ts`

| Setting | Value |
|---------|-------|
| Max retries | 5 attempts |
| Backoff | Exponential: 1s → 2s → 4s → 8s → 16s → 32s cap |
| Cache TTL | 5 minutes |
| Silent fail | Returns error instead of throwing |

### Layer 2: Queue Service

**Location:** `services/queue/edgeFunctionQueueService.ts`

**Error Classification:**
```
PERMANENT (discard immediately):     RETRYABLE (queue for later):
├─ 400 Bad Request                   ├─ 5xx Server errors
├─ 401 Unauthorized                  ├─ 429 Rate limit
├─ 403 Forbidden                     └─ 0/undefined (network failure)
├─ 404 Not Found
└─ 422 Validation failed
```

**Queue Processing:**
- XP items: Sequential per-user (lock mechanism prevents race conditions)
- Verification items: 3 parallel max
- Processes on app foreground

### Layer 3: Idempotency System

**Key format:** `award-xp:{userId}:{gameId}:{sessionId}:{amount}`

**Enforcement:**
1. In-memory deduplication (local queue check)
2. Database `edge_idempotency_keys` table (server check)
3. Returns `{duplicate: true}` if already processed

### Optimistic XP Display

```typescript
const displayXP = serverXP + optimisticXPDelta;
// optimisticXPDelta = sum of pending XP in queue
// When queue empty, delta = 0 (automatically reconciled)
```

---

## Can Edge Functions Be Replaced?

### Summary

| Function | Replace? | Reason |
|----------|----------|--------|
| `award-xp` | **NO** | Idempotency + rank require server |
| `verify-subscriptions` | **PARTIAL** | Client could call YouTube API |
| `verify-video-likes` | **PARTIAL** | Client could call YouTube API |
| `sync-youtube-videos` | **NO** | Background cron, requires API key |
| `monthly-leaderboard-reset` | **NO** | Admin operation |
| `send-new-video-notification` | **NO** | Broadcast, requires Expo credentials |

### Why `award-xp` MUST Stay Server-Side

1. **Idempotency** - Database-level deduplication across distributed instances
2. **Security** - RLS blocks direct leaderboard mutations:
   ```sql
   SELECT TO authenticated USING (true)  -- Read only
   ALL TO service_role USING (true)      -- Server writes only
   ```
3. **Rank calculation** - Requires consistent view of ALL users
4. **Prevents cheating** - Client cannot forge XP awards

**If you tried client-side:**
- Users could forge XP awards
- Race conditions in rank calculation
- Duplicate XP on network retries

### Where Hybrid Could Work

**verify-subscriptions / verify-video-likes:**

Current:
```
Client → Edge Function → YouTube API → Database
```

Possible hybrid:
```
Client → YouTube API (with user's token)
       ↓
Client → Edge Function (results only) → Validate + Award XP
```

**Benefit:** Reduces edge function compute, faster response
**Risk:** Client could lie about results (need server validation)
**Verdict:** Current architecture is fine. DB short-circuit already optimizes.

---

## Alternative Architectures Evaluated

### Option 1: Keep Current Architecture ✅ RECOMMENDED

**Pros:**
- Battle-tested retry system
- Production-grade idempotency
- Offline-first with optimistic UI
- Security through RLS + service_role

**Cons:**
- Edge function cold starts (~500ms)
- Network dependency for XP mutations

**Verdict:** Best fit for your use case.

---

### Option 2: Direct Supabase Client ❌ NOT RECOMMENDED

**What it means:** Remove edge functions, use `supabase.from()` directly

**Would require:**
- Relax RLS policies (security risk)
- Client-side rank calculation (inconsistent)
- Client-side idempotency (unreliable)

**Verdict:** NOT RECOMMENDED. Loses security + consistency.

---

### Option 3: PostgreSQL Functions via RPC ⚠️ PARTIAL FIT

**What it means:** Replace edge functions with PostgreSQL functions

```typescript
const { data } = await supabase.rpc('award_xp_secure', {
  p_user_id: userId,
  p_amount: amount,
  p_idempotency_key: key
});
```

**Pros:**
- No cold starts
- Lower latency

**Cons:**
- Can't call external APIs (YouTube) from PostgreSQL
- Still need edge functions for YouTube verification

**Verdict:** Could work for `award-xp` alone, but doesn't eliminate all edge functions.

---

### Option 4: Combine YouTube Functions ⚠️ MINOR OPTIMIZATION

Merge `verify-subscriptions` + `verify-video-likes` into single `verify-youtube`:
- Single OAuth flow
- Combined API calls
- Less code to maintain

**Verdict:** Nice-to-have, not critical.

---

## The Error You Saw

```
Edge Function award-xp failed after retries: Failed to send a request
```

**Cause:** Network connectivity issue to Supabase (local network, Supabase outage, or cold start timeout)

**Your current mitigation handles this:**
1. Failed call → queued for retry ✅
2. Optimistic XP shown immediately ✅
3. Retry on app foreground ✅
4. Reconciliation when network restored ✅

**The error is logged but the system recovers automatically.**

---

## Final Recommendation

**Keep your current architecture.** It's well-designed:

1. **Three-layer retry** - Client → Queue → Persistence
2. **Database-backed idempotency** - Prevents duplicate XP
3. **Optimistic UI** - Good UX during network issues
4. **Smart error classification** - Only retries what can succeed
5. **Security** - RLS + service_role protects data integrity

The only consideration: If cold start latency becomes an issue, you could:
- Move `award-xp` to a PostgreSQL function (no YouTube dependency)
- Use Supabase Edge Function warming (paid feature)

But for your current scale, the existing architecture is appropriate.

---

## Key Files

**Edge Functions:**
- `supabase/functions/award-xp/index.ts`
- `supabase/functions/verify-subscriptions/index.ts`
- `supabase/functions/verify-video-likes/index.ts`
- `supabase/functions/sync-youtube-videos/index.ts`
- `supabase/functions/monthly-leaderboard-reset/index.ts`
- `supabase/functions/send-new-video-notification/index.ts`

**Client Integration:**
- `utils/edgeFunctionClient.ts` - Retry wrapper
- `services/queue/edgeFunctionQueueService.ts` - Persistent queue
- `hooks/useEdgeFunctionQueue.ts` - React hook
- `types/edgeFunctionQueue.ts` - Types + idempotency helpers

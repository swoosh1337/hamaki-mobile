# Edge Function Client

Unified wrapper for Supabase Edge Function calls with **retry**, **exponential backoff**, and **cache fallback**.

---

## Overview

### Purpose

Ensure Edge Function calls are resilient to network failures:
- **Retry with backoff**: 3 attempts (1s → 2s → 4s delay)
- **Cache fallback**: Return cached/DB data when all retries fail
- **Silent degradation**: Log warning, don't crash app

### Key Principles

1. **Never crash**: Always return a result (success or fallback)
2. **Transparent caching**: Auto-cache successful responses
3. **Graceful degradation**: Use DB data when network fails
4. **Unified interface**: Single wrapper for all Edge Functions

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile App Service                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              invokeEdgeFunction<T>()                     │    │
│  │  1. Try Edge Function call                               │    │
│  │  2. Retry 3 times with exponential backoff              │    │
│  │  3. On success: cache result                             │    │
│  │  4. On failure: try cache → try fallback → silent fail   │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└──────────────────────────────┼──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │  Edge    │         │  Async   │         │  Custom  │
   │ Function │         │  Storage │         │ Fallback │
   │          │         │  Cache   │         │ Function │
   └──────────┘         └──────────┘         └──────────┘
```

---

## Usage

### Basic Usage

```typescript
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';

const result = await invokeEdgeFunction<MyResponseType>({
  functionName: 'verify-subscriptions',
  body: { userId, channels },
});

if (result.success) {
  console.log(result.data); // MyResponseType
} else {
  console.warn('Edge function failed:', result.error);
}
```

### With Cache Fallback

```typescript
const result = await invokeEdgeFunction<SubscriptionResult>({
  functionName: 'verify-subscriptions',
  body: { userId },
  cacheKey: `subscriptions:${userId}`,   // Cache key for storage
  cacheTTL: 5 * 60 * 1000,               // 5 minute TTL
  cacheFallback: async () => {
    // Called if cache is empty and Edge Function fails
    return await getSubscriptionStatusesFromDB(userId);
  },
  maxRetries: 3,
  silentFail: true,
});
```

---

## API Reference

### `invokeEdgeFunction<T>(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `functionName` | `string` | **required** | Edge Function name |
| `body` | `object` | **required** | Request body |
| `headers` | `object` | `{}` | Additional headers |
| `cacheKey` | `string` | - | Key for cache storage |
| `cacheTTL` | `number` | `300000` | Cache TTL in ms (5 min) |
| `cacheFallback` | `() => T` | - | Fallback if cache empty |
| `maxRetries` | `number` | `3` | Max retry attempts |
| `baseDelayMs` | `number` | `1000` | Base delay for backoff |
| `silentFail` | `boolean` | `true` | Return result vs throw |

### Return Type

```typescript
interface EdgeFunctionResult<T> {
  success: boolean;      // Whether call succeeded
  data: T | null;        // Response data
  error?: string;        // Error message if failed
  fromCache: boolean;    // Whether result is from cache
}
```

---

## Flow Diagram

```
┌────────────────┐
│ invokeEdge     │
│ Function()     │
└───────┬────────┘
        │
        ▼
┌────────────────┐    success    ┌────────────────┐
│ Try Edge       │──────────────▶│ Cache result   │
│ Function       │               │ (if cacheKey)  │
└───────┬────────┘               └───────┬────────┘
        │ fail                           │
        ▼                                ▼
┌────────────────┐               ┌────────────────┐
│ Retry 1        │               │ Return         │
│ (1s delay)     │               │ { success: ✅ } │
└───────┬────────┘               └────────────────┘
        │ fail
        ▼
┌────────────────┐
│ Retry 2        │
│ (2s delay)     │
└───────┬────────┘
        │ fail
        ▼
┌────────────────┐
│ Retry 3        │
│ (4s delay)     │
└───────┬────────┘
        │ fail
        ▼
┌────────────────┐    hit     ┌────────────────┐
│ Check cache    │───────────▶│ Return cached  │
│ (if cacheKey)  │            │ { fromCache ✅ }│
└───────┬────────┘            └────────────────┘
        │ miss
        ▼
┌────────────────┐   result   ┌────────────────┐
│ Call fallback  │───────────▶│ Return         │
│ (if provided)  │            │ { fromCache ✅ }│
└───────┬────────┘            └────────────────┘
        │ null/error
        ▼
┌────────────────┐
│ Return         │
│ { success: ❌ } │
└────────────────┘
```

---

## Integration Examples

### Subscription Service

```typescript
// services/youtube/subscriptionService.ts
const edgeResult = await invokeEdgeFunction<EdgeFunctionResult>({
  functionName: 'verify-subscriptions',
  body: { channels, userId, accessToken },
  cacheKey: `subscriptions:${userId}`,
  cacheFallback: async () => {
    const dbStatuses = await getSubscriptionStatuses(userId);
    return {
      success: true,
      results: dbStatuses.map(s => ({
        channelId: s.channelId,
        channelKey: s.channelKey,
        subscribed: s.isSubscribed,
        xpAwarded: s.xpAwarded ? 1 : 0,
      })),
      totalXPAwarded: 0,
    };
  },
});
```

### Video Like Service

```typescript
// services/youtube/videoLikeService.ts
const edgeResult = await invokeEdgeFunction<EdgeFunctionResult>({
  functionName: 'verify-video-likes',
  body: { videos, userId },
  headers: { Authorization: `Bearer ${accessToken}` },
  cacheKey: `video-likes:${userId}`,
  cacheFallback: async () => null, // Use DB data in caller
});
```

---

## Cache Management

### Clear All Cache

```typescript
import { clearEdgeFunctionCache } from '@/utils/edgeFunctionClient';

await clearEdgeFunctionCache();
```

### Cache Storage

- **Storage**: AsyncStorage with `@edge_function_cache:` prefix
- **TTL**: Default 5 minutes, configurable per call
- **Auto-cleanup**: Expired entries removed on read

---

## Error Handling

### Transient Errors (Retried)

- Network errors
- Timeout errors
- Connection reset
- Socket errors

### Non-Transient Errors (Not Retried)

- 4xx client errors
- Authentication failures
- Invalid request errors

---

## Best Practices

1. **Always provide a cache fallback** for critical functionality
2. **Use specific cache keys** to avoid collisions
3. **Set appropriate TTL** based on data freshness needs
4. **Handle `fromCache: true`** in UI if needed (e.g., show stale indicator)
5. **Check `result.success`** before accessing `result.data`

# YouTube Integration & Feed

This document describes how Hamaki integrates with the YouTube Data API to fetch and display the channel’s video feed, manage caching, display “NEW” badges, and handle user interactions like opening videos.

## 1. Overview

- **Channel ID**: `UCSI5XbaxsX1USijrfFVuJqA` (HamaKi Studio)
- **API Base URL**: `https://www.googleapis.com/youtube/v3/`
- **Scope**: `https://www.googleapis.com/auth/youtube.readonly`
- **Primary Features**:
  - Fetch latest videos from the channel
  - Cache responses to minimize quota usage
  - Show thumbnails, titles, view counts, publish dates
  - Mark videos published in the last 24h as “NEW”
  - Open videos in YouTube app or browser

## 2. Data Fetching

### 2.1. Video List Request

Endpoint:
```
GET https://www.googleapis.com/youtube/v3/search
  ?part=snippet,contentDetails
  &channelId=UCSI5XbaxsX1USijrfFVuJqA
  &order=date
  &maxResults=20
  &type=video
  &key={API_KEY}
```

- **part**:  
  - `snippet` – video metadata (title, thumbnails, publish date)  
  - `contentDetails` – video duration, definition
- **channelId**: The target channel
- **order**: Sort by upload date
- **maxResults**: Number of items per request (configurable)
- **type**: Restrict to videos only

### 2.2. Pagination

- Use `nextPageToken` from the response to fetch subsequent pages.
- Continue until:
  - Desired total count is reached, or
  - No more pages available.

## 3. Caching Strategy

- **In-memory cache**:  
  - Valid for 5 minutes after initial fetch.  
  - Keyed by channelId + page token.
- **Cache invalidation**:  
  - On pull-to-refresh by user  
  - When app resumes after >5 minutes in background
- **Avoids**: Excessive API calls, quota overruns

## 4. “NEW” Badge

- A video is considered “new” if:
  - `(currentTimestamp - publishedAt) <= 24 hours`
- Display logic:
  - Show a small “NEW” banner in the corner of the thumbnail
  - Optionally show a highlight marker in the list item

## 5. Display Components

- **VideoCard**  
  - Thumbnail image  
  - Title (truncate if >2 lines)  
  - Subtitle line: “X views • 2h ago”  
  - NEW badge overlay when applicable
- **FeedList**  
  - FlatList or SectionList in React Native  
  - Infinite scroll: triggers next page fetch when near bottom
  - Pull-to-refresh: clears cache and reloads first page

## 6. Error Handling

- **Network errors**:  
  - Show a “Retry” button in place of the list  
  - Log errors for analytics
- **Quota errors (HTTP 403 / quotaExceeded)**:  
  - Backoff and retry after exponential delay (2s → 4s → 8s)  
  - Show a “Service unavailable” message if repeated failures
- **Data integrity**:  
  - Filter out any malformed items (missing snippet or videoId)

## 7. Background Polling & Notifications

- **Polling interval**: 15 minutes when app is active
- **Strategy**:
  1. Fetch first page of videos
  2. Compare newest video ID to last known ID in state
  3. If different, trigger local in-app notification and update state
- **Implementation**:
  - Custom hook `useVideoPoller()` in `hooks/`
  - Cancels polling when user signs out or app goes to background

## 8. Watch Integration

- When a user taps a video card:
  - Attempt to open with `Linking.openURL( youtube://watch?v={videoId} )`
  - Fallback to `https://www.youtube.com/watch?v={videoId}` in the browser
- This provides the native YouTube app experience when available.

## 9. Best Practices

- **Secure API Key**:  
  - Do not embed public API keys in client builds; use Expo secrets or server proxy if necessary.
- **Minimize Quota**:  
  - Leverage caching aggressively  
  - Limit `maxResults` to what’s necessary for UX
- **UI Responsiveness**:  
  - Show skeleton loaders on initial load  
  - Preload next-page thumbnails off-screen
- **Accessibility**:  
  - Provide alt text for images (`aria-label` in web, `accessibilityLabel` in RN)

---

> This document should give you the high-level design and some implementation details for Hamaki’s YouTube feed integration. For code-level examples, refer to `utils/auth.ts` (subscription checks) and feed components under `app/(tabs)`.
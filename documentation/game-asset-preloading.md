# Game Asset Pre-loading System

## Overview

The game asset pre-loading system ensures that all game sprites and images are loaded before the game starts, preventing the display of fallback rectangles and providing a smooth user experience.

## Problem Statement

**Issue**: When starting the No Pogod game, users would briefly see colored rectangles instead of sprites while images loaded asynchronously. This created a poor first impression and unprofessional feel.

**Root Cause**: React Native Skia's `useImage` hook loads images asynchronously in the canvas component. During the loading phase, fallback rectangles are rendered.

## Solution Architecture

### 1. Asset Pre-loader Utility

**File**: `/utils/gameAssetPreloader.ts`

The pre-loader provides:
- Sequential image pre-loading with progress tracking
- Support for multiple games (No Pogod, Hammock Jump, etc.)
- Loading state caching to avoid re-loading on subsequent visits
- Comprehensive error handling

**Key Functions**:

```typescript
// Pre-load all No Pogod assets
preloadNoPogodAssets(onProgress?: (progress) => void)

// Pre-load Hammock Jump assets
preloadHammockJumpAssets(onProgress?: (progress) => void)

// Pre-load all game assets
preloadAllGameAssets(onProgress?: (progress) => void)

// Check if assets are loaded
areNoPogodAssetsLoaded(): boolean
```

### 2. Integration with Games Tab

**File**: `/app/(tabs)/games.tsx`

Pre-loading is triggered when user navigates to the Games tab using `useFocusEffect`:

```typescript
useFocusEffect(
  useCallback(() => {
    if (!areNoPogodAssetsLoaded()) {
      preloadAllGameAssets((progress) => {
        setLoadingProgress(progress);
      })
    }
  }, [])
);
```

### 3. User Experience Features

#### Loading Indicator
- Shows progress banner at top of Games tab
- Displays percentage, current asset name, and progress count
- Animated spinner for visual feedback

#### Disabled State
- Game cards show loading spinner during asset pre-load
- Game cards are disabled until assets finish loading
- "Loading Assets..." badge appears on game cards

#### Progress Tracking
```typescript
interface PreloadProgress {
  loaded: number;      // Number of assets loaded
  total: number;       // Total assets to load
  percentage: number;  // Progress percentage (0-100)
  currentAsset: string; // Name of currently loading asset
}
```

## Implementation Details

### Asset Loading Process

1. **User navigates to Games tab**
   - `useFocusEffect` hook triggered
   - Check if assets already loaded (cached state)

2. **Start pre-loading if needed**
   - Set `isLoadingAssets = true`
   - Call `preloadAllGameAssets()` with progress callback

3. **Sequential loading**
   - Load each asset one by one
   - Use `Image.prefetch()` for React Native Image caching
   - Update progress after each asset

4. **Completion**
   - Set cached state flag `setNoPogodAssetsLoaded(true)`
   - Set `isLoadingAssets = false`
   - Enable game cards

5. **Subsequent visits**
   - Check cached state
   - Skip loading if already loaded
   - Games start instantly

### Pre-loaded Assets for No Pogod

**Total: 18 assets**

**Background** (1):
- bg.png

**Miro Sprites** (5):
- პროფილი დგომა.png (idle)
- ნაბიჯი 1.png (walk step 1)
- ნაბიჯი 2.png (walk step 2)
- დგომა 45 გრადუსი.png (45° angle)
- დგომა 90 გრადუსი.png (90° angle)

**Shonzika Sprites** (7):
- დგომა პროფილი.png (idle profile)
- დგომა 90 გრადუსი.png (idle 90°)
- სიარული 1.png (walk 1)
- სიარული 2~.png (walk 2)
- ხელი პროფილი.png (hand profile)
- ხელი 45 აგრადუსი.png (hand 45°)
- ხელი 90 გრადუსი.png (hand 90°)

**Item Sprites** (5):
- კვერცხი.png (egg)
- პომიდორი.png (tomato)
- წიწაკა.png (pepper)
- ელექტროშოკი.png (electric shock)
- ბომბი.png (bomb)

### Loading Time Estimates

**First Load** (uncached):
- 18 assets × ~50ms average = ~900ms (< 1 second)
- Actual time varies based on:
  - Device performance
  - Image file sizes
  - Network conditions (if not bundled)

**Subsequent Loads**:
- Instant (cached state check only)

## Technical Considerations

### Why Image.prefetch()?

`Image.prefetch()` loads images into React Native's image cache:
- Images are cached in memory
- Subsequent renders are instant
- Works with both bundled and remote images
- Compatible with Skia's `useImage` hook

### Caching Strategy

**Memory Cache**:
```typescript
let noPogodAssetsLoaded = false; // In-memory flag

// Check state
areNoPogodAssetsLoaded(): boolean

// Update state
setNoPogodAssetsLoaded(loaded: boolean)
```

**Benefits**:
- Fast state checking
- Survives tab navigation
- Resets on app restart (fresh loading)

**Trade-offs**:
- Not persisted to disk (AsyncStorage not used)
- Re-loads on app restart
- Acceptable for game assets (small overhead)

### Error Handling

**Graceful Degradation**:
```typescript
const result = await preloadImage(source, name);
if (!result.success) {
  // Log error but continue loading
  failedAssets.push(result.name);
}
```

**User Experience**:
- Loading continues even if individual assets fail
- Failed assets logged to console for debugging
- Fallback rectangles shown only for failed assets
- Majority of assets still work

## UI Components

### Loading Banner

**Location**: Top of Games tab (below header)

**Appearance**:
- Green-tinted background (brand color)
- Spinner animation
- Progress text with percentage
- Current asset name and count

**Styling**:
```typescript
loadingBanner: {
  backgroundColor: 'rgba(196, 255, 0, 0.15)',
  borderColor: 'rgba(196, 255, 0, 0.4)',
  padding: 16,
  borderRadius: 12,
}
```

### Game Card States

**Loading State**:
- Spinner replaces game icon
- "Loading Assets..." badge
- Card disabled (dim appearance)

**Loaded State**:
- Normal game icon
- No loading badge
- Card enabled (tap to play)

## Performance Optimization

### Why Sequential Loading?

**Current Approach**: Load assets one by one
```typescript
for (const asset of assets) {
  await preloadImage(asset.source, name);
}
```

**Rationale**:
- Prevents overwhelming the image cache
- Provides accurate progress tracking
- Easier to debug individual failures
- Minimal performance difference (< 1 second total)

**Alternative**: Parallel loading with `Promise.all()`
- Faster but less predictable
- Harder to track individual progress
- Risk of cache thrashing
- Considered overkill for 18 small assets

### Memory Management

**Image Cache**:
- React Native automatically manages image cache
- LRU (Least Recently Used) eviction
- Typically 10-20 MB limit
- Game assets well within limits (~2-3 MB total)

## Testing Strategy

### Manual Testing

**First Visit**:
1. Clean app install or clear cache
2. Navigate to Games tab
3. Observe loading banner with progress
4. Wait for completion (~1 second)
5. Tap game card
6. Verify no rectangle fallbacks

**Second Visit**:
1. Navigate away from Games tab
2. Navigate back to Games tab
3. Observe no loading (instant)
4. Games start immediately

### Debug Logging

**Console Output**:
```
🎮 Games tab focused - starting asset pre-load
🎮 Starting No Pogod asset pre-loading...
✅ Pre-loaded: miro-idle
✅ Pre-loaded: miro-step1
...
✅ All No Pogod assets pre-loaded successfully!
✅ Asset pre-loading complete
```

**Error Logging**:
```
❌ Failed to pre-load miro-idle: [error details]
⚠️ Pre-loading completed with 1 failures: miro-idle
```

## Future Enhancements

### 1. Persistent Cache
```typescript
// Save to AsyncStorage
await AsyncStorage.setItem('noPogodAssetsLoaded', 'true');

// Check on app start
const cached = await AsyncStorage.getItem('noPogodAssetsLoaded');
```

**Benefits**: No re-loading on app restart

**Trade-offs**: Cache invalidation complexity

### 2. Splash Screen Pre-loading
Pre-load assets during app splash screen
- Games instantly ready on first visit
- Longer initial app load time
- Better UX for game-focused apps

### 3. Progressive Loading
```typescript
// Critical assets first (backgrounds, main characters)
await preloadCriticalAssets();
enableGameStart();

// Non-critical assets in background (items, effects)
preloadSecondaryAssets();
```

**Benefits**: Faster perceived loading

**Trade-offs**: More complex state management

### 4. Bandwidth-aware Loading
```typescript
// Check network type
const netInfo = await NetInfo.fetch();
if (netInfo.type === 'wifi') {
  await preloadHighResAssets();
} else {
  await preloadLowResAssets();
}
```

**Benefits**: Optimized for connection speed

**Trade-offs**: Multiple asset versions required

## Files Modified

1. **Created**: `/utils/gameAssetPreloader.ts`
   - Pre-loading utility functions
   - Progress tracking
   - State management

2. **Modified**: `/app/(tabs)/games.tsx`
   - Added `useFocusEffect` for tab focus detection
   - Added loading state management
   - Added loading UI components
   - Added loading banner and badges

## Lessons Learned

1. **Pre-loading is essential**: Even small delays create poor UX
2. **Progress feedback matters**: Users accept loading if informed
3. **Cache intelligently**: Don't re-load unnecessarily
4. **Fail gracefully**: One asset failure shouldn't break everything
5. **Test edge cases**: First visit, subsequent visits, failed loads

## Related Documentation

- [No Pogod Game Engine](./nopogod-game-engine.md)
- [Sprite Rendering & Flipping](./nopogod-game-sprite-rendering.md)

## Revision History

- **2024-10-24**: Initial documentation of asset pre-loading system
  - Implemented pre-loader utility
  - Integrated with Games tab
  - Added loading UI components
  - Added progress tracking and caching

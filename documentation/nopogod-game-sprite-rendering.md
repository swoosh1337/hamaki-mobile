# No Pogod Game - Sprite Rendering & Flipping Issues

## Overview

This document details the technical challenges encountered with sprite rendering in the No Pogod game, specifically focusing on horizontal sprite flipping for directional character movement using React Native Skia Canvas.

## Architecture

### Core Components

1. **NoPogodGameCanvas.tsx** - Skia-based rendering layer
2. **noPogodGameEngine.ts** - Game logic and state management
3. **noPogodSpriteRenderer.ts** - Sprite positioning calculations
4. **noPogodResponsiveScaling.ts** - Responsive layout management

### Technology Stack

- **@shopify/react-native-skia** - Hardware-accelerated 2D graphics
- **React Native** - Mobile framework
- **TypeScript** - Type-safe development

## The Sprite Flipping Problem

### Background

The No Pogod game features two characters (Miro and Shonzika) that need to face the direction they're moving. When a character moves left, their sprite must be horizontally flipped to face left while maintaining proper positioning and animation.

### Initial Issues Discovered

#### Issue #1: Character Disappearing When Moving Left

**Symptom**:
- Miro would disappear off-screen when moving to the left side
- The character would sometimes render at incorrect x positions

**Root Cause**:
When using `scaleX: -1` to flip sprites horizontally in Skia, the transform applies relative to the coordinate system's origin (0, 0), not the sprite's position. This caused several problems:

1. **Transform anchor point**: The flip was occurring around the wrong point
2. **Position calculation**: Adding width offsets created incorrect rendering positions
3. **Visual displacement**: Character appeared to jump or disappear

**Example of Incorrect Rendering**:
```typescript
// WRONG APPROACH #1: Adding width offset
const renderX = shouldFlip ? miroSprite.x + miroSprite.width : miroSprite.x;
```

This caused Miro to render at x=160.375 instead of x=9.625 when on the left side, pushing it off the right edge of the screen.

**Example of Incorrect Rendering**:
```typescript
// WRONG APPROACH #2: Transform composition without proper origin
const transforms = shouldFlip
  ? [
      { translateX: miroSprite.width / 2 },
      { scaleX: -1 },
      { translateX: -miroSprite.width / 2 },
    ]
  : undefined;
```

While this approach is theoretically correct for local coordinate flipping, it doesn't work properly in Skia because the transforms are applied in the global coordinate space, not relative to the sprite's position.

#### Issue #2: Character Moving Backwards When Flipped

**Symptom**:
- When Miro moved left (with sprite flipped), the walking animation appeared to run backwards
- The character looked like it was moonwalking instead of walking forward

**Root Cause**:
The sprite flip was inverting not just the sprite orientation but also the visual perception of the animation direction. Without proper origin point specification, the entire sprite and its animation were being mirrored incorrectly.

### The Correct Solution: Using the `origin` Prop

#### Understanding Skia's Transform Origin

In Skia, transforms can be applied with a specific origin point. The `origin` prop on the `Image` component specifies the center point for transformations.

**Key Concept**: When you set an origin point and apply `scaleX: -1`, the sprite flips around that specific point in the canvas coordinate space.

#### Implementation

```typescript
// CORRECT APPROACH: Using origin prop
const shouldFlip = gameState.player.position === 'LEFT';

const transforms = shouldFlip ? [{ scaleX: -1 }] : undefined;
const origin = shouldFlip
  ? {
      x: miroSprite.x + miroSprite.width / 2,   // Center X of sprite
      y: miroSprite.y + miroSprite.height / 2   // Center Y of sprite
    }
  : undefined;

return (
  <Image
    image={miroImage}
    x={miroSprite.x}
    y={miroSprite.y}
    width={miroSprite.width}
    height={miroSprite.height}
    fit="contain"
    transform={transforms}
    origin={origin}  // Critical: Flip around sprite center
  />
);
```

#### Why This Works

1. **Origin Point**: The origin is set to the exact center of the sprite in canvas coordinates
2. **Transform Application**: `scaleX: -1` now flips around this center point
3. **Position Preservation**: The sprite stays at its intended x,y position
4. **Animation Direction**: Walking animations play correctly in the flipped orientation

### Technical Details

#### Coordinate Systems

**Canvas Coordinate Space**:
- Origin (0, 0) is top-left of screen
- X increases rightward
- Y increases downward

**Sprite Position**:
- `miroSprite.x, miroSprite.y` = top-left corner of sprite
- `miroSprite.x + width/2, miroSprite.y + height/2` = center of sprite

#### Transform Application Order

When Skia applies transforms with an origin:

1. Translate to origin point: Move coordinate system to origin
2. Apply transform: Execute scaleX(-1)
3. Translate back: Return coordinate system to original position

This is mathematically equivalent to:
```
Matrix.translate(origin.x, origin.y)
  .scale(-1, 1)
  .translate(-origin.x, -origin.y)
```

But by using the `origin` prop, Skia handles this automatically and correctly.

## Edge Cases & Considerations

### Edge Clamping

The game engine clamps character positions to prevent them from going off-screen:

```typescript
// From noPogodGameEngine.ts
const characterHalfWidth = 75.375;
const leftBoundary = characterHalfWidth + 10;  // 85px
const rightBoundary = screenWidth - characterHalfWidth - 10;  // 317px for 402px screen
```

**Important**: Flipping does not affect position clamping. The character center position remains the same regardless of flip state.

### Sprite Selection

Different sprites are used for different states:

**Miro States**:
- `miroAngle90Image` - Idle/standing (90° profile)
- `miroStep1Image` - Walking animation frame 1
- `miroStep2Image` - Walking animation frame 2

**Animation Progress**:
```typescript
const miroImage = gameState.player.animationProgress < 0.5
  ? miroStep1Image
  : miroStep2Image;
```

The flip is applied consistently across all sprite states.

### Performance Considerations

1. **Transform Caching**: Transforms are recalculated every frame but are lightweight operations
2. **Origin Calculation**: Simple arithmetic, negligible performance impact
3. **Conditional Rendering**: Transform and origin are only set when `shouldFlip` is true

## Debugging Sprite Issues

### Logging Strategy

Comprehensive logging was critical to identifying the flipping issues:

```typescript
console.log('🎨 RENDER Miro:', {
  centerX: gameState.player.x,
  renderX: miroSprite.x,
  spriteLeft: miroSprite.x,
  spriteRight: miroSprite.x + miroSprite.width,
  screenWidth: scalingConfig.screenWidth,
  fullyOnScreen: spriteLeft >= 0 && spriteRight <= screenWidth,
});
```

### Key Metrics to Monitor

1. **Character Center Position** (`gameState.player.x`) - Game logic position
2. **Render Position** (`miroSprite.x`) - Top-left corner for rendering
3. **Sprite Bounds** - Left and right edges to verify on-screen positioning
4. **Flip State** - Whether transform is being applied
5. **Position State** - LEFT/RIGHT/CENTER position

### Common Pitfalls

❌ **DON'T**: Modify x position when flipping
```typescript
// WRONG
const x = shouldFlip ? miroSprite.x + offset : miroSprite.x;
```

✅ **DO**: Keep position constant, use origin for flip
```typescript
// CORRECT
const x = miroSprite.x;
const origin = shouldFlip ? { x: x + width/2, y: y + height/2 } : undefined;
```

❌ **DON'T**: Use transform composition without origin
```typescript
// WRONG - Doesn't work properly in Skia canvas coordinates
transform={[{ translateX: width/2 }, { scaleX: -1 }, { translateX: -width/2 }]}
```

✅ **DO**: Use simple transform with proper origin
```typescript
// CORRECT
transform={[{ scaleX: -1 }]}
origin={{ x: x + width/2, y: y + height/2 }}
```

## Implementation Checklist

When implementing sprite flipping in React Native Skia:

- [ ] Use `scaleX: -1` for horizontal flip
- [ ] Calculate origin as sprite center in canvas coordinates
- [ ] Set origin prop on Image component
- [ ] Keep x,y position unchanged when flipping
- [ ] Test with movement in both directions
- [ ] Verify sprite doesn't disappear at edges
- [ ] Check animation plays correctly when flipped
- [ ] Validate with logging during development

## Applied to Both Characters

The same flipping solution is applied to both Miro and Shonzika:

### Miro (Player Character)
```typescript
const shouldFlip = gameState.player.position === 'LEFT';
```

### Shonzika (Enemy Character)
```typescript
const shouldFlip = gameState.shonzika.isMoving &&
                   gameState.shonzika.targetX < gameState.shonzika.x;
```

Both use identical origin calculation and transform application.

## Lessons Learned

1. **Read the Documentation**: React Native Skia's `origin` prop exists specifically for this use case
2. **Test Edge Cases**: Always test character movement at screen boundaries
3. **Log Extensively**: Visual bugs need numerical data to debug effectively
4. **Understand Coordinate Systems**: Transform behavior depends on understanding canvas vs sprite coordinates
5. **Keep It Simple**: The simplest solution (origin prop) is usually the correct one

## Future Considerations

### Potential Enhancements

1. **Rotation Support**: Same origin approach works for rotation transforms
2. **Scale Animations**: Could animate scale for impact effects
3. **Composite Transforms**: Multiple transforms can share the same origin

### Maintenance Notes

- If sprite dimensions change, origin calculations automatically adjust
- If screen size changes, responsive scaling handles it
- Transform logic is isolated and doesn't affect game engine

## References

- React Native Skia Docs: https://shopify.github.io/react-native-skia/
- Skia Transform Documentation: https://skia.org/docs/user/api/SkCanvas_Reference/#SkCanvas_scale
- Game Component: `/components/games/NoPogodGameCanvas.tsx`
- Game Engine: `/utils/noPogodGameEngine.ts`

## Revision History

- **2024-10-24**: Initial documentation of sprite flipping issues and solutions
  - Documented incorrect approaches and their failure modes
  - Detailed the correct solution using `origin` prop
  - Added implementation checklist and debugging strategies

# No Pogod Game Engine Documentation

## Overview

The No Pogod game is a mobile reimagining of the classic "Nu, Pogodi!" (Well, Just You Wait!) arcade game. Players control Miro (the wolf character) who must catch falling items using baskets while avoiding dangerous objects.

## Game Architecture

### Component Structure

```
NoPogodGame (Main Component)
├── NoPogodGameCanvas (Rendering Layer - Skia)
│   ├── Background rendering
│   ├── Character rendering (Miro & Shonzika)
│   └── Item rendering
├── NoPogodGameEngine (Game Logic)
│   ├── Player movement system
│   ├── Item spawning & physics
│   ├── Collision detection
│   └── Scoring system
├── NoPogodSpriteRenderer (Sprite Management)
│   ├── Sprite position calculations
│   └── Animation state management
└── ResponsiveScalingManager (Layout Management)
    ├── Screen adaptation
    └── Position scaling
```

## Core Systems

### 1. Player Movement System

#### Continuous Movement Model

The game uses a "hold-to-move" continuous movement system:

```typescript
// Player presses LEFT button
onTouchLeft() → player.isMoving = true, player.position = 'LEFT'
                → Continuous movement at moveSpeed per frame

// Player releases button
onTouchRelease() → player.isMoving = false
                  → Character stops at current position
```

#### Position States

**Three Discrete Positions**:
- `LEFT` - Character on left side of screen
- `CENTER` - Character in center
- `RIGHT` - Character on right side

**Continuous Position**:
- `player.x` - Actual pixel position (85px to 317px for 402px screen)
- Updated every frame during movement
- Clamped to screen boundaries

#### Movement Implementation

```typescript
// From noPogodGameEngine.ts
const MOVE_SPEED = 4; // pixels per frame

if (player.isMoving) {
  if (player.position === 'LEFT') {
    player.x -= MOVE_SPEED;  // Move left
  } else if (player.position === 'RIGHT') {
    player.x += MOVE_SPEED;  // Move right
  }
}

// Clamp to boundaries
const leftBoundary = characterHalfWidth + 10;   // 85px
const rightBoundary = screenWidth - characterHalfWidth - 10;  // 317px

player.x = Math.max(leftBoundary, Math.min(rightBoundary, player.x));
```

#### Edge Clamping

**Left Boundary**:
```
characterHalfWidth + padding = 75.375 + 10 = 85px
```

**Right Boundary**:
```
screenWidth - characterHalfWidth - padding = 402 - 75.375 - 10 = 317px
```

**Why 10px Padding?**
- Prevents sprite edges from touching screen boundaries
- Provides visual buffer for better UX
- Accounts for sprite rendering at top-left corner

### 2. Item System

#### Item Types

1. **EGG** - Standard collectible (safe)
2. **TOMATO** - Dangerous item (penalty)
3. **PEPPER** - Dangerous item (penalty)
4. **ELECTRIC_SHOCK** - Dangerous item (penalty)
5. **BOMB** - Dangerous item (penalty)

#### Item Lifecycle

```
Spawn → Fall → Catch/Miss → Despawn
  ↓      ↓        ↓           ↓
  t=0   t+dt   collision   y > screen
```

**Spawning**:
```typescript
spawnItem(type, startX, startY) {
  item = {
    id: uniqueId(),
    type: type,
    x: startX,
    y: startY,
    velocity: FALL_SPEED,
    state: 'FALLING'
  }
  items.push(item);
}
```

**Physics**:
```typescript
// Each frame
item.y += item.velocity * deltaTime;
item.x += item.horizontalVelocity; // if applicable
```

**Despawn Conditions**:
1. Item caught by player (collision detected)
2. Item missed (y > screenHeight)
3. Item out of bounds

### 3. Collision Detection

#### Bounding Box System

**Character Hitbox**:
```typescript
const characterBounds = {
  left: player.x - characterHalfWidth,
  right: player.x + characterHalfWidth,
  top: player.y - characterHalfHeight,
  bottom: player.y + characterHalfHeight
};
```

**Item Hitbox**:
```typescript
const itemBounds = {
  left: item.x - itemSize / 2,
  right: item.x + itemSize / 2,
  top: item.y - itemSize / 2,
  bottom: item.y + itemSize / 2
};
```

#### Collision Algorithm

**AABB (Axis-Aligned Bounding Box) Collision**:

```typescript
function checkCollision(characterBounds, itemBounds) {
  return !(
    characterBounds.right < itemBounds.left ||
    characterBounds.left > itemBounds.right ||
    characterBounds.bottom < itemBounds.top ||
    characterBounds.top > itemBounds.bottom
  );
}
```

**Collision Response**:
```typescript
if (collision) {
  if (item.type === 'EGG') {
    score += 100;
    playCatchSound();
  } else {
    health -= 1;
    playPenaltySound();
  }
  removeItem(item.id);
}
```

### 4. Shonzika (Enemy) System

#### Behavior States

1. **IDLE** - Standing still at position
2. **WALKING** - Moving to target position
3. **THROWING** - Throwing item animation

#### Movement Logic

```typescript
// Shonzika alternates between three positions
const positions = [LEFT, CENTER, RIGHT];

if (shonzika.state === 'IDLE') {
  // Wait at position
  idleTimer -= deltaTime;

  if (idleTimer <= 0) {
    // Choose new random position
    targetPosition = random(positions.filter(p => p !== currentPosition));
    shonzika.state = 'WALKING';
  }
}

if (shonzika.state === 'WALKING') {
  // Move towards target
  moveTowards(targetPosition, SHONZIKA_SPEED);

  if (reachedTarget()) {
    shonzika.state = 'IDLE';
    idleTimer = random(MIN_IDLE, MAX_IDLE);
  }
}
```

#### Item Throwing

**Throw Mechanics**:
```typescript
throwItem() {
  shonzika.state = 'THROWING';
  showThrowAnimation();

  // Spawn item at Shonzika's position
  const itemType = selectRandomItemType();
  spawnItem(itemType, shonzika.x, shonzika.y);

  // Return to idle after animation
  setTimeout(() => {
    shonzika.state = 'IDLE';
  }, THROW_ANIMATION_DURATION);
}
```

**Item Type Selection**:
```typescript
// Weighted random selection
const itemWeights = {
  EGG: 0.6,           // 60% chance
  TOMATO: 0.15,       // 15% chance
  PEPPER: 0.15,       // 15% chance
  ELECTRIC_SHOCK: 0.05, // 5% chance
  BOMB: 0.05          // 5% chance
};
```

### 5. Animation System

#### Character Animation States

**Miro Animation States**:
```typescript
{
  IDLE: 'miroAngle90Image',           // Standing still
  WALKING: ['miroStep1', 'miroStep2'], // Alternating walk cycle
  ANGLE_45: 'miroAngle45Image',       // 45° angle catch pose
  ANGLE_90: 'miroAngle90Image'        // 90° angle catch pose
}
```

**Shonzika Animation States**:
```typescript
{
  IDLE: 'shonzikaIdleImage',                    // Standing
  WALKING: ['shonzikaWalk1', 'shonzikaWalk2'],  // Walk cycle
  THROWING: 'shonzikaHandProfileImage'          // Throwing pose
}
```

#### Animation Timing

```typescript
// Animation progress (0.0 to 1.0)
animationProgress += deltaTime * ANIMATION_SPEED;
animationProgress %= 1.0; // Loop

// Sprite selection
currentSprite = animationProgress < 0.5
  ? sprite[0]  // First frame
  : sprite[1]; // Second frame
```

### 6. Scoring System

#### Score Calculation

**Positive Events**:
```typescript
catchEgg() → score += 100
```

**Negative Events**:
```typescript
catchDangerousItem() → health -= 1
missEgg() → streak = 0
```

**Streak System**:
```typescript
let streak = 0;
let streakMultiplier = 1.0;

onCatchEgg() {
  streak++;
  streakMultiplier = 1.0 + (streak * 0.1); // +10% per streak
  score += baseScore * streakMultiplier;
}

onMiss() {
  streak = 0;
  streakMultiplier = 1.0;
}
```

### 7. Responsive Scaling System

#### Screen Adaptation

**Base Reference Screen**:
- Width: 375px (iPhone 8 reference)
- Height: 667px

**Scaling Calculation**:
```typescript
const scaleX = currentScreenWidth / referenceWidth;
const scaleY = currentScreenHeight / referenceHeight;
const uniformScale = Math.min(scaleX, scaleY); // Maintain aspect ratio
```

**Position Scaling**:
```typescript
class ResponsiveScalingManager {
  scalePosition(x, y) {
    return {
      x: x * this.scaleX,
      y: y * this.scaleY
    };
  }

  scaleSize(width, height) {
    return {
      width: width * this.uniformScale,
      height: height * this.uniformScale
    };
  }
}
```

**Character Size Adaptation**:
```typescript
const characterSize = 150.75 * uniformScale;
const characterHalfWidth = characterSize / 2;
```

## Game Loop

### Frame Update Cycle

```typescript
function gameLoop() {
  requestAnimationFrame(() => {
    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // 1. Update player movement
    updatePlayerPosition(deltaTime);

    // 2. Update Shonzika behavior
    updateShonzikaBehavior(deltaTime);

    // 3. Update items (physics)
    updateItems(deltaTime);

    // 4. Check collisions
    checkAllCollisions();

    // 5. Update animations
    updateAnimations(deltaTime);

    // 6. Clean up off-screen items
    cleanupItems();

    // 7. Update game state
    setGameState(newState);

    // Next frame
    gameLoop();
  });
}
```

### Performance Optimization

**Frame Rate Target**: 60 FPS (16.67ms per frame)

**Optimization Strategies**:
1. **Sprite Caching**: Images loaded once, reused every frame
2. **Collision Culling**: Only check items near player
3. **Object Pooling**: Reuse item objects instead of creating new ones
4. **Batch Updates**: Update all sprites in single pass
5. **Native Rendering**: Skia renders on native thread

## State Management

### Game State Structure

```typescript
interface NoPogodGameState {
  // Player state
  player: {
    x: number;              // Center position (85-317)
    y: number;              // Center position (fixed)
    position: 'LEFT' | 'CENTER' | 'RIGHT';
    isMoving: boolean;
    animationProgress: number; // 0.0 - 1.0
    health: number;
    score: number;
  };

  // Enemy state
  shonzika: {
    x: number;
    y: number;
    position: 'LEFT' | 'CENTER' | 'RIGHT';
    targetX: number;
    isMoving: boolean;
    sprite: 'IDLE' | 'WALKING' | 'THROWING';
    animationProgress: number;
  };

  // Items state
  items: Array<{
    id: string;
    type: ItemType;
    x: number;
    y: number;
    velocity: number;
    state: 'FALLING' | 'CAUGHT' | 'MISSED';
  }>;

  // Game meta state
  gameStatus: 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
  level: number;
  timeElapsed: number;
}
```

### State Updates

**Immutable Updates**:
```typescript
// React state update pattern
setGameState(prevState => ({
  ...prevState,
  player: {
    ...prevState.player,
    x: newX,
    isMoving: true
  }
}));
```

## Touch Controls

### Input Handling

```typescript
// Touch areas
const touchAreas = {
  LEFT: { x: 0, y: screenHeight * 0.7, width: screenWidth * 0.5, height: screenHeight * 0.3 },
  RIGHT: { x: screenWidth * 0.5, y: screenHeight * 0.7, width: screenWidth * 0.5, height: screenHeight * 0.3 }
};

// Touch handlers
onTouchStart(event) {
  const touchX = event.nativeEvent.locationX;

  if (touchX < screenWidth / 2) {
    // Left side touched
    startMovingLeft();
  } else {
    // Right side touched
    startMovingRight();
  }
}

onTouchEnd(event) {
  // Stop continuous movement
  stopMoving();
}
```

### Multi-Touch Support

```typescript
// Track multiple touches
let activeTouches = new Set();

onTouchStart(event) {
  activeTouches.add(event.identifier);
  updateMovement();
}

onTouchEnd(event) {
  activeTouches.delete(event.identifier);
  if (activeTouches.size === 0) {
    stopMoving();
  }
}
```

## Difficulty Scaling

### Progressive Difficulty

**Level 1-5**: Easy
- Slow fall speed
- Mostly eggs
- Low spawn rate

**Level 6-10**: Medium
- Medium fall speed
- Mixed items
- Medium spawn rate

**Level 11+**: Hard
- Fast fall speed
- More dangerous items
- High spawn rate

### Difficulty Parameters

```typescript
interface DifficultySettings {
  fallSpeed: number;        // Item fall velocity
  spawnRate: number;        // Items per second
  dangerousItemChance: number; // Probability of dangerous items
  shonzikaSpeed: number;    // Enemy movement speed
  shonzikaThrowRate: number; // Throws per minute
}

function getDifficultySettings(level: number): DifficultySettings {
  const baseSpeed = 2;
  const speedIncrease = 0.5 * Math.floor(level / 5);

  return {
    fallSpeed: baseSpeed + speedIncrease,
    spawnRate: 1 + (level * 0.1),
    dangerousItemChance: 0.2 + (level * 0.02),
    shonzikaSpeed: 3 + (level * 0.2),
    shonzikaThrowRate: 10 + (level * 2)
  };
}
```

## Debug Tools

### Logging System

```typescript
// Position logging
console.log('🎮 ENGINE: Player moved', {
  from: oldX,
  to: newX,
  delta: newX - oldX,
  position: player.position
});

// Collision logging
console.log('💥 COLLISION:', {
  itemType: item.type,
  playerX: player.x,
  itemX: item.x,
  score: newScore
});

// Rendering logging
console.log('🎨 RENDER Miro:', {
  centerX: player.x,
  renderX: spriteX,
  flipped: shouldFlip,
  onScreen: isOnScreen
});
```

### Visual Debug Mode

```typescript
// Enable with debugMode flag
if (debugMode) {
  // Draw hitboxes
  renderHitbox(player.bounds, 'green');
  renderHitbox(item.bounds, 'red');

  // Show position markers
  renderMarker(player.x, player.y, 'Player');
  renderMarker(shonzika.x, shonzika.y, 'Shonzika');

  // Display stats
  renderDebugStats({
    fps: currentFPS,
    itemCount: items.length,
    score: score
  });
}
```

## Common Issues & Solutions

### Issue: Choppy Movement
**Cause**: Frame rate drops
**Solution**: Optimize rendering, reduce item count

### Issue: Items Passing Through Player
**Cause**: Collision detection missing fast-moving items
**Solution**: Use continuous collision detection or smaller time steps

### Issue: Character Stuck at Edge
**Cause**: Movement and clamping conflict
**Solution**: Check boundary before applying movement

### Issue: Memory Leak
**Cause**: Items not properly cleaned up
**Solution**: Remove items from array when despawned

## Future Enhancements

### Planned Features

1. **Power-ups**
   - Slow-motion
   - Extra life
   - Score multiplier

2. **Multiple Levels**
   - Different backgrounds
   - New character skins
   - Unique mechanics per level

3. **Leaderboards**
   - Global high scores
   - Friend rankings
   - Daily challenges

4. **Sound System**
   - Background music
   - Sound effects
   - Haptic feedback

## Files Reference

### Core Files

- `/components/games/NoPogodGame.tsx` - Main game component
- `/components/games/NoPogodGameCanvas.tsx` - Rendering layer
- `/utils/noPogodGameEngine.ts` - Game logic engine
- `/utils/noPogodSpriteRenderer.ts` - Sprite management
- `/utils/noPogodResponsiveScaling.ts` - Layout scaling

### Asset Directories

- `/assets/images/game/bg.png` - Background
- `/assets/images/game/miro/` - Player sprites
- `/assets/images/game/shonzika/` - Enemy sprites
- `/assets/images/game/items/` - Item sprites

## Best Practices

### Code Organization

1. **Separation of Concerns**
   - Game logic in engine
   - Rendering in canvas
   - UI in React components

2. **Pure Functions**
   - Game logic functions should be pure when possible
   - Makes testing easier

3. **Immutable State**
   - Never mutate state directly
   - Use spread operators for updates

### Performance

1. **Avoid Unnecessary Renders**
   - Use `useMemo` for expensive calculations
   - Memoize sprite calculations

2. **Batch Updates**
   - Update all items in single pass
   - Minimize state updates per frame

3. **Native Optimization**
   - Leverage Skia's native rendering
   - Minimize JavaScript bridging

## Testing Strategies

### Manual Testing Checklist

- [ ] Character moves smoothly left and right
- [ ] Character stops at screen edges
- [ ] Items fall at correct speed
- [ ] Collisions detected accurately
- [ ] Score increases correctly
- [ ] Health decreases on dangerous items
- [ ] Animations play smoothly
- [ ] No visual glitches during flips
- [ ] Responsive on different screen sizes
- [ ] Touch controls responsive

### Automated Testing

```typescript
// Example unit test
describe('Collision Detection', () => {
  it('should detect collision when bounds overlap', () => {
    const playerBounds = { left: 50, right: 100, top: 50, bottom: 100 };
    const itemBounds = { left: 75, right: 125, top: 75, bottom: 125 };

    expect(checkCollision(playerBounds, itemBounds)).toBe(true);
  });

  it('should not detect collision when bounds do not overlap', () => {
    const playerBounds = { left: 0, right: 50, top: 0, bottom: 50 };
    const itemBounds = { left: 100, right: 150, top: 100, bottom: 150 };

    expect(checkCollision(playerBounds, itemBounds)).toBe(false);
  });
});
```

## Revision History

- **2024-10-24**: Initial comprehensive game engine documentation
  - Detailed all core systems
  - Documented game loop and state management
  - Added debugging and testing strategies
  - Included performance optimization guidelines

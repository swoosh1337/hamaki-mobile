# HammockJump Game

> For the general game engine architecture and how to create new games, see [GAME_ENGINE_GUIDE.md](../GAME_ENGINE_GUIDE.md)

## Overview

HammockJump is a Doodle Jump-style platformer where players jump on platforms to climb as high as possible.

## Game-Specific Features

### Gameplay
- **Endless vertical scrolling** - No timer, play until you fall
- **Score-based progression** - Difficulty increases with height
- **Physics-based movement** - Gravity, jumping, platform collision

### Controls
- **Accelerometer** - Tilt device to move left/right
- **Touch fallback** - Touch controls if accelerometer unavailable

### Platform Types
| Type | Color | Behavior |
|------|-------|----------|
| Normal | Gray | Standard platform |
| Moving | Blue | Moves horizontally |
| Breakable | Brown | Breaks after landing |
| Spring | Gold | Extra high bounce (one use) |
| Bouncy | Pink | Higher bounce |
| Ice | Sky blue | Slippery surface |
| Conveyor | Gray | Pushes player |

### Audio
- `jump.wav` - Platform landing sound
- `falling-sound-arcade.mp3` - Falling death sound (2 sec max)

### Special Features

#### K Animation
Button at bottom-right that triggers a special animation:
1. Press K button → Player freezes in place
2. Animation plays (k1-k7 frames replace player sprite)
3. On complete → Game over with +200 score bonus

## File Structure

```
features/games/hammockJump/
├── engine/
│   └── HammockJumpEngine.ts    # Game logic, physics
├── audio/
│   ├── HammockJumpAudioManager.ts
│   └── index.ts
├── sounds/
│   ├── jump.wav
│   └── falling-sound-arcade.mp3
├── sprites/
│   ├── k1.webp - k7.webp       # K animation frames
│   └── index.ts
├── assets/
│   ├── hammock_background.webp
│   └── hammock_player.webp
└── utils/
    └── assets.ts
```

## Engine Callbacks

```typescript
// Audio callbacks
onPlatformLand: () => void    // Play jump sound
onPlayerFalling: () => void   // Play falling sound

// Player control
freezePlayer(): void          // Freeze for animations
unfreezePlayer(): void        // Resume physics
triggerGameOverWithBonus(bonus: number): void
```

## Component Integration

See `components/games/HammockJumpGame.tsx` for the full integration pattern using callbacks for engine-to-component communication.

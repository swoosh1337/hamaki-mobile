# Hamaki Game Engine Guide

This guide explains the game engine architecture and how to create new games in the Hamaki codebase.

## Architecture Overview

```
features/games/
├── core/                        # Shared game infrastructure
│   ├── BaseGameEngine.ts        # Abstract base class for all game engines
│   ├── types.ts                 # Shared types (GameEntity, Vector2D, etc.)
│   ├── utils.ts                 # Utility functions (collision, math, etc.)
│   ├── index.ts                 # Core exports
│   └── audio/
│       ├── BaseAudioManager.ts  # Abstract base class for game audio
│       └── index.ts             # Audio exports
│
├── noPogod/                     # Example game: NoPogod (Wolf catch game)
│   ├── engine/
│   │   ├── NoPogodEngine.ts     # Game engine extending BaseGameEngine
│   │   ├── CollisionSystem.ts   # Collision detection
│   │   ├── ItemSpawner.ts       # Item generation
│   │   ├── PlayerController.ts  # Player movement
│   │   ├── ShonzikaAI.ts        # AI behavior
│   │   ├── config.ts            # Game constants
│   │   └── types.ts             # Game-specific types
│   ├── audio/
│   │   ├── NoPogodAudioManager.ts
│   │   └── index.ts
│   ├── sounds/                  # Audio files (.mp3, .wav)
│   ├── assets/                  # Images (.webp)
│   └── utils/
│       └── assets.ts            # Asset exports
│
├── hammockJump/                 # Example game: Hammock Jump (Doodle Jump style)
│   ├── engine/
│   │   └── HammockJumpEngine.ts
│   ├── audio/
│   │   ├── HammockJumpAudioManager.ts
│   │   └── index.ts
│   ├── sounds/
│   ├── sprites/                 # Animation frames
│   ├── assets/
│   └── utils/
│       └── assets.ts
│
└── shared/                      # Shared game utilities
    ├── hooks/
    │   └── useGameAssets.ts
    └── services/
        └── GameAssetLoader.ts

components/games/                # React Native UI components
├── NoPogodGame.tsx              # NoPogod main component
├── NoPogodGameCanvas.tsx        # NoPogod Skia canvas
├── HammockJumpGame.tsx          # HammockJump main component
└── GameCanvas.tsx               # HammockJump Skia canvas
```

## Core Components

### 1. BaseGameEngine (`features/games/core/BaseGameEngine.ts`)

Abstract base class providing:
- **Game loop management**: `startGame()`, `pauseGame()`, `resumeGame()`, `exitGame()`
- **Timer system**: Countdown with pause support
- **Lives system**: Track and manage player lives
- **Score system**: Track and manage scores
- **Phase state machine**: `MENU` → `PLAYING` → `PAUSED` → `GAME_OVER`

```typescript
// Base state interface all games must implement
interface BaseGameState {
    phase: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
    score: number;
    screenWidth: number;
    screenHeight: number;
}

// Abstract methods to implement
abstract class BaseGameEngine<TState extends BaseGameState> {
    // Required: Create initial game state
    protected abstract createInitialState(
        screenWidth: number,
        screenHeight: number
    ): TState;

    // Required: Game-specific update logic (called every frame)
    protected abstract onGameUpdate(deltaTime: number): void;

    // Required: Called when game starts
    protected abstract onGameStart(): void;

    // Required: Called when game resets
    protected abstract onGameReset(): void;
}
```

### 2. BaseAudioManager (`features/games/core/audio/BaseAudioManager.ts`)

Abstract base class providing:
- Background music with loop, volume, start position
- Sound effects with volume, duration limits
- Pause/resume synchronized with game state
- Auto-cleanup to prevent memory leaks

```typescript
interface SoundConfig {
    id: string;                  // Unique identifier
    source: number;              // require() result
    loop?: boolean;              // Default: false
    volume?: number;             // 0.0 to 1.0, default: 1.0
    startPositionMs?: number;    // Skip intro (default: 0)
    maxDurationMs?: number;      // Stop early to skip ending
}

abstract class BaseAudioManager {
    // Required: Define your game's sounds
    protected abstract getAudioConfig(): AudioManagerConfig;

    // Available methods
    async loadSounds(): Promise<void>;
    async unloadSounds(): Promise<void>;
    async playBackground(): Promise<void>;
    async stopBackground(): Promise<void>;
    async pauseBackground(): Promise<void>;
    async resumeBackground(): Promise<void>;
    async playSound(soundId: string): Promise<void>;
}
```

### 3. Core Utilities (`features/games/core/utils.ts`)

```typescript
// Collision detection
rectanglesCollide(rect1, rect2): boolean
pointInRectangle(point, rect): boolean

// Math utilities
clamp(value, min, max): number
lerp(start, end, t): number
easeInOutQuad(t): number
distance(point1, point2): number

// Random
randomBetween(min, max): number
randomIntBetween(min, max): number
randomChoice<T>(array: T[]): T

// Helpers
generateId(prefix): string
formatTime(seconds): string
```

## Creating a New Game

### Step 1: Create Directory Structure

```
features/games/yourGame/
├── engine/
│   ├── YourGameEngine.ts
│   ├── config.ts           # Game constants
│   └── types.ts            # Game-specific types
├── audio/
│   ├── YourGameAudioManager.ts
│   └── index.ts
├── sounds/
│   └── *.mp3, *.wav
├── assets/
│   └── *.webp
└── utils/
    └── assets.ts
```

### Step 2: Define Game Types

```typescript
// features/games/yourGame/engine/types.ts

import { BaseGameState } from '../../core';

export interface YourGameState extends BaseGameState {
    // Add game-specific state
    player: PlayerState;
    enemies: Enemy[];
    powerups: Powerup[];
    // etc.
}

export interface PlayerState {
    x: number;
    y: number;
    health: number;
    // etc.
}
```

### Step 3: Create Game Engine

```typescript
// features/games/yourGame/engine/YourGameEngine.ts

import { BaseGameEngine } from '../../core';
import type { YourGameState } from './types';
import { GAME_CONFIG } from './config';

export class YourGameEngine extends BaseGameEngine<YourGameState> {
    // Audio callbacks - use this pattern for engine-to-component communication
    public onPlayerHit: (() => void) | null = null;
    public onEnemyDefeated: (() => void) | null = null;
    public onPowerupCollected: ((type: string) => void) | null = null;

    constructor(screenWidth: number, screenHeight: number) {
        super(screenWidth, screenHeight, {
            gameDuration: GAME_CONFIG.DURATION,
            initialLives: GAME_CONFIG.LIVES,
        });
    }

    // Required: Create initial state
    protected createInitialState(
        screenWidth: number,
        screenHeight: number
    ): YourGameState {
        return {
            phase: 'MENU',
            score: 0,
            screenWidth,
            screenHeight,
            player: this.createInitialPlayerState(screenWidth, screenHeight),
            enemies: [],
            powerups: [],
        };
    }

    // Required: Called when game starts
    protected onGameStart(): void {
        // Initialize game-specific state
    }

    // Required: Called when game resets
    protected onGameReset(): void {
        // Reset game-specific state
        this.gameState.player = this.createInitialPlayerState(
            this.gameState.screenWidth,
            this.gameState.screenHeight
        );
        this.gameState.enemies = [];
    }

    // Required: Main update loop (called every frame)
    protected onGameUpdate(deltaTime: number): void {
        this.updatePlayer(deltaTime);
        this.updateEnemies(deltaTime);
        this.checkCollisions();
    }

    // Public methods for player input
    movePlayer(direction: 'LEFT' | 'RIGHT'): void {
        if (!this.isGameActive()) return;
        // Update player position
    }

    // Private update methods
    private updatePlayer(deltaTime: number): void {
        // Player physics, movement, etc.
    }

    private updateEnemies(deltaTime: number): void {
        // Enemy AI, spawning, etc.
    }

    private checkCollisions(): void {
        // Check player-enemy collisions
        // Trigger callbacks when events occur:
        if (playerHitByEnemy) {
            this.loseLife();
            this.onPlayerHit?.();
        }

        if (enemyDefeated) {
            this.addScore(100);
            this.onEnemyDefeated?.();
        }

        if (powerupCollected) {
            this.onPowerupCollected?.(powerup.type);
        }
    }
}
```

### Step 4: Create Audio Manager

```typescript
// features/games/yourGame/audio/YourGameAudioManager.ts

import { AudioManagerConfig, BaseAudioManager } from '../../core/audio';

const hitSound = require('../sounds/hit.mp3');
const powerupSound = require('../sounds/powerup.wav');
const backgroundMusic = require('../sounds/background.mp3');

export const YOUR_GAME_SOUNDS = {
    HIT: 'hit',
    POWERUP: 'powerup',
    BACKGROUND: 'background',
} as const;

export class YourGameAudioManager extends BaseAudioManager {
    protected getAudioConfig(): AudioManagerConfig {
        return {
            backgroundMusic: {
                id: YOUR_GAME_SOUNDS.BACKGROUND,
                source: backgroundMusic,
                loop: true,
                volume: 0.3,
            },
            soundEffects: [
                {
                    id: YOUR_GAME_SOUNDS.HIT,
                    source: hitSound,
                    volume: 0.8,
                },
                {
                    id: YOUR_GAME_SOUNDS.POWERUP,
                    source: powerupSound,
                    volume: 0.7,
                    maxDurationMs: 1000, // Stop after 1 second
                },
            ],
        };
    }

    // Convenience methods for your game
    async playHitSound(): Promise<void> {
        await this.playSound(YOUR_GAME_SOUNDS.HIT);
    }

    async playPowerupSound(): Promise<void> {
        await this.playSound(YOUR_GAME_SOUNDS.POWERUP);
    }
}
```

### Step 5: Create Game Component

```typescript
// components/games/YourGame.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, SafeAreaView, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { YourGameAudioManager } from '@/features/games/yourGame/audio';
import { YourGameEngine, YourGameState } from '@/features/games/yourGame/engine';

interface YourGameProps {
    visible: boolean;
    onClose: () => void;
}

export const YourGame: React.FC<YourGameProps> = ({ visible, onClose }) => {
    const { userProfile, updateUserProfile } = useAuth();
    const gameEngineRef = useRef<YourGameEngine | null>(null);
    const audioManagerRef = useRef<YourGameAudioManager | null>(null);
    const [gameState, setGameState] = useState<YourGameState | null>(null);
    const [xpAwarded, setXpAwarded] = useState(false);

    // Initialize engine and audio
    useEffect(() => {
        if (visible && !gameEngineRef.current) {
            // Create engine
            gameEngineRef.current = new YourGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT);
            setGameState(gameEngineRef.current.getState());

            // Create and load audio
            audioManagerRef.current = new YourGameAudioManager();
            audioManagerRef.current.loadSounds();

            // IMPORTANT: Set up audio callbacks
            // This is the pattern for engine-to-component communication
            gameEngineRef.current.onPlayerHit = () => {
                audioManagerRef.current?.playHitSound();
            };

            gameEngineRef.current.onPowerupCollected = (type) => {
                audioManagerRef.current?.playPowerupSound();
            };
        }
    }, [visible]);

    // Cleanup on unmount
    useEffect(() => {
        if (!visible) {
            gameEngineRef.current = null;
            setGameState(null);

            if (audioManagerRef.current) {
                audioManagerRef.current.unloadSounds();
                audioManagerRef.current = null;
            }
        }
    }, [visible]);

    // Game loop update
    const handleGameUpdate = useCallback((currentTime: number) => {
        if (gameEngineRef.current) {
            gameEngineRef.current.update(currentTime);
            setGameState(gameEngineRef.current.getState());
        }
    }, []);

    // Control handlers - use callbacks, not direct engine calls from children
    const handleStartGame = useCallback(() => {
        gameEngineRef.current?.startGame();
        audioManagerRef.current?.playBackground();
        setGameState(gameEngineRef.current?.getState() || null);
        setXpAwarded(false);
    }, []);

    const handlePauseGame = useCallback(() => {
        gameEngineRef.current?.pauseGame();
        audioManagerRef.current?.pauseBackground();
        setGameState(gameEngineRef.current?.getState() || null);
    }, []);

    const handleResumeGame = useCallback(() => {
        gameEngineRef.current?.resumeGame();
        audioManagerRef.current?.resumeBackground();
        setGameState(gameEngineRef.current?.getState() || null);
    }, []);

    const handleExitGame = useCallback(() => {
        gameEngineRef.current?.exitGame();
        audioManagerRef.current?.stopBackground();
        setGameState(gameEngineRef.current?.getState() || null);
        onClose();
    }, [onClose]);

    // Award XP on game over
    useEffect(() => {
        if (gameState?.phase === 'GAME_OVER' && !xpAwarded && userProfile) {
            setXpAwarded(true);
            // Award XP via edge function...
        }
    }, [gameState?.phase, xpAwarded, userProfile]);

    if (!visible || !gameState) return null;

    return (
        <Modal visible={visible} animationType="slide">
            <SafeAreaView style={{ flex: 1 }}>
                <YourGameCanvas
                    gameState={gameState}
                    onStartGame={handleStartGame}
                    onPauseGame={handlePauseGame}
                    onResumeGame={handleResumeGame}
                    onExitGame={handleExitGame}
                    onUpdate={handleGameUpdate}
                />
            </SafeAreaView>
        </Modal>
    );
};
```

### Step 6: Create Canvas Component (Skia)

```typescript
// components/games/YourGameCanvas.tsx

import { Canvas, Image, useImage } from '@shopify/react-native-skia';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { YOUR_GAME_ASSETS } from '@/features/games/yourGame/utils/assets';
import type { YourGameState } from '@/features/games/yourGame/engine';

interface YourGameCanvasProps {
    gameState: YourGameState;
    onStartGame: () => void;
    onPauseGame: () => void;
    onResumeGame: () => void;
    onExitGame: () => void;
    onUpdate: (currentTime: number) => void;
}

export const YourGameCanvas: React.FC<YourGameCanvasProps> = ({
    gameState,
    onStartGame,
    onPauseGame,
    onResumeGame,
    onExitGame,
    onUpdate,
}) => {
    // Load Skia images
    const backgroundImage = useImage(YOUR_GAME_ASSETS.background);
    const playerImage = useImage(YOUR_GAME_ASSETS.player);

    // Game loop using requestAnimationFrame
    const animationFrameRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (gameState.phase === 'PLAYING') {
            const gameLoop = (timestamp: number) => {
                onUpdate(timestamp);
                animationFrameRef.current = requestAnimationFrame(gameLoop);
            };
            animationFrameRef.current = requestAnimationFrame(gameLoop);
        } else {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [gameState.phase, onUpdate]);

    return (
        <View style={styles.container}>
            <Canvas style={styles.canvas}>
                {/* Background */}
                {backgroundImage && (
                    <Image image={backgroundImage} x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fit="cover" />
                )}

                {/* Player */}
                {gameState.phase === 'PLAYING' && playerImage && (
                    <Image
                        image={playerImage}
                        x={gameState.player.x}
                        y={gameState.player.y}
                        width={50}
                        height={50}
                    />
                )}

                {/* Enemies, powerups, etc. */}
            </Canvas>

            {/* UI Overlays */}
            {gameState.phase === 'MENU' && (
                <View style={styles.menuOverlay}>
                    <Pressable onPress={onStartGame}>
                        <Text>START</Text>
                    </Pressable>
                </View>
            )}

            {gameState.phase === 'GAME_OVER' && (
                <View style={styles.gameOverOverlay}>
                    <Text>Game Over! Score: {gameState.score}</Text>
                    <Pressable onPress={onStartGame}>
                        <Text>PLAY AGAIN</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
};
```

## Best Practices

### 1. Callback Pattern for Engine Events

Never call engine methods directly from child components. Use callbacks:

```typescript
// ✅ GOOD: Callback pattern in parent component
gameEngineRef.current.onEvent = () => {
    audioManagerRef.current?.playSound();
    // Update state, trigger animations, etc.
};

// ❌ BAD: Direct engine call from child
// In GameCanvas.tsx
gameEngine?.doSomething(); // May be undefined, breaks encapsulation
```

### 2. State Updates

Always get state immutably from engine:

```typescript
const updateGameState = useCallback(() => {
    if (gameEngineRef.current) {
        setGameState(gameEngineRef.current.getState());
    }
}, []);
```

### 3. Audio Configuration

```typescript
{
    id: 'sound',
    source: require('../sounds/sound.mp3'),
    volume: 0.7,           // 0.0 to 1.0
    maxDurationMs: 2000,   // Stop early (optional)
    startPositionMs: 500,  // Skip intro (optional)
    loop: false,           // Loop sound (optional)
}
```

### 4. Asset Format

Use WebP for images (better compression, widely supported):

```bash
# Convert PNG to WebP
cwebp -q 85 image.png -o image.webp
```

### 5. Cleanup on Unmount

```typescript
useEffect(() => {
    return () => {
        audioManagerRef.current?.unloadSounds();
        gameEngineRef.current = null;
        if (accelerometerSubscription.current) {
            accelerometerSubscription.current.remove();
        }
    };
}, []);
```

### 6. XP Integration

Follow the pattern in HammockJumpGame.tsx or NoPogodGame.tsx:

1. Track game session with unique `sessionId`
2. Generate `idempotencyKey` for XP awarding
3. Call `award-xp` edge function on game over
4. Handle retries with `edgeFunctionQueueService`
5. Update local state optimistically

## Rendering with React Native Skia

Use `@shopify/react-native-skia` for high-performance rendering:

```typescript
import { Canvas, Image, Rect, Group, useImage } from '@shopify/react-native-skia';

// Load images
const image = useImage(require('./path/to/image.webp'));

// Render
<Canvas style={{ flex: 1 }}>
    <Image image={image} x={0} y={0} width={100} height={100} />
    <Rect x={50} y={50} width={20} height={20} color="red" />
    <Group transform={[{ translateX: 100 }]}>
        {/* Grouped elements */}
    </Group>
</Canvas>
```

## Example Games

### NoPogod (Wolf Catch)
- Timer-based gameplay (60 seconds)
- Lives system (3 lives)
- Complex AI (Shonzika throwing patterns)
- Multiple item types with different effects
- Background music + sound effects + voice quotes

### HammockJump (Doodle Jump)
- Endless gameplay (no timer)
- Score-based progression
- Physics-based player movement (gravity, jumping)
- Platform variety (normal, moving, breakable, spring)
- Accelerometer input with touch fallback
- Special animations (K animation)

## File Naming Conventions

- Engine files: `YourGameEngine.ts`
- Audio manager: `YourGameAudioManager.ts`
- Types: `types.ts`
- Config: `config.ts`
- Assets export: `assets.ts`
- Sounds: descriptive names (`jump.wav`, `catch_item.mp3`)
- Images: descriptive names (`player.webp`, `background.webp`)

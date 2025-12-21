/**
 * NoPogod Game Types
 * 
 * All type definitions for the No Pogodi game.
 * Types are organized by domain.
 */

import type { BaseGameState, GamePhase } from '../../core';

// =============================================================================
// PLAYER TYPES
// =============================================================================

/**
 * Player position on screen
 */
export type PlayerPosition = 'LEFT' | 'CENTER' | 'RIGHT';

/**
 * Player sprite state
 */
export type PlayerSprite = 'IDLE' | 'MOVING';

/**
 * Complete player state
 */
export interface PlayerState {
    /** Current lane position */
    position: PlayerPosition;
    /** Current X coordinate in pixels */
    x: number;
    /** Current Y coordinate in pixels */
    y: number;
    /** Target X for animation */
    targetX: number;
    /** Starting X for animation */
    startX: number;
    /** Whether player is currently moving */
    isMoving: boolean;
    /** Current sprite state */
    sprite: PlayerSprite;
    /** Animation progress 0-1 */
    animationProgress: number;
    /** When movement started (timestamp) */
    movementStartTime: number;
    /** Whether speed boost is active */
    speedBoostActive: boolean;
    /** When speed boost ends (timestamp) */
    speedBoostEndTime: number;
}

// =============================================================================
// SHONZIKA TYPES
// =============================================================================

/**
 * Shonzika sprite state
 */
export type ShonzikaSprite = 'IDLE' | 'THROWING' | 'WALKING';

/**
 * Complete Shonzika state
 */
export interface ShonzikaState {
    /** Current lane position */
    position: PlayerPosition;
    /** Current X coordinate in pixels */
    x: number;
    /** Current Y coordinate in pixels */
    y: number;
    /** Target X for animation */
    targetX: number;
    /** Starting X for animation */
    startX: number;
    /** Whether Shonzika is currently moving */
    isMoving: boolean;
    /** Current sprite state */
    sprite: ShonzikaSprite;
    /** Time until next throw */
    throwCooldown: number;
    /** Timer for visual throw animation */
    visualThrowTimer: number;
    /** Animation progress 0-1 */
    animationProgress: number;
    /** When movement started (timestamp) */
    movementStartTime: number;
    /** When next movement should occur */
    nextMoveTime: number;
}

// =============================================================================
// ITEM TYPES
// =============================================================================

/**
 * Types of items that can fall
 */
export type ItemType = 'EGG' | 'TOMATO' | 'PEPPER' | 'ELECTRIC_SHOCK' | 'BOMB';

/**
 * Item behavior definition
 */
export interface ItemDefinition {
    /** Points awarded when caught */
    points: number;
    /** Whether this is a bad item */
    isBad: boolean;
    /** Whether catching/missing causes instant game over */
    isDeadly: boolean;
    /** Whether this item MUST be caught */
    mustCatch: boolean;
    /** Whether this item should be avoided */
    shouldAvoid: boolean;
}

/**
 * A falling item in the game
 */
export interface FallingItem {
    /** Unique identifier */
    id: string;
    /** Type of item */
    type: ItemType;
    /** Current X position */
    x: number;
    /** Current Y position */
    y: number;
    /** Horizontal velocity */
    velocityX: number;
    /** Vertical velocity */
    velocityY: number;
    /** Sprite reference (null if not loaded) */
    sprite: unknown;
    /** Points awarded when caught */
    points: number;
    /** Whether this is a bad item */
    isBad: boolean;
    /** Whether catching/missing causes instant game over */
    isDeadly: boolean;
    /** Whether this item MUST be caught */
    mustCatch: boolean;
    /** Whether this item should be avoided */
    shouldAvoid: boolean;
}

// =============================================================================
// GAME STATE
// =============================================================================

/**
 * Animation managers for characters
 */
export interface GameAnimations {
    miro: unknown;  // SpriteAnimationManager from assets
    shonzika: unknown;
}

/**
 * Complete game state for No Pogodi
 */
export interface NoPogodGameState extends BaseGameState {
    phase: GamePhase;
    score: number;
    lives: number;
    timeRemaining: number;
    player: PlayerState;
    items: FallingItem[];
    shonzika: ShonzikaState;
    screenWidth: number;
    screenHeight: number;
    animations: GameAnimations;
}

// =============================================================================
// COLLISION TYPES
// =============================================================================

/**
 * Result of a collision check
 */
export interface CollisionResult {
    /** Whether collision occurred */
    collided: boolean;
    /** The item that was collided with */
    item?: FallingItem;
}

/**
 * Bounding box for collision detection
 */
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// =============================================================================
// TOUCH INPUT TYPES
// =============================================================================

/**
 * Touch zone boundaries
 */
export interface TouchZones {
    left: number;
    center: number;
    right: number;
}

// =============================================================================
// GAME RESULT
// =============================================================================

/**
 * End-of-game result
 */
export interface NoPogodGameResult {
    score: number;
    timePlayedMs: number;
    itemsCaught: number;
    livesRemaining: number;
    endReason: 'TIME_UP' | 'BOMB_CAUGHT' | 'LIVES_LOST' | 'PLAYER_EXIT';
}

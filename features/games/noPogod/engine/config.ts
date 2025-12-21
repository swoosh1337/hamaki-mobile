/**
 * NoPogod Game Configuration
 * 
 * All game constants and configuration values.
 * Having these in a single place makes balancing easier.
 */

import type { ItemDefinition, ItemType } from './types';

// =============================================================================
// TIMING CONFIGURATION
// =============================================================================

export const TIMING = {
    /** Total game duration in milliseconds */
    GAME_DURATION: 60000,
    /** Base interval between item spawns in ms */
    ITEM_SPAWN_INTERVAL: 1500,
    /** Random variance in spawn timing */
    ITEM_SPAWN_VARIANCE: 500,
} as const;

// =============================================================================
// SCORING CONFIGURATION
// =============================================================================

export const SCORING = {
    /** Points for catching a good item */
    GOOD_ITEM_POINTS: 10,
    /** Starting number of lives */
    INITIAL_LIVES: 3,
} as const;

// =============================================================================
// PHYSICS CONFIGURATION
// =============================================================================

export const PHYSICS = {
    /** Base fall speed for items */
    ITEM_FALL_SPEED: 5.0,
    /** Fall acceleration (0 = constant speed) */
    ITEM_FALL_ACCELERATION: 0,
} as const;

// =============================================================================
// POSITION CONFIGURATION
// =============================================================================

export const POSITIONS = {
    /** Player lane positions as screen percentage */
    PLAYER: {
        LEFT: 0.25,
        CENTER: 0.5,
        RIGHT: 0.75,
    },
    /** Shonzika position (x = center, y = percentage from top) */
    SHONZIKA: { x: 0.5, y: 0.35 },
    /** Miro ground position (percentage from top) */
    MIRO_GROUND_Y: 0.75,
} as const;

// =============================================================================
// SIZE CONFIGURATION
// =============================================================================

export const SIZES = {
    /** Character sprite size */
    CHARACTER_SIZE: 80,
    /** Falling item size */
    ITEM_SIZE: 40,
} as const;

// =============================================================================
// ANIMATION CONFIGURATION
// =============================================================================

export const ANIMATION = {
    // Player movement
    /** Normal movement duration in ms */
    PLAYER_MOVE_DURATION: 200,
    /** Movement interpolation speed */
    PLAYER_MOVE_SPEED: 0.8,
    /** Boosted movement duration in ms */
    PLAYER_MOVE_DURATION_BOOSTED: 100,
    /** Speed boost duration in ms */
    SPEED_BOOST_DURATION: 5000,

    // Shonzika movement
    /** Shonzika movement duration in ms */
    SHONZIKA_MOVE_DURATION: 2000,
    /** Minimum time between movements */
    SHONZIKA_MOVE_INTERVAL_MIN: 100,
    /** Maximum time between movements */
    SHONZIKA_MOVE_INTERVAL_MAX: 300,
    /** Shonzika movement speed (pixels per ms) */
    SHONZIKA_SPEED_PX_PER_MS: 0.24,
    /** Character half-width for boundary calculation */
    SHONZIKA_CHARACTER_HALF_WIDTH: 75,
    /** Edge padding for Shonzika */
    SHONZIKA_EDGE_PADDING: 10,
    /** Walk animation cycles per second */
    SHONZIKA_WALK_CYCLES_PER_SEC: 4.5,
    /** How long throwing pose is shown in ms */
    SHONZIKA_THROW_VISUAL_MS: 250,
} as const;

// =============================================================================
// ITEM SPAWN WEIGHTS
// =============================================================================

export const SPAWN_WEIGHTS: Record<ItemType, number> = {
    EGG: 30,
    TOMATO: 25,
    PEPPER: 25,
    ELECTRIC_SHOCK: 15,
    BOMB: 5,
} as const;

// =============================================================================
// ITEM DEFINITIONS
// =============================================================================

export const ITEM_DEFINITIONS: Record<ItemType, ItemDefinition> = {
    EGG: {
        points: SCORING.GOOD_ITEM_POINTS,
        isBad: false,
        isDeadly: false,
        mustCatch: false,
        shouldAvoid: false,
    },
    TOMATO: {
        points: SCORING.GOOD_ITEM_POINTS,
        isBad: false,
        isDeadly: false,
        mustCatch: false,
        shouldAvoid: false,
    },
    PEPPER: {
        points: SCORING.GOOD_ITEM_POINTS,
        isBad: false,
        isDeadly: false,
        mustCatch: false,
        shouldAvoid: false,
    },
    ELECTRIC_SHOCK: {
        points: 0,
        isBad: true,
        isDeadly: false,
        mustCatch: false,
        shouldAvoid: true,
    },
    BOMB: {
        points: 0,
        isBad: true,
        isDeadly: true,
        mustCatch: false,
        shouldAvoid: true,
    },
} as const;

// =============================================================================
// LEGACY CONFIG (for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use individual config objects instead
 */
export const NO_POGOD_CONFIG = {
    // Timing
    GAME_DURATION: TIMING.GAME_DURATION,
    ITEM_SPAWN_INTERVAL: TIMING.ITEM_SPAWN_INTERVAL,
    ITEM_SPAWN_VARIANCE: TIMING.ITEM_SPAWN_VARIANCE,

    // Scoring
    GOOD_ITEM_POINTS: SCORING.GOOD_ITEM_POINTS,
    INITIAL_LIVES: SCORING.INITIAL_LIVES,

    // Physics
    ITEM_FALL_SPEED: PHYSICS.ITEM_FALL_SPEED,
    ITEM_FALL_ACCELERATION: PHYSICS.ITEM_FALL_ACCELERATION,

    // Positions
    PLAYER_POSITIONS: POSITIONS.PLAYER,
    SHONZIKA_POSITION: POSITIONS.SHONZIKA,
    MIRO_GROUND_Y: POSITIONS.MIRO_GROUND_Y,

    // Sizes
    CHARACTER_SIZE: SIZES.CHARACTER_SIZE,
    ITEM_SIZE: SIZES.ITEM_SIZE,

    // Animation
    PLAYER_MOVE_DURATION: ANIMATION.PLAYER_MOVE_DURATION,
    PLAYER_MOVE_SPEED: ANIMATION.PLAYER_MOVE_SPEED,
    PLAYER_MOVE_DURATION_BOOSTED: ANIMATION.PLAYER_MOVE_DURATION_BOOSTED,
    SPEED_BOOST_DURATION: ANIMATION.SPEED_BOOST_DURATION,
    SHONZIKA_MOVE_DURATION: ANIMATION.SHONZIKA_MOVE_DURATION,
    SHONZIKA_MOVE_INTERVAL_MIN: ANIMATION.SHONZIKA_MOVE_INTERVAL_MIN,
    SHONZIKA_MOVE_INTERVAL_MAX: ANIMATION.SHONZIKA_MOVE_INTERVAL_MAX,
    SHONZIKA_SPEED_PX_PER_MS: ANIMATION.SHONZIKA_SPEED_PX_PER_MS,
    SHONZIKA_CHARACTER_HALF_WIDTH: ANIMATION.SHONZIKA_CHARACTER_HALF_WIDTH,
    SHONZIKA_EDGE_PADDING: ANIMATION.SHONZIKA_EDGE_PADDING,
    SHONZIKA_WALK_CYCLES_PER_SEC: ANIMATION.SHONZIKA_WALK_CYCLES_PER_SEC,
    SHONZIKA_THROW_VISUAL_MS: ANIMATION.SHONZIKA_THROW_VISUAL_MS,

    // Item probabilities
    ITEM_SPAWN_WEIGHTS: SPAWN_WEIGHTS,
} as const;

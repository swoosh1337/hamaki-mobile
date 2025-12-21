/**
 * Core Game Engine Types
 * 
 * Additional types and interfaces that extend the base game functionality.
 * The core types (GamePhase, BaseGameState) are defined in BaseGameEngine.ts
 */

/**
 * Game configuration interface for consistent game setup
 */
export interface GameConfig {
    /** Display name of the game */
    name: string;

    /** Description of the game */
    description: string;

    /** XP reward for completing the game */
    baseXpReward: number;

    /** XP multiplier based on score */
    xpPerPoint?: number;

    /** Cooldown period in milliseconds */
    cooldownMs: number;
}

/**
 * Result of a completed game session
 */
export interface GameResult {
    score: number;
    xpEarned: number;
    playDuration: number;
    completedAt: Date;
}

/**
 * Collision rectangle for collision detection
 */
export interface CollisionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 2D Vector/Point
 */
export interface Vector2D {
    x: number;
    y: number;
}

/**
 * Entity with position and size
 */
export interface GameEntity {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

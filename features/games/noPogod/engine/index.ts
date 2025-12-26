/**
 * NoPogod Engine Module
 * 
 * Barrel file for the NoPogod game engine.
 * Import from this file for clean access to all engine components.
 */

// Main engine
export { NoPogodEngine } from './NoPogodEngine';
export type { NoPogodGameAssets } from './NoPogodEngine';

// Types
export type {
    BoundingBox, CollisionResult, FallingItem, GameAnimations, ItemDefinition, ItemType, NoPogodGameResult, NoPogodGameState, PlayerPosition,
    PlayerSprite, PlayerState, ShonzikaSprite, ShonzikaState, TouchZones
} from './types';

// Configuration
export {
    ANIMATION, ITEM_DEFINITIONS,
    NO_POGOD_CONFIG, PHYSICS,
    POSITIONS, SCORING, SIZES, SPAWN_WEIGHTS, TIMING
} from './config';

// Sub-modules (for advanced usage)
export * as CollisionSystem from './CollisionSystem';
export * as ItemSpawner from './ItemSpawner';
export * as PlayerController from './PlayerController';
export * as ShonzikaAI from './ShonzikaAI';


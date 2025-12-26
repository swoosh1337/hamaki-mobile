/**
 * NoPogod Feature Module
 * 
 * Main entry point for the No Pogodi game feature.
 * 
 * Usage:
 * ```typescript
 * import { NoPogodEngine, NO_POGOD_CONFIG } from '@/features/games/noPogod';
 * 
 * const engine = new NoPogodEngine(screenWidth, screenHeight);
 * engine.startGame();
 * ```
 */

// Export everything from engine
export * from './engine';

// Export game-specific config
export {
    NOPOGOD_ASSET_CONFIG,
    NOPOGOD_GAME_ID,
    type NoPogodAtlasNames
} from './config/assetConfig';

// Export frame constants
export * from './generated/frameConstants';

// Re-export shared types (for convenience)
export type { AtlasFrame, AtlasFrameMap, LoadedAtlas } from '@/features/games/shared';


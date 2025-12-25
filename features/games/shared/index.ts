/**
 * Shared Game Features Module
 * 
 * Common utilities, types, and services for ALL games.
 * Use this to avoid code duplication across different games.
 */

// Types
export * from './types/atlas';

// Services
export { GameAssetLoader, gameAssetRegistry } from './services/GameAssetLoader';

// Hooks
export {
    preloadGameAssets, releaseAllGameAssets, releaseGameAssets, useGameAssets
} from './hooks/useGameAssets';


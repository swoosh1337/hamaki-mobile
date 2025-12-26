/**
 * Generic useGameAssets Hook
 * 
 * React hook that wraps GameAssetLoader for any game.
 * Pass your game config on first call, then use the assets.
 * 
 * Usage:
 * ```typescript
 * // In your game component:
 * const { isLoading, isReady, assets, release } = useGameAssets('noPogod', {
 *   background: require('./bg.webp'),
 *   atlases: {
 *     miro: { image: require('./miro.webp'), definition: miroJson },
 *   }
 * });
 * 
 * if (isLoading) return <Loading />;
 * // Use assets.atlases.miro?.frames[MIRO_FRAMES.IDLE]
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import { gameAssetRegistry } from '../services/GameAssetLoader';
import type {
    GameAssetConfig,
    LoadedGameAssets
} from '../types/atlas';

export interface UseGameAssetsReturn<T extends string = string> {
    /** True while assets are loading */
    isLoading: boolean;
    /** True when all assets are loaded and ready */
    isReady: boolean;
    /** Error if loading failed */
    error: Error | null;
    /** Loaded assets */
    assets: LoadedGameAssets<T>;
    /** Manually trigger asset load */
    load: () => Promise<void>;
    /** Release assets to free memory */
    release: () => void;
}

/**
 * Generic hook for loading game assets
 * 
 * @param gameId - Unique identifier for the game
 * @param config - Asset configuration (only needed on first call per game)
 */
export function useGameAssets<T extends string = string>(
    gameId: string,
    config?: Omit<GameAssetConfig, 'gameId'>
): UseGameAssetsReturn<T> {
    const [, forceUpdate] = useState({});

    // Get or create loader
    const loader = config
        ? gameAssetRegistry.getLoader<T>(gameId, config)
        : gameAssetRegistry.getLoader<T>(gameId);

    // Subscribe to state changes
    useEffect(() => {
        const unsubscribe = loader.subscribe(() => {
            forceUpdate({});
        });
        return unsubscribe;
    }, [loader]);

    // Auto-load on mount
    useEffect(() => {
        loader.load().catch(() => {
            // Error is captured in loader state
        });
    }, [loader]);

    const load = useCallback(async () => {
        await loader.load();
    }, [loader]);

    const release = useCallback(() => {
        loader.release();
    }, [loader]);

    const state = loader.getState();
    const assets = loader.getAssets();

    return {
        isLoading: state.isLoading,
        isReady: loader.isReady(),
        error: state.error,
        assets,
        load,
        release,
    };
}

/**
 * Preload game assets before component mount
 * Call this when user navigates to game selection screen
 */
export async function preloadGameAssets<T extends string = string>(
    gameId: string,
    config: Omit<GameAssetConfig, 'gameId'>
): Promise<boolean> {
    try {
        const loader = gameAssetRegistry.getLoader<T>(gameId, config);
        await loader.load();
        return loader.isReady();
    } catch {
        return false;
    }
}

/**
 * Release assets for a specific game
 */
export function releaseGameAssets(gameId: string): void {
    gameAssetRegistry.releaseGame(gameId);
}

/**
 * Release all game assets (call on app background/terminate)
 */
export function releaseAllGameAssets(): void {
    gameAssetRegistry.releaseAll();
}

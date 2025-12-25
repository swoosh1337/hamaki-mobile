/**
 * useGameAssets Hook
 * 
 * React hook for accessing game sprite atlases.
 * Assets are lazy-loaded when this hook is first called.
 * 
 * Features:
 * - Lazy loading (no load on app startup)
 * - Centralized via GameAssetRegistry
 * - Returns loading/error states
 * - Type-safe atlas access
 * 
 * Usage:
 *   const { isLoading, isReady, atlases, error } = useGameAssets();
 *   
 *   if (isLoading) return <Loading />;
 *   if (!isReady) return <Error />;
 *   
 *   // Use atlases.miro.frames[MIRO_FRAMES.IDLE] etc.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    areAssetsReady,
    getRegistryState,
    loadGameAssets,
    releaseGameAssets,
    subscribeToRegistry,
} from '../services/GameAssetRegistry';
import type { GameAtlases } from '../types/atlas';

export interface UseGameAssetsReturn {
    /** True while assets are loading */
    isLoading: boolean;
    /** True when all assets are loaded and ready */
    isReady: boolean;
    /** Error if loading failed */
    error: Error | null;
    /** Loaded atlases (null if not ready) */
    atlases: GameAtlases;
    /** Manually trigger asset load (usually automatic) */
    load: () => Promise<void>;
    /** Release assets to free memory */
    release: () => void;
}

export function useGameAssets(): UseGameAssetsReturn {
    const [, forceUpdate] = useState({});

    // Subscribe to registry state changes
    useEffect(() => {
        const unsubscribe = subscribeToRegistry(() => {
            forceUpdate({});
        });

        return unsubscribe;
    }, []);

    // Auto-load on mount
    useEffect(() => {
        loadGameAssets().catch(() => {
            // Error is captured in registry state
        });
    }, []);

    const load = useCallback(async () => {
        await loadGameAssets();
    }, []);

    const release = useCallback(() => {
        releaseGameAssets();
    }, []);

    const state = getRegistryState();

    return {
        isLoading: state.isLoading,
        isReady: areAssetsReady(),
        error: state.error,
        atlases: state.atlases,
        load,
        release,
    };
}

/**
 * Preload game assets before mounting the game canvas
 * Call this when user selects the game (before animation starts)
 */
export async function preloadGameAssets(): Promise<boolean> {
    try {
        await loadGameAssets();
        return areAssetsReady();
    } catch {
        return false;
    }
}

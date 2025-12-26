/**
 * Generic Game Asset Loader Service
 * 
 * A reusable asset loading service for ANY game that uses sprite atlases.
 * Following clean architecture - this service has no React dependencies
 * and can be used by any game's hooks.
 * 
 * Usage:
 * ```typescript
 * // In your game-specific hook/service:
 * const loader = new GameAssetLoader('noPogod', {
 *   background: require('./bg.webp'),
 *   atlases: {
 *     miro: { image: require('./miro.webp'), definition: miroJson },
 *     items: { image: require('./items.webp'), definition: itemsJson },
 *   }
 * });
 * 
 * await loader.load();
 * const assets = loader.getAssets();
 * ```
 */

import { createLogger } from '@/utils/logger';
import type { SkImage } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import type {
    AssetLoadingState,
    GameAssetConfig,
    LoadedAtlas,
    LoadedGameAssets
} from '../types/atlas';

const log = createLogger('GameAssetLoader');

/**
 * Generic game asset loader that works with any game configuration
 */
export class GameAssetLoader<TAtlasNames extends string = string> {
    private gameId: string;
    private config: GameAssetConfig;
    private state: AssetLoadingState = {
        isLoading: false,
        isLoaded: false,
        error: null,
    };
    private assets: LoadedGameAssets<TAtlasNames> = {
        background: null,
        atlases: {},
    };
    private loadPromise: Promise<void> | null = null;

    // Subscribers for state changes
    private subscribers: Set<() => void> = new Set();

    constructor(gameId: string, config: Omit<GameAssetConfig, 'gameId'>) {
        this.gameId = gameId;
        this.config = { ...config, gameId };
    }

    /**
     * Subscribe to state changes
     */
    subscribe(callback: () => void): () => void {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    private notifySubscribers(): void {
        this.subscribers.forEach(fn => fn());
    }

    /**
     * Get current loading state
     */
    getState(): AssetLoadingState {
        return { ...this.state };
    }

    /**
     * Get loaded assets (null if not loaded)
     */
    getAssets(): LoadedGameAssets<TAtlasNames> {
        return this.assets;
    }

    /**
     * Check if all assets are ready
     */
    isReady(): boolean {
        if (!this.state.isLoaded) return false;

        // Check background if configured
        if (this.config.background && !this.assets.background) return false;

        // Check all atlases
        for (const atlasName of Object.keys(this.config.atlases)) {
            if (!this.assets.atlases[atlasName as TAtlasNames]) return false;
        }

        return true;
    }

    /**
     * Load a single image from a require source
     */
    private async loadImage(source: number): Promise<SkImage | null> {
        try {
            const asset = Asset.fromModule(source);
            await asset.downloadAsync();

            if (!asset.localUri) {
                log.error(`Asset has no local URI for game ${this.gameId}`);
                return null;
            }

            const response = await fetch(asset.localUri);
            const arrayBuffer = await response.arrayBuffer();
            const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
            const image = Skia.Image.MakeImageFromEncoded(data);

            if (!image) {
                log.error(`Failed to decode image for game ${this.gameId}`);
                return null;
            }

            return image;
        } catch (error) {
            log.error(`Failed to load image for game ${this.gameId}`, error);
            return null;
        }
    }

    /**
     * Load all game assets
     */
    async load(): Promise<void> {
        // Already loaded
        if (this.state.isLoaded) {
            log.debug(`Assets already loaded for ${this.gameId}`);
            return;
        }

        // Already loading - wait for existing promise
        if (this.loadPromise) {
            log.debug(`Assets already loading for ${this.gameId}, waiting...`);
            return this.loadPromise;
        }

        log.info(`Starting asset load for game: ${this.gameId}`);

        this.state = { ...this.state, isLoading: true, error: null };
        this.notifySubscribers();

        this.loadPromise = (async () => {
            try {
                const startTime = Date.now();

                // Load background if configured
                if (this.config.background) {
                    this.assets.background = await this.loadImage(this.config.background);
                }

                // Load all atlases in parallel
                const atlasEntries = Object.entries(this.config.atlases);
                const atlasPromises = atlasEntries.map(async ([name, atlasConfig]) => {
                    const image = await this.loadImage(atlasConfig.image);
                    if (image) {
                        return {
                            name,
                            atlas: {
                                image,
                                frames: atlasConfig.definition.frames,
                                meta: atlasConfig.definition.meta,
                            } as LoadedAtlas,
                        };
                    }
                    return { name, atlas: null };
                });

                const loadedAtlases = await Promise.all(atlasPromises);

                // Populate atlases object
                for (const { name, atlas } of loadedAtlases) {
                    this.assets.atlases[name as TAtlasNames] = atlas;
                }

                const loadTime = Date.now() - startTime;
                log.info(`Game ${this.gameId} assets loaded in ${loadTime}ms`);

                this.state = {
                    isLoading: false,
                    isLoaded: true,
                    error: null,
                };
                this.loadPromise = null;
                this.notifySubscribers();

            } catch (error) {
                log.error(`Failed to load assets for game ${this.gameId}`, error);
                this.state = {
                    isLoading: false,
                    isLoaded: false,
                    error: error instanceof Error ? error : new Error('Unknown error'),
                };
                this.loadPromise = null;
                this.notifySubscribers();
                throw error;
            }
        })();

        return this.loadPromise;
    }

    /**
     * Release assets and allow GC to reclaim memory
     */
    release(): void {
        log.info(`Releasing assets for game: ${this.gameId}`);

        this.assets = {
            background: null,
            atlases: {},
        };
        this.state = {
            isLoading: false,
            isLoaded: false,
            error: null,
        };
        this.loadPromise = null;
        this.notifySubscribers();
    }
}

// ============================================================================
// GLOBAL REGISTRY - Manages loaders for all games
// ============================================================================

/**
 * Global registry of game asset loaders
 * Ensures each game only has one loader instance
 */
class GameAssetRegistry {
    private loaders: Map<string, GameAssetLoader<string>> = new Map();

    /**
     * Get or create a loader for a specific game
     */
    getLoader<T extends string>(
        gameId: string,
        config?: Omit<GameAssetConfig, 'gameId'>
    ): GameAssetLoader<T> {
        let loader = this.loaders.get(gameId) as GameAssetLoader<T> | undefined;

        if (!loader && config) {
            loader = new GameAssetLoader<T>(gameId, config);
            this.loaders.set(gameId, loader as GameAssetLoader<string>);
        }

        if (!loader) {
            throw new Error(`No loader registered for game: ${gameId}. Provide config on first call.`);
        }

        return loader;
    }

    /**
     * Release all game assets
     */
    releaseAll(): void {
        this.loaders.forEach(loader => loader.release());
    }

    /**
     * Release assets for a specific game
     */
    releaseGame(gameId: string): void {
        const loader = this.loaders.get(gameId);
        if (loader) {
            loader.release();
        }
    }
}

// Singleton instance
export const gameAssetRegistry = new GameAssetRegistry();

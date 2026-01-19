/**
 * Game Asset Registry (Singleton)
 * 
 * Centralized storage for loaded game atlases.
 * Prevents duplicate loads and provides clean lifecycle control.
 * 
 * Usage:
 *   - useGameAssets() hook reads from this registry
 *   - releaseGameAssets() clears the registry when game closes
 */

import { createLogger } from '@/utils/logger';
import type { SkImage } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import type { AtlasDefinition, GameAtlases } from '../types/atlas';

const log = createLogger('GameAssetRegistry');

// Atlas JSON imports (parsed once at module level)
import itemsAtlasJson from '../assets/atlases/items.json';
import miroAtlasJson from '../assets/atlases/miro.json';
import shonzikaAtlasJson from '../assets/atlases/shonzika.json';

// Atlas image requires (for Expo Asset loading)
const ATLAS_SOURCES = {
    background: require('../assets/atlases/bg.webp'),
    items: require('../assets/atlases/items.webp'),
    miro: require('../assets/atlases/miro.webp'),
    shonzika: require('../assets/atlases/shonzika.webp'),
};

/**
 * Registry state
 */
interface RegistryState {
    isLoading: boolean;
    isLoaded: boolean;
    error: Error | null;
    atlases: GameAtlases;
    loadPromise: Promise<void> | null;
}

const initialState: RegistryState = {
    isLoading: false,
    isLoaded: false,
    error: null,
    atlases: {
        background: null,
        miro: null,
        shonzika: null,
        items: null,
    },
    loadPromise: null,
};

// Singleton state
let registryState: RegistryState = { ...initialState };

// Subscribers for state changes
type Subscriber = () => void;
const subscribers: Set<Subscriber> = new Set();

function notifySubscribers(): void {
    subscribers.forEach(fn => fn());
}

/**
 * Subscribe to registry state changes
 */
export function subscribeToRegistry(callback: Subscriber): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/**
 * Get current registry state
 */
export function getRegistryState(): RegistryState {
    return registryState;
}

/**
 * Load a single WebP atlas image using Expo Asset + Skia
 */
async function loadAtlasImage(source: number): Promise<SkImage | null> {
    try {
        // Use Expo Asset to get the local URI
        const asset = Asset.fromModule(source);
        await asset.downloadAsync();

        if (!asset.localUri) {
            log.error('Asset has no local URI');
            return null;
        }

        // Load into Skia using the data approach
        const response = await fetch(asset.localUri);
        const arrayBuffer = await response.arrayBuffer();
        const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
        const image = Skia.Image.MakeImageFromEncoded(data);

        if (!image) {
            log.error('Failed to decode image');
            return null;
        }

        return image;
    } catch (error) {
        log.error('Failed to load atlas image', error);
        return null;
    }
}

/**
 * Load all game atlases
 * Returns immediately if already loaded or loading
 */
export async function loadGameAssets(): Promise<void> {
    // Already loaded
    if (registryState.isLoaded) {
        log.debug('Assets already loaded');
        return;
    }

    // Already loading - wait for existing promise
    if (registryState.loadPromise) {
        log.debug('Assets already loading, waiting...');
        return registryState.loadPromise;
    }

    log.info('Starting game asset load...');

    registryState = {
        ...registryState,
        isLoading: true,
        error: null,
    };
    notifySubscribers();

    const loadPromise = (async () => {
        try {
            const startTime = Date.now();

            // Load all images in parallel
            const [bgImage, itemsImage, miroImage, shonzikaImage] = await Promise.all([
                loadAtlasImage(ATLAS_SOURCES.background),
                loadAtlasImage(ATLAS_SOURCES.items),
                loadAtlasImage(ATLAS_SOURCES.miro),
                loadAtlasImage(ATLAS_SOURCES.shonzika),
            ]);

            // Build loaded atlases
            const atlases: GameAtlases = {
                background: bgImage,
                items: itemsImage ? {
                    image: itemsImage,
                    frames: (itemsAtlasJson as AtlasDefinition).frames,
                    meta: (itemsAtlasJson as AtlasDefinition).meta,
                } : null,
                miro: miroImage ? {
                    image: miroImage,
                    frames: (miroAtlasJson as AtlasDefinition).frames,
                    meta: (miroAtlasJson as AtlasDefinition).meta,
                } : null,
                shonzika: shonzikaImage ? {
                    image: shonzikaImage,
                    frames: (shonzikaAtlasJson as AtlasDefinition).frames,
                    meta: (shonzikaAtlasJson as AtlasDefinition).meta,
                } : null,
            };

            const loadTime = Date.now() - startTime;
            log.info(`Game assets loaded in ${loadTime}ms`);

            registryState = {
                isLoading: false,
                isLoaded: true,
                error: null,
                atlases,
                loadPromise: null,
            };
            notifySubscribers();

        } catch (error) {
            log.error('Failed to load game assets', error);
            registryState = {
                ...registryState,
                isLoading: false,
                error: error instanceof Error ? error : new Error('Unknown error'),
                loadPromise: null,
            };
            notifySubscribers();
            throw error;
        }
    })();

    registryState.loadPromise = loadPromise;
    return loadPromise;
}

/**
 * Release game assets and allow GC to reclaim memory
 * Call this when leaving the game screen
 */
export function releaseGameAssets(): void {
    log.info('Releasing game assets');

    // Clear references (GC will handle the rest)
    registryState = { ...initialState };
    notifySubscribers();
}

/**
 * Check if assets are ready to use
 */
export function areAssetsReady(): boolean {
    return registryState.isLoaded &&
        registryState.atlases.background !== null &&
        registryState.atlases.miro !== null &&
        registryState.atlases.shonzika !== null &&
        registryState.atlases.items !== null;
}

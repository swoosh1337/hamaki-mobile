/**
 * Game Asset Preloader
 * Pre-loads game images to avoid showing fallback rectangles
 */

import { Image } from 'react-native';
import { createLogger } from './logger';

const log = createLogger('AssetPreloader');

export interface PreloadedAssets {
  [key: string]: number; // Asset paths mapped to loaded asset IDs
}

export interface PreloadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentAsset: string;
}

/**
 * Pre-loads a single image asset
 */
async function preloadImage(
  source: any,
  name: string
): Promise<{ name: string; success: boolean; source: any }> {
  return new Promise((resolve) => {
    // Handle require() sources
    if (typeof source === 'number') {
      Image.prefetch(Image.resolveAssetSource(source).uri)
        .then(() => {
          log.debug(`Pre-loaded: ${name}`);
          resolve({ name, success: true, source });
        })
        .catch((error) => {
          log.error(`Failed to pre-load ${name}`, error);
          resolve({ name, success: false, source });
        });
    } else {
      // For URI strings
      Image.prefetch(source)
        .then(() => {
          log.debug(`Pre-loaded: ${name}`);
          resolve({ name, success: true, source });
        })
        .catch((error) => {
          log.error(`Failed to pre-load ${name}`, error);
          resolve({ name, success: false, source });
        });
    }
  });
}

/**
 * Pre-loads all No Pogod game assets
 */
export async function preloadNoPogodAssets(
  onProgress?: (progress: PreloadProgress) => void
): Promise<{ success: boolean; failedAssets: string[] }> {
  log.info('Starting No Pogod asset pre-loading...');

  const assets = [
    // Background
    { name: 'background', source: require('@/features/games/noPogod/assets/bg.webp') },

    // Miro sprites
    { name: 'miro-idle', source: require('@/features/games/noPogod/assets/miro/პროფილი დგომა.webp') },
    { name: 'miro-step1', source: require('@/features/games/noPogod/assets/miro/ნაბიჯი 1.webp') },
    { name: 'miro-step2', source: require('@/features/games/noPogod/assets/miro/ნაბიჯი 2.webp') },
    { name: 'miro-angle45', source: require('@/features/games/noPogod/assets/miro/დგომა 45 გრადუსი.webp') },
    { name: 'miro-angle90', source: require('@/features/games/noPogod/assets/miro/დგომა 90 გრადუსი.webp') },

    // Shonzika sprites
    { name: 'shonzika-idle', source: require('@/features/games/noPogod/assets/shonzika/დგომა პროფილი.webp') },
    { name: 'shonzika-idle90', source: require('@/features/games/noPogod/assets/shonzika/დგომა 90 გრადუსი.webp') },
    { name: 'shonzika-walk1', source: require('@/features/games/noPogod/assets/shonzika/სიარული 1.webp') },
    { name: 'shonzika-walk2', source: require('@/features/games/noPogod/assets/shonzika/სიარული 2~.webp') },
    { name: 'shonzika-hand-profile', source: require('@/features/games/noPogod/assets/shonzika/ხელი პროფილი.webp') },
    { name: 'shonzika-hand45', source: require('@/features/games/noPogod/assets/shonzika/ხელი 45 აგრადუსი.webp') },
    { name: 'shonzika-hand90', source: require('@/features/games/noPogod/assets/shonzika/ხელი 90 გრადუსი.webp') },

    // Item sprites
    { name: 'item-egg', source: require('@/features/games/noPogod/assets/items/კვერცხი.webp') },
    { name: 'item-tomato', source: require('@/features/games/noPogod/assets/items/პომიდორი.webp') },
    { name: 'item-pepper', source: require('@/features/games/noPogod/assets/items/წიწაკა.webp') },
    { name: 'item-electric', source: require('@/features/games/noPogod/assets/items/ელექტროშოკი.webp') },
    { name: 'item-bomb', source: require('@/features/games/noPogod/assets/items/ბომბი.webp') },
  ];

  const failedAssets: string[] = [];
  let loaded = 0;
  const total = assets.length;

  // Pre-load assets sequentially with progress updates
  for (const asset of assets) {
    if (onProgress) {
      onProgress({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
        currentAsset: asset.name,
      });
    }

    const result = await preloadImage(asset.source, asset.name);
    if (!result.success) {
      failedAssets.push(result.name);
    }

    loaded++;
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      loaded: total,
      total,
      percentage: 100,
      currentAsset: 'Complete',
    });
  }

  const success = failedAssets.length === 0;
  if (success) {
    log.info('All No Pogod assets pre-loaded successfully!');
  } else {
    log.warn('Pre-loading completed with failures', {
      failureCount: failedAssets.length,
      failedAssets
    });
  }

  return { success, failedAssets };
}

/**
 * Pre-loads Hammock Jump game assets
 */
export async function preloadHammockJumpAssets(
  onProgress?: (progress: PreloadProgress) => void
): Promise<{ success: boolean; failedAssets: string[] }> {
  log.info('Starting Hammock Jump asset pre-loading...');

  // Add Hammock Jump assets here when needed
  const assets: Array<{ name: string; source: any }> = [];

  if (assets.length === 0) {
    // No assets to pre-load yet
    if (onProgress) {
      onProgress({
        loaded: 0,
        total: 0,
        percentage: 100,
        currentAsset: 'No assets',
      });
    }
    return { success: true, failedAssets: [] };
  }

  // Similar implementation to No Pogod
  const failedAssets: string[] = [];
  let loaded = 0;
  const total = assets.length;

  for (const asset of assets) {
    if (onProgress) {
      onProgress({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
        currentAsset: asset.name,
      });
    }

    const result = await preloadImage(asset.source, asset.name);
    if (!result.success) {
      failedAssets.push(result.name);
    }

    loaded++;
  }

  if (onProgress) {
    onProgress({
      loaded: total,
      total,
      percentage: 100,
      currentAsset: 'Complete',
    });
  }

  return { success: failedAssets.length === 0, failedAssets };
}

/**
 * Pre-loads all game assets
 */
export async function preloadAllGameAssets(
  onProgress?: (progress: PreloadProgress) => void
): Promise<{ success: boolean; failedAssets: string[] }> {
  log.info('Starting pre-load of all game assets...');

  const allFailedAssets: string[] = [];

  // Pre-load No Pogod assets
  const noPogodResult = await preloadNoPogodAssets((progress) => {
    if (onProgress) {
      onProgress({
        ...progress,
        currentAsset: `[No Pogod] ${progress.currentAsset}`,
      });
    }
  });
  allFailedAssets.push(...noPogodResult.failedAssets);

  // Pre-load Hammock Jump assets
  const hammockResult = await preloadHammockJumpAssets((progress) => {
    if (onProgress) {
      onProgress({
        ...progress,
        currentAsset: `[Hammock Jump] ${progress.currentAsset}`,
      });
    }
  });
  allFailedAssets.push(...hammockResult.failedAssets);

  const success = allFailedAssets.length === 0;
  if (success) {
    log.info('All game assets pre-loaded successfully!');
  } else {
    log.warn('Pre-loading completed with failures', { count: allFailedAssets.length });
  }

  return { success, failedAssets: allFailedAssets };
}

/**
 * Cache status for assets
 */
let noPogodAssetsLoaded = false;
let hammockJumpAssetsLoaded = false;

export function areNoPogodAssetsLoaded(): boolean {
  return noPogodAssetsLoaded;
}

export function setNoPogodAssetsLoaded(loaded: boolean): void {
  noPogodAssetsLoaded = loaded;
}

export function areHammockJumpAssetsLoaded(): boolean {
  return hammockJumpAssetsLoaded;
}

export function setHammockJumpAssetsLoaded(loaded: boolean): void {
  hammockJumpAssetsLoaded = loaded;
}

/**
 * Reset all asset loading states (useful for testing or when needed)
 */
export function resetAssetLoadingState(): void {
  noPogodAssetsLoaded = false;
  hammockJumpAssetsLoaded = false;
  log.info('Asset loading state reset');
}

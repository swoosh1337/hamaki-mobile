/**
 * Game Asset Preloader
 * Pre-loads game images to avoid showing fallback rectangles
 */

import { Image } from 'react-native';

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
          console.log(`✅ Pre-loaded: ${name}`);
          resolve({ name, success: true, source });
        })
        .catch((error) => {
          console.error(`❌ Failed to pre-load ${name}:`, error);
          resolve({ name, success: false, source });
        });
    } else {
      // For URI strings
      Image.prefetch(source)
        .then(() => {
          console.log(`✅ Pre-loaded: ${name}`);
          resolve({ name, success: true, source });
        })
        .catch((error) => {
          console.error(`❌ Failed to pre-load ${name}:`, error);
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
  console.log('🎮 Starting No Pogod asset pre-loading...');

  const assets = [
    // Background
    { name: 'background', source: require('@/assets/images/game/bg.png') },

    // Miro sprites
    { name: 'miro-idle', source: require('@/assets/images/game/miro/პროფილი დგომა.png') },
    { name: 'miro-step1', source: require('@/assets/images/game/miro/ნაბიჯი 1.png') },
    { name: 'miro-step2', source: require('@/assets/images/game/miro/ნაბიჯი 2.png') },
    { name: 'miro-angle45', source: require('@/assets/images/game/miro/დგომა 45 გრადუსი.png') },
    { name: 'miro-angle90', source: require('@/assets/images/game/miro/დგომა 90 გრადუსი.png') },

    // Shonzika sprites
    { name: 'shonzika-idle', source: require('@/assets/images/game/shonzika/დგომა პროფილი.png') },
    { name: 'shonzika-idle90', source: require('@/assets/images/game/shonzika/დგომა 90 გრადუსი.png') },
    { name: 'shonzika-walk1', source: require('@/assets/images/game/shonzika/სიარული 1.png') },
    { name: 'shonzika-walk2', source: require('@/assets/images/game/shonzika/სიარული 2~.png') },
    { name: 'shonzika-hand-profile', source: require('@/assets/images/game/shonzika/ხელი პროფილი.png') },
    { name: 'shonzika-hand45', source: require('@/assets/images/game/shonzika/ხელი 45 აგრადუსი.png') },
    { name: 'shonzika-hand90', source: require('@/assets/images/game/shonzika/ხელი 90 გრადუსი.png') },

    // Item sprites
    { name: 'item-egg', source: require('@/assets/images/game/items/კვერცხი.png') },
    { name: 'item-tomato', source: require('@/assets/images/game/items/პომიდორი.png') },
    { name: 'item-pepper', source: require('@/assets/images/game/items/წიწაკა.png') },
    { name: 'item-electric', source: require('@/assets/images/game/items/ელექტროშოკი.png') },
    { name: 'item-bomb', source: require('@/assets/images/game/items/ბომბი.png') },
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
  console.log(
    success
      ? '✅ All No Pogod assets pre-loaded successfully!'
      : `⚠️ Pre-loading completed with ${failedAssets.length} failures: ${failedAssets.join(', ')}`
  );

  return { success, failedAssets };
}

/**
 * Pre-loads Hammock Jump game assets
 */
export async function preloadHammockJumpAssets(
  onProgress?: (progress: PreloadProgress) => void
): Promise<{ success: boolean; failedAssets: string[] }> {
  console.log('🎮 Starting Hammock Jump asset pre-loading...');

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
  console.log('🎮 Starting pre-load of all game assets...');

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
  console.log(
    success
      ? '✅ All game assets pre-loaded successfully!'
      : `⚠️ Pre-loading completed with ${allFailedAssets.length} failures`
  );

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
  console.log('🔄 Asset loading state reset');
}

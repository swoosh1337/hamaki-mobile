/**
 * NoPogod Game Asset Configuration
 * 
 * Game-specific configuration that uses the shared GameAssetLoader.
 * This is the ONLY file that contains NoPogod-specific asset paths.
 */

import type { GameAssetConfig } from '@/features/games/shared';

// Import atlas JSON definitions
import itemsAtlasJson from '../assets/atlases/items.json';
import miroAtlasJson from '../assets/atlases/miro.json';
import shonzikaAtlasJson from '../assets/atlases/shonzika.json';

// Type for NoPogod atlas names
export type NoPogodAtlasNames = 'miro' | 'shonzika' | 'items';

/**
 * NoPogod game asset configuration
 * Pass this to useGameAssets('noPogod', NOPOGOD_ASSET_CONFIG)
 */
export const NOPOGOD_ASSET_CONFIG: Omit<GameAssetConfig, 'gameId'> = {
    background: require('../assets/atlases/bg.webp'),
    atlases: {
        miro: {
            image: require('../assets/atlases/miro.webp'),
            definition: miroAtlasJson as any,
        },
        shonzika: {
            image: require('../assets/atlases/shonzika.webp'),
            definition: shonzikaAtlasJson as any,
        },
        items: {
            image: require('../assets/atlases/items.webp'),
            definition: itemsAtlasJson as any,
        },
    },
};

/**
 * Game ID constant - use this everywhere instead of magic strings
 */
export const NOPOGOD_GAME_ID = 'noPogod';

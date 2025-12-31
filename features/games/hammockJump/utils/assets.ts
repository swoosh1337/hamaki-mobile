/**
 * Hammock Jump Game Assets
 * 
 * Manages loading of game assets for the Hammock Jump game.
 * Uses optimized WebP images for better performance.
 */

import { createLogger } from '@/utils/logger';
import { ImageRequireSource } from 'react-native';

const log = createLogger('HammockJumpAssets');

// Import WebP assets  
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hammockBackground = require('../assets/hammock_background.webp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hammockPlayer = require('../assets/hammock_player.webp');

/**
 * All available game assets for Hammock Jump
 */
export interface HammockJumpGameAssets {
    background: ImageRequireSource;
    player: ImageRequireSource;
    // Future: could add platform sprites, item sprites, etc.
}

/**
 * Game asset configuration constant
 */
export const HAMMOCK_GAME_ID = 'hammockJump';

/**
 * Load all Hammock Jump game assets
 */
export function loadHammockJumpAssets(): HammockJumpGameAssets {
    try {
        log.debug('Loading Hammock Jump game assets');

        const assets: HammockJumpGameAssets = {
            background: hammockBackground,
            player: hammockPlayer,
        };

        log.info('Hammock Jump assets loaded successfully');
        return assets;
    } catch (error) {
        log.error('Failed to load Hammock Jump assets', error);
        // Return assets anyway - React Native will handle missing assets
        return {
            background: hammockBackground,
            player: hammockPlayer,
        };
    }
}

/**
 * Validate assets are properly loaded
 */
export function validateHammockJumpAssets(assets: HammockJumpGameAssets): boolean {
    if (!assets.background) {
        log.warn('Background asset missing');
        return false;
    }
    if (!assets.player) {
        log.warn('Player asset missing');
        return false;
    }
    return true;
}

// Pre-load assets
export const HAMMOCK_JUMP_ASSETS = loadHammockJumpAssets();

// Validate on load
if (!validateHammockJumpAssets(HAMMOCK_JUMP_ASSETS)) {
    log.warn('Some Hammock Jump assets failed validation');
}

/**
 * HammockJump Audio Manager
 *
 * Audio management specific to the HammockJump game.
 * Extends BaseAudioManager with game-specific sound configurations.
 */

import { AudioManagerConfig, BaseAudioManager } from '../../core/audio';

// Sound file imports
const jumpSound = require('../sounds/jump.wav');
const fallingSound = require('../sounds/falling-sound-arcade.mp3');
const fallingSkewerSound = require('../sounds/sfx_MultiSkewer_1.wav');
const itemCollectSound = require('../sounds/sfx_GenericBoost.wav');
const bigBoostSound = require('../sounds/sfx_sjd_ApplePunch.wav');
const specialPlatformSound = require('../sounds/sfx_sjd_CoconutSkewer.wav');
const breakablePlatformSound = require('../sounds/sfx_sjd_FruitFreeze.wav');

/**
 * Sound IDs for HammockJump game
 */
export const HAMMOCK_JUMP_SOUNDS = {
    JUMP: 'jump',
    FALLING: 'falling',
    FALLING_SKEWER: 'fallingSkewer',
    ITEM_COLLECT: 'itemCollect',
    BIG_BOOST: 'bigBoost',
    SPECIAL_PLATFORM: 'specialPlatform',
    BREAKABLE_PLATFORM: 'breakablePlatform',
} as const;

export type HammockJumpSoundId = typeof HAMMOCK_JUMP_SOUNDS[keyof typeof HAMMOCK_JUMP_SOUNDS];

/**
 * Audio manager for HammockJump game
 */
export class HammockJumpAudioManager extends BaseAudioManager {
    protected getAudioConfig(): AudioManagerConfig {
        return {
            soundEffects: [
                {
                    id: HAMMOCK_JUMP_SOUNDS.JUMP,
                    source: jumpSound,
                    volume: 0.35,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.FALLING,
                    source: fallingSound,
                    volume: 0.8,
                    maxDurationMs: 2000,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.FALLING_SKEWER,
                    source: fallingSkewerSound,
                    volume: 0.6,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.ITEM_COLLECT,
                    source: itemCollectSound,
                    volume: 0.5,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.BIG_BOOST,
                    source: bigBoostSound,
                    volume: 0.6,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.SPECIAL_PLATFORM,
                    source: specialPlatformSound,
                    volume: 0.5,
                },
                {
                    id: HAMMOCK_JUMP_SOUNDS.BREAKABLE_PLATFORM,
                    source: breakablePlatformSound,
                    volume: 0.6,
                },
            ],
        };
    }

    /**
     * Play the jump/landing sound effect (normal platforms)
     */
    async playJumpSound(): Promise<void> {
        await this.playSound(HAMMOCK_JUMP_SOUNDS.JUMP);
    }

    /**
     * Play the falling sound effects (when player falls off screen)
     * Plays both the arcade falling sound and the skewer sound
     */
    async playFallingSound(): Promise<void> {
        await Promise.all([
            this.playSound(HAMMOCK_JUMP_SOUNDS.FALLING),
            this.playSound(HAMMOCK_JUMP_SOUNDS.FALLING_SKEWER),
        ]);
    }

    /**
     * Play the item collection sound effect
     */
    async playItemCollectSound(): Promise<void> {
        await this.playSound(HAMMOCK_JUMP_SOUNDS.ITEM_COLLECT);
    }

    /**
     * Play the big boost sound (spring, bouncy platforms)
     */
    async playBigBoostSound(): Promise<void> {
        await this.playSound(HAMMOCK_JUMP_SOUNDS.BIG_BOOST);
    }

    /**
     * Play the special platform sound (moving, ice, conveyor, disappearing, crumbling)
     */
    async playSpecialPlatformSound(): Promise<void> {
        await this.playSound(HAMMOCK_JUMP_SOUNDS.SPECIAL_PLATFORM);
    }

    /**
     * Play the breakable platform sound
     */
    async playBreakablePlatformSound(): Promise<void> {
        await this.playSound(HAMMOCK_JUMP_SOUNDS.BREAKABLE_PLATFORM);
    }
}

export default HammockJumpAudioManager;

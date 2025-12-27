/**
 * NoPogod Audio Manager
 * 
 * Audio management specific to the NoPogod game.
 * Extends BaseAudioManager with game-specific sound configurations.
 */

import { AudioManagerConfig, BaseAudioManager } from '../../core/audio';

// Sound file imports
// eslint-disable-next-line @typescript-eslint/no-var-requires
const backgroundMusic = require('../sounds/Crash Bandicoot 1 Theme.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catchItemSound = require('../sounds/Crash Bandicoot Sounds - Wumpa Fruit.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catchPepperSound = require('../sounds/catch_pepper.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catchShockerSound = require('../sounds/catch_shocker.mp3');

// Miro quotes - plays when Miro catches good items
// eslint-disable-next-line @typescript-eslint/no-var-requires
const miroQuote1 = require('../sounds/miro_quote_1.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const miroQuote2 = require('../sounds/miro_quote_2.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const miroQuote3 = require('../sounds/miro_quote_3.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const miroQuote4 = require('../sounds/miro_quote_4.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const miroQuote5 = require('../sounds/miro_quote_5.mp3');

// Shonzika quotes - plays when Shonzika throws items
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shonzikaQuote1 = require('../sounds/shonzika_quote_1.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shonzikaQuote2 = require('../sounds/shonzika_quote_2.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shonzikaQuote3 = require('../sounds/shonzika_quote_3.mp3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shonzikaQuote4 = require('../sounds/shonzika_quote_4.mp3');

/**
 * Sound IDs for NoPogod game
 */
export const NOPOGOD_SOUNDS = {
    BACKGROUND: 'background',
    CATCH_ITEM: 'catchItem',
    CATCH_PEPPER: 'catchPepper',
    CATCH_SHOCKER: 'catchShocker',
    // Miro quotes
    MIRO_QUOTE_1: 'miroQuote1',
    MIRO_QUOTE_2: 'miroQuote2',
    MIRO_QUOTE_3: 'miroQuote3',
    MIRO_QUOTE_4: 'miroQuote4',
    MIRO_QUOTE_5: 'miroQuote5',
    // Shonzika quotes
    SHONZIKA_QUOTE_1: 'shonzikaQuote1',
    SHONZIKA_QUOTE_2: 'shonzikaQuote2',
    SHONZIKA_QUOTE_3: 'shonzikaQuote3',
    SHONZIKA_QUOTE_4: 'shonzikaQuote4',
} as const;

export type NoPogodSoundId = typeof NOPOGOD_SOUNDS[keyof typeof NOPOGOD_SOUNDS];

/**
 * Audio manager for NoPogod game
 */
export class NoPogodAudioManager extends BaseAudioManager {
    // Miro quotes - play when catching good items (egg, tomato, pepper)
    private miroQuotes: string[] = [
        NOPOGOD_SOUNDS.MIRO_QUOTE_1,
        NOPOGOD_SOUNDS.MIRO_QUOTE_2,
        NOPOGOD_SOUNDS.MIRO_QUOTE_3,
        NOPOGOD_SOUNDS.MIRO_QUOTE_4,
        NOPOGOD_SOUNDS.MIRO_QUOTE_5,
    ];

    // Shonzika quotes - play when throwing items
    private shonzikaQuotes: string[] = [
        NOPOGOD_SOUNDS.SHONZIKA_QUOTE_1,
        NOPOGOD_SOUNDS.SHONZIKA_QUOTE_2,
        NOPOGOD_SOUNDS.SHONZIKA_QUOTE_3,
        NOPOGOD_SOUNDS.SHONZIKA_QUOTE_4,
    ];

    // Track last played quote to avoid immediate repeats
    private lastMiroQuoteIndex: number = -1;
    private lastShonzikaQuoteIndex: number = -1;

    protected getAudioConfig(): AudioManagerConfig {
        return {
            backgroundMusic: {
                id: NOPOGOD_SOUNDS.BACKGROUND,
                source: backgroundMusic,
                loop: true,
                volume: 0.15, // Lowered from 0.3 to make quotes audible
                startPositionMs: 1000, // Skip first 1 second of intro
            },
            soundEffects: [
                {
                    id: NOPOGOD_SOUNDS.CATCH_ITEM,
                    source: catchItemSound,
                    volume: 0.7,
                    maxDurationMs: 500, // Stop after 500ms to skip ending
                },
                {
                    id: NOPOGOD_SOUNDS.CATCH_PEPPER,
                    source: catchPepperSound,
                    volume: 0.8,
                },
                {
                    id: NOPOGOD_SOUNDS.CATCH_SHOCKER,
                    source: catchShockerSound,
                    volume: 0.8,
                },
                // Miro quotes
                {
                    id: NOPOGOD_SOUNDS.MIRO_QUOTE_1,
                    source: miroQuote1,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.MIRO_QUOTE_2,
                    source: miroQuote2,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.MIRO_QUOTE_3,
                    source: miroQuote3,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.MIRO_QUOTE_4,
                    source: miroQuote4,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.MIRO_QUOTE_5,
                    source: miroQuote5,
                    volume: 0.5,
                },
                // Shonzika quotes
                {
                    id: NOPOGOD_SOUNDS.SHONZIKA_QUOTE_1,
                    source: shonzikaQuote1,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.SHONZIKA_QUOTE_2,
                    source: shonzikaQuote2,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.SHONZIKA_QUOTE_3,
                    source: shonzikaQuote3,
                    volume: 0.5,
                },
                {
                    id: NOPOGOD_SOUNDS.SHONZIKA_QUOTE_4,
                    source: shonzikaQuote4,
                    volume: 0.5,
                },
            ],
        };
    }

    /**
     * Play the catching item sound effect
     */
    async playCatchItemSound(): Promise<void> {
        await this.playSound(NOPOGOD_SOUNDS.CATCH_ITEM);
    }

    /**
     * Play a random Miro quote
     * Called when Miro catches good items - only plays 15% of the time
     */
    async playMiroQuote(): Promise<void> {
        if (this.miroQuotes.length === 0) return;

        // Only play 15% of the time to avoid being too frequent
        if (Math.random() > 0.15) return;

        // Pick a random quote, avoiding immediate repeat
        let randomIndex: number;
        if (this.miroQuotes.length === 1) {
            randomIndex = 0;
        } else {
            do {
                randomIndex = Math.floor(Math.random() * this.miroQuotes.length);
            } while (randomIndex === this.lastMiroQuoteIndex);
        }

        this.lastMiroQuoteIndex = randomIndex;
        const soundId = this.miroQuotes[randomIndex];

        await this.playSound(soundId);
    }

    /**
     * Play a random Shonzika quote
     * Called when Shonzika throws items - only plays 15% of the time
     */
    async playShonzikaQuote(): Promise<void> {
        if (this.shonzikaQuotes.length === 0) return;

        // Only play 15% of the time to avoid being too frequent
        if (Math.random() > 0.15) return;

        // Pick a random quote, avoiding immediate repeat
        let randomIndex: number;
        if (this.shonzikaQuotes.length === 1) {
            randomIndex = 0;
        } else {
            do {
                randomIndex = Math.floor(Math.random() * this.shonzikaQuotes.length);
            } while (randomIndex === this.lastShonzikaQuoteIndex);
        }

        this.lastShonzikaQuoteIndex = randomIndex;
        const soundId = this.shonzikaQuotes[randomIndex];

        await this.playSound(soundId);
    }

    /**
     * Play the catching pepper (speed boost) sound
     */
    async playCatchPepperSound(): Promise<void> {
        await this.playSound(NOPOGOD_SOUNDS.CATCH_PEPPER);
    }

    /**
     * Play the catching shocker (slowdown) sound
     */
    async playCatchShockerSound(): Promise<void> {
        await this.playSound(NOPOGOD_SOUNDS.CATCH_SHOCKER);
    }

    /**
     * Play the miss item sound
     * (Placeholder for future implementation)
     */
    async playMissSound(): Promise<void> {
        // await this.playSound(NOPOGOD_SOUNDS.MISS_ITEM);
    }
}

export default NoPogodAudioManager;

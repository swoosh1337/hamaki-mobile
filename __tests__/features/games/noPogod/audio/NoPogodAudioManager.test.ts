/**
 * NoPogodAudioManager Tests
 * 
 * Tests for the NoPogod game-specific audio manager.
 */

import { Audio } from 'expo-av';

// Mock expo-av
jest.mock('expo-av', () => ({
    Audio: {
        setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
        Sound: {
            createAsync: jest.fn(),
        },
    },
}));

// Mock the sound file require
jest.mock('@/features/games/noPogod/sounds/Crash Bandicoot 1 Theme.mp3', () => 'mock-background-music', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/Crash Bandicoot Sounds - Wumpa Fruit.mp3', () => 'mock-catch-sound', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/catch_pepper.mp3', () => 'mock-catch-pepper-sound', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/catch_shocker.mp3', () => 'mock-catch-shocker-sound', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/miro_quote_1.mp3', () => 'mock-miro-quote-1', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/miro_quote_2.mp3', () => 'mock-miro-quote-2', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/miro_quote_3.mp3', () => 'mock-miro-quote-3', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/miro_quote_4.mp3', () => 'mock-miro-quote-4', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/miro_quote_5.mp3', () => 'mock-miro-quote-5', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/shonzika_quote_1.mp3', () => 'mock-shonzika-quote-1', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/shonzika_quote_2.mp3', () => 'mock-shonzika-quote-2', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/shonzika_quote_3.mp3', () => 'mock-shonzika-quote-3', {
    virtual: true,
});

jest.mock('@/features/games/noPogod/sounds/shonzika_quote_4.mp3', () => 'mock-shonzika-quote-4', {
    virtual: true,
});

// Mock logger
jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { NOPOGOD_SOUNDS, NoPogodAudioManager } from '@/features/games/noPogod/audio/NoPogodAudioManager';

// Create mock sound object
const createMockSound = () => ({
    playAsync: jest.fn().mockResolvedValue(undefined),
    pauseAsync: jest.fn().mockResolvedValue(undefined),
    stopAsync: jest.fn().mockResolvedValue(undefined),
    unloadAsync: jest.fn().mockResolvedValue(undefined),
    setPositionAsync: jest.fn().mockResolvedValue(undefined),
    setVolumeAsync: jest.fn().mockResolvedValue(undefined),
    getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, positionMillis: 0 }),
});

describe('NoPogodAudioManager', () => {
    let mockBackgroundSound: ReturnType<typeof createMockSound>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockBackgroundSound = createMockSound();

        (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
            sound: mockBackgroundSound,
        });
    });

    describe('NOPOGOD_SOUNDS constants', () => {
        it('should have BACKGROUND sound ID', () => {
            expect(NOPOGOD_SOUNDS.BACKGROUND).toBe('background');
        });

        it('should have CATCH_ITEM sound ID', () => {
            expect(NOPOGOD_SOUNDS.CATCH_ITEM).toBe('catchItem');
        });
    });

    describe('Audio Configuration', () => {
        it('should configure background music with loop enabled', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();

            expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ isLooping: true })
            );
        });

        it('should configure background music at 15% volume (lowered for quotes)', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();

            expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ volume: 0.15 })
            );
        });
    });

    describe('Game Lifecycle Integration', () => {
        it('should load sounds successfully', async () => {
            const manager = new NoPogodAudioManager();

            await expect(manager.loadSounds()).resolves.not.toThrow();
            expect(manager.isSoundsLoaded()).toBe(true);
        });

        it('should play background music on game start', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();
            await manager.playBackground();

            expect(mockBackgroundSound.playAsync).toHaveBeenCalled();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);
        });

        it('should pause background music on game pause', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();

            expect(mockBackgroundSound.pauseAsync).toHaveBeenCalled();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);
        });

        it('should resume background music on game resume', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();
            await manager.resumeBackground();

            // playAsync called twice: once for play, once for resume
            expect(mockBackgroundSound.playAsync).toHaveBeenCalledTimes(2);
            expect(manager.isBackgroundMusicPlaying()).toBe(true);
        });

        it('should stop background music on game over', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();
            await manager.playBackground();
            await manager.stopBackground();

            expect(mockBackgroundSound.stopAsync).toHaveBeenCalled();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);
        });

        it('should unload sounds on game close', async () => {
            const manager = new NoPogodAudioManager();
            await manager.loadSounds();
            await manager.unloadSounds();

            expect(mockBackgroundSound.stopAsync).toHaveBeenCalled();
            expect(mockBackgroundSound.unloadAsync).toHaveBeenCalled();
            expect(manager.isSoundsLoaded()).toBe(false);
        });
    });

    describe('Full Game Flow', () => {
        it('should handle complete game lifecycle', async () => {
            const manager = new NoPogodAudioManager();

            // 1. Modal opens - load sounds
            await manager.loadSounds();
            expect(manager.isSoundsLoaded()).toBe(true);

            // 2. Player presses start - play music
            await manager.playBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);

            // 3. Player pauses game
            await manager.pauseBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);

            // 4. Player resumes game
            await manager.resumeBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);

            // 5. Game over - stop music
            await manager.stopBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);

            // 6. Player starts new game - play music again
            await manager.playBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);

            // 7. Player closes modal - unload sounds
            await manager.unloadSounds();
            expect(manager.isSoundsLoaded()).toBe(false);
        });
    });

    describe('Placeholder Methods', () => {
        it('should have playCatchItemSound method', async () => {
            const manager = new NoPogodAudioManager();
            await expect(manager.playCatchItemSound()).resolves.not.toThrow();
        });

        it('should have playCatchPepperSound method', async () => {
            const manager = new NoPogodAudioManager();
            await expect(manager.playCatchPepperSound()).resolves.not.toThrow();
        });

        it('should have playMissSound method', async () => {
            const manager = new NoPogodAudioManager();
            await expect(manager.playMissSound()).resolves.not.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should handle load failure gracefully', async () => {
            (Audio.Sound.createAsync as jest.Mock).mockRejectedValueOnce(
                new Error('Failed to load audio')
            );

            const manager = new NoPogodAudioManager();
            await expect(manager.loadSounds()).rejects.toThrow('Failed to load audio');
        });

        it('should handle play when not loaded', async () => {
            const manager = new NoPogodAudioManager();
            // Don't load sounds
            await expect(manager.playBackground()).resolves.not.toThrow();
        });
    });
});

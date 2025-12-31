/**
 * BaseAudioManager Tests
 * 
 * Tests for the abstract game audio manager class.
 * Uses a concrete implementation for testing.
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

// Mock logger
jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { AudioManagerConfig, BaseAudioManager } from '@/features/games/core/audio/BaseAudioManager';

// Concrete implementation for testing
class TestAudioManager extends BaseAudioManager {
    private config: AudioManagerConfig;

    constructor(config: AudioManagerConfig = {}) {
        super();
        this.config = config;
    }

    protected getAudioConfig(): AudioManagerConfig {
        return this.config;
    }
}

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

describe('BaseAudioManager', () => {
    let mockBackgroundSound: ReturnType<typeof createMockSound>;
    let mockEffectSound: ReturnType<typeof createMockSound>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockBackgroundSound = createMockSound();
        mockEffectSound = createMockSound();

        // Setup createAsync mock
        (Audio.Sound.createAsync as jest.Mock).mockImplementation((source, options) => {
            if (options?.isLooping) {
                return Promise.resolve({ sound: mockBackgroundSound });
            }
            return Promise.resolve({ sound: mockEffectSound });
        });
    });

    describe('loadSounds', () => {
        it('should set audio mode on load', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1, loop: true },
            });

            await manager.loadSounds();

            expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
                allowsRecordingIOS: false,
                staysActiveInBackground: false,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });
        });

        it('should load background music when configured', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'background', source: 123, loop: true, volume: 0.5 },
            });

            await manager.loadSounds();

            expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
                123,
                { isLooping: true, volume: 0.5 }
            );
        });

        it('should load sound effects when configured', async () => {
            const manager = new TestAudioManager({
                soundEffects: [
                    { id: 'effect1', source: 456, volume: 0.8 },
                    { id: 'effect2', source: 789, volume: 1.0 },
                ],
            });

            await manager.loadSounds();

            expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(2);
        });

        it('should set isLoaded flag after loading', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            expect(manager.isSoundsLoaded()).toBe(false);
            await manager.loadSounds();
            expect(manager.isSoundsLoaded()).toBe(true);
        });

        it('should not reload if already loaded', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.loadSounds();

            // Should only be called once
            expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(1);
        });

        it('should use default volume when not specified', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1, loop: true },
            });

            await manager.loadSounds();

            expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ volume: 0.4 }) // Default volume
            );
        });
    });

    describe('unloadSounds', () => {
        it('should stop and unload background music', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.unloadSounds();

            expect(mockBackgroundSound.stopAsync).toHaveBeenCalled();
            expect(mockBackgroundSound.unloadAsync).toHaveBeenCalled();
        });

        it('should stop and unload all sound effects', async () => {
            const manager = new TestAudioManager({
                soundEffects: [{ id: 'effect1', source: 1 }],
            });

            await manager.loadSounds();
            await manager.unloadSounds();

            expect(mockEffectSound.stopAsync).toHaveBeenCalled();
            expect(mockEffectSound.unloadAsync).toHaveBeenCalled();
        });

        it('should reset isLoaded flag', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            expect(manager.isSoundsLoaded()).toBe(true);

            await manager.unloadSounds();
            expect(manager.isSoundsLoaded()).toBe(false);
        });
    });

    describe('playBackground', () => {
        it('should play background music', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();

            expect(mockBackgroundSound.playAsync).toHaveBeenCalled();
        });

        it('should set isBackgroundMusicPlaying to true', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);

            await manager.playBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);
        });

        it('should not crash when no background music loaded', async () => {
            const manager = new TestAudioManager({});

            await manager.loadSounds();
            await expect(manager.playBackground()).resolves.not.toThrow();
        });
    });

    describe('stopBackground', () => {
        it('should stop background music', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            await manager.stopBackground();

            expect(mockBackgroundSound.stopAsync).toHaveBeenCalled();
            expect(mockBackgroundSound.setPositionAsync).toHaveBeenCalledWith(0);
        });

        it('should set isBackgroundMusicPlaying to false', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);

            await manager.stopBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);
        });
    });

    describe('pauseBackground', () => {
        it('should pause background music', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();

            expect(mockBackgroundSound.pauseAsync).toHaveBeenCalled();
        });

        it('should set isBackgroundMusicPlaying to false when paused', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();

            expect(manager.isBackgroundMusicPlaying()).toBe(false);
        });

        it('should not pause if not playing', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.pauseBackground();

            expect(mockBackgroundSound.pauseAsync).not.toHaveBeenCalled();
        });
    });

    describe('resumeBackground', () => {
        it('should resume paused background music', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();
            await manager.resumeBackground();

            // playAsync should be called twice (play + resume)
            expect(mockBackgroundSound.playAsync).toHaveBeenCalledTimes(2);
        });

        it('should set isBackgroundMusicPlaying to true after resume', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.playBackground();
            await manager.pauseBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(false);

            await manager.resumeBackground();
            expect(manager.isBackgroundMusicPlaying()).toBe(true);
        });

        it('should not resume if not paused', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.resumeBackground();

            expect(mockBackgroundSound.playAsync).not.toHaveBeenCalled();
        });
    });

    describe('playSound', () => {
        it('should play sound effect by ID (creates new instance each time)', async () => {
            const manager = new TestAudioManager({
                soundEffects: [{ id: 'effect1', source: 1 }],
            });

            await manager.loadSounds();
            await manager.playSound('effect1');

            // Creates a new sound instance and plays it
            // Note: createAsync is called for initial load + once per playSound
            expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(2);
            expect(mockEffectSound.playAsync).toHaveBeenCalled();
        });

        it('should support overlapping sound plays', async () => {
            const manager = new TestAudioManager({
                soundEffects: [{ id: 'effect1', source: 1 }],
            });

            await manager.loadSounds();

            // Play same sound twice rapidly
            await manager.playSound('effect1');
            await manager.playSound('effect1');

            // Should create 2 new sound instances (one per play) + 1 for initial load
            expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(3);
        });

        it('should not crash when sound ID not found', async () => {
            const manager = new TestAudioManager({
                soundEffects: [{ id: 'effect1', source: 1 }],
            });

            await manager.loadSounds();
            await expect(manager.playSound('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('setBackgroundVolume', () => {
        it('should set background music volume', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.setBackgroundVolume(0.7);

            expect(mockBackgroundSound.setVolumeAsync).toHaveBeenCalledWith(0.7);
        });

        it('should clamp volume to valid range', async () => {
            const manager = new TestAudioManager({
                backgroundMusic: { id: 'bg', source: 1 },
            });

            await manager.loadSounds();
            await manager.setBackgroundVolume(1.5);
            expect(mockBackgroundSound.setVolumeAsync).toHaveBeenCalledWith(1);

            await manager.setBackgroundVolume(-0.5);
            expect(mockBackgroundSound.setVolumeAsync).toHaveBeenCalledWith(0);
        });
    });
});

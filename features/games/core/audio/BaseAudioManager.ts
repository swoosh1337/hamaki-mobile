/**
 * Base Audio Manager
 * 
 * Abstract class providing core audio functionality for games.
 * Games should extend this and define their specific sound configurations.
 * 
 * Features:
 * - Background music with loop support
 * - One-shot sound effects
 * - Pause/resume synchronized with game state
 * - Proper cleanup to prevent memory leaks
 */

import { Audio } from 'expo-av';

import { createLogger } from '@/utils/logger';

const log = createLogger('BaseAudioManager');

/**
 * Sound configuration for a single audio file
 */
export interface SoundConfig {
    /** Unique identifier for this sound */
    id: string;
    /** Source of the audio file (require() result) */
    source: number;
    /** Whether this sound should loop (default: false) */
    loop?: boolean;
    /** Volume level 0.0 to 1.0 (default: 1.0) */
    volume?: number;
    /** Start position in milliseconds (default: 0) - use to skip intro */
    startPositionMs?: number;
    /** Max duration in milliseconds - stops early to skip ending */
    maxDurationMs?: number;
}

/**
 * Configuration for the audio manager
 */
export interface AudioManagerConfig {
    /** Background music configuration */
    backgroundMusic?: SoundConfig;
    /** Sound effects configuration */
    soundEffects?: SoundConfig[];
}

/**
 * Abstract base class for game audio management
 */
export abstract class BaseAudioManager {
    protected backgroundSound: Audio.Sound | null = null;
    protected soundEffects: Map<string, Audio.Sound> = new Map();
    protected soundEffectConfigs: Map<string, SoundConfig> = new Map();
    protected isLoaded: boolean = false;
    protected isBackgroundPlaying: boolean = false;
    protected isPaused: boolean = false;
    protected backgroundStartPositionMs: number = 0;

    /**
     * Get the audio configuration for this game.
     * Subclasses must implement this to define their sounds.
     */
    protected abstract getAudioConfig(): AudioManagerConfig;

    /**
     * Load all sounds defined in the configuration.
     * Call this when the game component mounts.
     */
    async loadSounds(): Promise<void> {
        if (this.isLoaded) {
            log.debug('Sounds already loaded');
            return;
        }

        try {
            // Set audio mode for game audio
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                staysActiveInBackground: false,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

            const config = this.getAudioConfig();

            // Load background music
            if (config.backgroundMusic) {
                log.debug('Loading background music', { id: config.backgroundMusic.id });
                const { sound } = await Audio.Sound.createAsync(
                    config.backgroundMusic.source,
                    {
                        isLooping: config.backgroundMusic.loop ?? true,
                        volume: config.backgroundMusic.volume ?? 0.4,
                    }
                );
                this.backgroundSound = sound;
                this.backgroundStartPositionMs = config.backgroundMusic.startPositionMs ?? 0;
            }

            // Load sound effects
            if (config.soundEffects) {
                for (const sfx of config.soundEffects) {
                    log.debug('Loading sound effect', { id: sfx.id });
                    const { sound } = await Audio.Sound.createAsync(
                        sfx.source,
                        {
                            isLooping: sfx.loop ?? false,
                            volume: sfx.volume ?? 1.0,
                        }
                    );
                    this.soundEffects.set(sfx.id, sound);
                    this.soundEffectConfigs.set(sfx.id, sfx);
                }
            }

            this.isLoaded = true;
            log.info('All sounds loaded successfully');
        } catch (error) {
            log.error('Failed to load sounds', error);
            throw error;
        }
    }

    /**
     * Unload all sounds and release resources.
     * Call this when the game component unmounts.
     */
    async unloadSounds(): Promise<void> {
        try {
            // Stop and unload background music
            if (this.backgroundSound) {
                await this.backgroundSound.stopAsync();
                await this.backgroundSound.unloadAsync();
                this.backgroundSound = null;
            }

            // Stop and unload all sound effects
            for (const [id, sound] of this.soundEffects) {
                log.debug('Unloading sound effect', { id });
                await sound.stopAsync();
                await sound.unloadAsync();
            }
            this.soundEffects.clear();
            this.soundEffectConfigs.clear();

            this.isLoaded = false;
            this.isBackgroundPlaying = false;
            this.isPaused = false;
            log.info('All sounds unloaded');
        } catch (error) {
            log.error('Failed to unload sounds', error);
        }
    }

    /**
     * Start playing background music
     */
    async playBackground(): Promise<void> {
        if (!this.backgroundSound) {
            log.warn('No background sound loaded');
            return;
        }

        try {
            // Reset to start position (skip intro if configured)
            const status = await this.backgroundSound.getStatusAsync();
            if (status.isLoaded && !this.isPaused) {
                await this.backgroundSound.setPositionAsync(this.backgroundStartPositionMs);
            }

            await this.backgroundSound.playAsync();
            this.isBackgroundPlaying = true;
            this.isPaused = false;
            log.debug('Background music started', { startPosition: this.backgroundStartPositionMs });
        } catch (error) {
            log.error('Failed to play background music', error);
        }
    }

    /**
     * Stop background music completely
     */
    async stopBackground(): Promise<void> {
        if (!this.backgroundSound) return;

        try {
            await this.backgroundSound.stopAsync();
            await this.backgroundSound.setPositionAsync(this.backgroundStartPositionMs);
            this.isBackgroundPlaying = false;
            this.isPaused = false;
            log.debug('Background music stopped');
        } catch (error) {
            log.error('Failed to stop background music', error);
        }
    }

    /**
     * Pause background music (can be resumed later)
     */
    async pauseBackground(): Promise<void> {
        if (!this.backgroundSound || !this.isBackgroundPlaying) return;

        try {
            await this.backgroundSound.pauseAsync();
            this.isPaused = true;
            log.debug('Background music paused');
        } catch (error) {
            log.error('Failed to pause background music', error);
        }
    }

    /**
     * Resume background music from paused position
     */
    async resumeBackground(): Promise<void> {
        if (!this.backgroundSound || !this.isPaused) return;

        try {
            await this.backgroundSound.playAsync();
            this.isPaused = false;
            log.debug('Background music resumed');
        } catch (error) {
            log.error('Failed to resume background music', error);
        }
    }

    /**
     * Play a sound effect by ID
     * Creates a new sound instance each time to support overlapping sounds
     * @param soundId The ID of the sound effect to play
     */
    async playSound(soundId: string): Promise<void> {
        const config = this.soundEffectConfigs.get(soundId);
        if (!config) {
            log.warn('Sound effect not found', { soundId });
            return;
        }

        try {
            // Create a NEW sound instance for each play to allow overlapping
            const { sound } = await Audio.Sound.createAsync(
                config.source,
                {
                    isLooping: config.loop ?? false,
                    volume: config.volume ?? 1.0,
                    positionMillis: config.startPositionMs ?? 0,
                }
            );

            await sound.playAsync();

            // If maxDurationMs is set, stop the sound early
            const duration = config.maxDurationMs;
            if (duration) {
                setTimeout(async () => {
                    try {
                        await sound.stopAsync();
                        await sound.unloadAsync();
                    } catch {
                        // Sound may have already stopped
                    }
                }, duration);
            } else {
                // Auto cleanup when sound finishes
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        sound.unloadAsync().catch(() => { });
                    }
                });
            }

            log.debug('Sound effect played', { soundId, startPos: config.startPositionMs, maxDuration: duration });
        } catch (error) {
            log.error('Failed to play sound effect', { soundId, error });
        }
    }

    /**
     * Set background music volume
     * @param volume Volume level from 0.0 to 1.0
     */
    async setBackgroundVolume(volume: number): Promise<void> {
        if (!this.backgroundSound) return;

        try {
            await this.backgroundSound.setVolumeAsync(Math.max(0, Math.min(1, volume)));
            log.debug('Background volume set', { volume });
        } catch (error) {
            log.error('Failed to set background volume', error);
        }
    }

    /**
     * Check if sounds are loaded
     */
    isSoundsLoaded(): boolean {
        return this.isLoaded;
    }

    /**
     * Check if background music is currently playing
     */
    isBackgroundMusicPlaying(): boolean {
        return this.isBackgroundPlaying && !this.isPaused;
    }
}

export default BaseAudioManager;

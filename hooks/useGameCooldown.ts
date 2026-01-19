/**
 * useGameCooldown Hook
 * 
 * Manages game cooldown/rate limiting to prevent XP farming abuse.
 * Tracks when games were last played and enforces cooldown periods.
 */

import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('Hook:GameCooldown');

// Storage keys
const COOLDOWN_STORAGE_KEY = 'hamaki_game_cooldowns';
const ROUNDS_STORAGE_KEY = 'hamaki_game_rounds';

// Default cooldown period (15 minutes)
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ROUNDS = 3;

interface GameCooldownState {
    [gameId: string]: number; // Timestamp when cooldown ends
}

interface GameRoundsState {
    [gameId: string]: number; // Rounds played for each game
}

interface UseGameCooldownOptions {
    /** Game identifier */
    gameId: string;
    /** Cooldown period in milliseconds */
    cooldownMs?: number;
    /** Maximum rounds before cooldown */
    maxRounds?: number;
    /** Whether to persist cooldown across app restarts */
    persist?: boolean;
}

interface UseGameCooldownReturn {
    /** Whether the game can be played now */
    canPlay: boolean;
    /** Time remaining in cooldown (ms) */
    remainingMs: number;
    /** Formatted time remaining (e.g., "5:30") */
    remainingFormatted: string;
    /** Start a new cooldown (call after game ends) */
    startCooldown: () => Promise<void>;
    /** Reset cooldown (for testing or admin use) */
    resetCooldown: () => Promise<void>;
    /** Check if cooldown is active */
    isOnCooldown: boolean;
    /** Sync cooldown end time from server (used on screen mount) */
    syncFromServer: (serverEndTime: number) => Promise<void>;
    /** Current rounds played (persisted) */
    roundsPlayed: number;
    /** Maximum rounds allowed before cooldown */
    maxRounds: number;
    /** Increment rounds played (call after each game round ends) */
    incrementRounds: () => Promise<number>;
    /** Reset rounds to 0 (call when cooldown expires or for testing) */
    resetRounds: () => Promise<void>;
}

export function useGameCooldown(options: UseGameCooldownOptions): UseGameCooldownReturn {
    const {
        gameId,
        cooldownMs = DEFAULT_COOLDOWN_MS,
        maxRounds = DEFAULT_MAX_ROUNDS,
        persist = true,
    } = options;

    const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null);
    const [remainingMs, setRemainingMs] = useState(0);
    const [roundsPlayed, setRoundsPlayed] = useState(0);

    /**
     * Load cooldown and rounds state from storage
     */
    const loadCooldownState = useCallback(async () => {
        if (!persist) return;

        try {
            // Load cooldown state
            const storedCooldowns = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
            let cooldownExpired = false;

            if (storedCooldowns) {
                const cooldowns: GameCooldownState = JSON.parse(storedCooldowns);
                const endTime = cooldowns[gameId];

                if (endTime && endTime > Date.now()) {
                    setCooldownEndTime(endTime);
                    log.debug(`Loaded cooldown for ${gameId}, ends at ${new Date(endTime).toISOString()}`);
                } else if (endTime) {
                    // Cooldown expired, clean it up
                    cooldownExpired = true;
                    delete cooldowns[gameId];
                    await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
                    log.debug(`Cleared expired cooldown for ${gameId}`);
                }
            }

            // Load rounds state
            const storedRounds = await AsyncStorage.getItem(ROUNDS_STORAGE_KEY);
            if (storedRounds) {
                const rounds: GameRoundsState = JSON.parse(storedRounds);
                const savedRounds = rounds[gameId] || 0;

                // If cooldown expired, reset rounds
                if (cooldownExpired) {
                    rounds[gameId] = 0;
                    await AsyncStorage.setItem(ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
                    setRoundsPlayed(0);
                    log.debug(`Reset rounds for ${gameId} (cooldown expired)`);
                } else {
                    setRoundsPlayed(savedRounds);
                    log.debug(`Loaded rounds for ${gameId}: ${savedRounds}/${maxRounds}`);
                }
            }
        } catch (err) {
            log.error('Failed to load cooldown state', err);
        }
    }, [gameId, maxRounds, persist]);

    /**
     * Start a new cooldown period
     */
    const startCooldown = useCallback(async () => {
        const endTime = Date.now() + cooldownMs;
        setCooldownEndTime(endTime);
        log.debug(`Started cooldown for ${gameId}, ends at ${new Date(endTime).toISOString()}`);

        if (persist) {
            try {
                const storedData = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
                const cooldowns: GameCooldownState = storedData ? JSON.parse(storedData) : {};
                cooldowns[gameId] = endTime;
                await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
            } catch (err) {
                log.error('Failed to persist cooldown', err);
            }
        }
    }, [gameId, cooldownMs, persist]);

    /**
     * Reset cooldown (for testing or admin use)
     * Also resets rounds played
     */
    const resetCooldown = useCallback(async () => {
        setCooldownEndTime(null);
        setRemainingMs(0);
        setRoundsPlayed(0);
        log.debug(`Reset cooldown and rounds for ${gameId}`);

        if (persist) {
            try {
                // Clear cooldown
                const storedCooldowns = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
                if (storedCooldowns) {
                    const cooldowns: GameCooldownState = JSON.parse(storedCooldowns);
                    delete cooldowns[gameId];
                    await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
                }

                // Clear rounds
                const storedRounds = await AsyncStorage.getItem(ROUNDS_STORAGE_KEY);
                if (storedRounds) {
                    const rounds: GameRoundsState = JSON.parse(storedRounds);
                    delete rounds[gameId];
                    await AsyncStorage.setItem(ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
                }
            } catch (err) {
                log.error('Failed to reset cooldown', err);
            }
        }
    }, [gameId, persist]);

    /**
     * Increment rounds played and persist
     * Returns the new rounds count
     */
    const incrementRounds = useCallback(async (): Promise<number> => {
        const newRounds = roundsPlayed + 1;
        setRoundsPlayed(newRounds);
        log.debug(`Incremented rounds for ${gameId}: ${newRounds}/${maxRounds}`);

        if (persist) {
            try {
                const storedRounds = await AsyncStorage.getItem(ROUNDS_STORAGE_KEY);
                const rounds: GameRoundsState = storedRounds ? JSON.parse(storedRounds) : {};
                rounds[gameId] = newRounds;
                await AsyncStorage.setItem(ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
            } catch (err) {
                log.error('Failed to persist rounds', err);
            }
        }

        return newRounds;
    }, [gameId, maxRounds, persist, roundsPlayed]);

    /**
     * Reset rounds to 0 (called when cooldown expires)
     */
    const resetRounds = useCallback(async () => {
        setRoundsPlayed(0);
        log.debug(`Reset rounds for ${gameId}`);

        if (persist) {
            try {
                const storedRounds = await AsyncStorage.getItem(ROUNDS_STORAGE_KEY);
                if (storedRounds) {
                    const rounds: GameRoundsState = JSON.parse(storedRounds);
                    rounds[gameId] = 0;
                    await AsyncStorage.setItem(ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
                }
            } catch (err) {
                log.error('Failed to reset rounds', err);
            }
        }
    }, [gameId, persist]);

    /**
     * Sync cooldown end time from server
     * Used when the games screen mounts to ensure client state matches server
     */
    const syncFromServer = useCallback(async (serverEndTime: number) => {
        const now = Date.now();

        // Only sync if the server cooldown is still active
        if (serverEndTime <= now) {
            log.debug(`Server cooldown for ${gameId} already expired, skipping sync`);
            return;
        }

        // Check if we already have a more recent cooldown locally
        if (cooldownEndTime && cooldownEndTime >= serverEndTime) {
            log.debug(`Local cooldown for ${gameId} is more recent, skipping sync`);
            return;
        }

        setCooldownEndTime(serverEndTime);
        log.info(`Synced cooldown for ${gameId} from server, ends at ${new Date(serverEndTime).toISOString()}`);

        if (persist) {
            try {
                const storedData = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
                const cooldowns: GameCooldownState = storedData ? JSON.parse(storedData) : {};
                cooldowns[gameId] = serverEndTime;
                await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
            } catch (err) {
                log.error('Failed to persist server cooldown sync', err);
            }
        }
    }, [gameId, cooldownEndTime, persist]);

    /**
     * Format remaining time as HH:MM:SS or MM:SS
     */
    const formatRemaining = useCallback((ms: number): string => {
        if (ms <= 0) return '0:00';

        const totalSeconds = Math.ceil(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, []);

    // Load cooldown on mount
    useEffect(() => {
        loadCooldownState();
    }, [loadCooldownState]);

    // Update remaining time every second
    useEffect(() => {
        if (!cooldownEndTime) {
            setRemainingMs(0);
            return;
        }

        const updateRemaining = async () => {
            const now = Date.now();
            const remaining = Math.max(0, cooldownEndTime - now);
            setRemainingMs(remaining);

            // Clear cooldown and reset rounds when it expires
            if (remaining === 0 && cooldownEndTime) {
                setCooldownEndTime(null);
                setRoundsPlayed(0);
                log.debug(`Cooldown expired for ${gameId}, resetting rounds`);

                // Also clear from storage
                if (persist) {
                    try {
                        const storedRounds = await AsyncStorage.getItem(ROUNDS_STORAGE_KEY);
                        if (storedRounds) {
                            const rounds: GameRoundsState = JSON.parse(storedRounds);
                            rounds[gameId] = 0;
                            await AsyncStorage.setItem(ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
                        }
                    } catch (err) {
                        log.error('Failed to reset rounds on cooldown expire', err);
                    }
                }
            }
        };

        // Update immediately
        updateRemaining();

        // Then update every second
        const interval = setInterval(updateRemaining, 1000);

        return () => clearInterval(interval);
    }, [cooldownEndTime, gameId, persist]);

    const isOnCooldown = remainingMs > 0;
    const canPlay = !isOnCooldown;

    return {
        canPlay,
        remainingMs,
        remainingFormatted: formatRemaining(remainingMs),
        startCooldown,
        resetCooldown,
        isOnCooldown,
        syncFromServer,
        roundsPlayed,
        maxRounds,
        incrementRounds,
        resetRounds,
    };
}

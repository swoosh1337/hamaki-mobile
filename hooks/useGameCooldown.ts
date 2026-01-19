/**
 * useGameCooldown Hook
 * 
 * Manages game cooldown/rate limiting to prevent XP farming abuse.
 * Tracks when games were last played and enforces cooldown periods.
 */

import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const log = createLogger('Hook:GameCooldown');

// Storage key prefixes - each game gets its own key to avoid race conditions
const COOLDOWN_KEY_PREFIX = 'hamaki_cooldown_';
const ROUNDS_KEY_PREFIX = 'hamaki_rounds_';

// Helper to get per-game storage keys
const getCooldownKey = (gameId: string) => `${COOLDOWN_KEY_PREFIX}${gameId}`;
const getRoundsKey = (gameId: string) => `${ROUNDS_KEY_PREFIX}${gameId}`;

// Default cooldown period (15 minutes)
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ROUNDS = 3;

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

export interface UseGameCooldownReturn {
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
    /** Refresh cooldown state from storage (call when returning to screen) */
    refresh: () => Promise<void>;
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
    // Ref to avoid stale closure in incrementRounds when called rapidly
    const roundsPlayedRef = useRef(0);

    // Keep ref in sync with state
    useEffect(() => {
        roundsPlayedRef.current = roundsPlayed;
    }, [roundsPlayed]);

    /**
     * Load cooldown and rounds state from storage
     * Uses per-game keys to avoid race conditions between different game instances
     */
    const loadCooldownState = useCallback(async () => {
        if (!persist) return;

        try {
            const cooldownKey = getCooldownKey(gameId);
            const roundsKey = getRoundsKey(gameId);
            let cooldownExpired = false;

            // Load cooldown state (stored as number string)
            const storedEndTime = await AsyncStorage.getItem(cooldownKey);

            if (storedEndTime) {
                const endTime = parseInt(storedEndTime, 10);

                if (endTime && endTime > Date.now()) {
                    setCooldownEndTime(endTime);
                    log.debug(`Loaded cooldown for ${gameId}, ends at ${new Date(endTime).toISOString()}`);
                } else if (endTime) {
                    // Cooldown expired, clean it up
                    cooldownExpired = true;
                    await AsyncStorage.removeItem(cooldownKey);
                    log.debug(`Cleared expired cooldown for ${gameId}`);
                }
            }

            // Load rounds state (stored as number string)
            const storedRounds = await AsyncStorage.getItem(roundsKey);
            const savedRounds = storedRounds ? parseInt(storedRounds, 10) : 0;

            // If cooldown expired, reset rounds
            if (cooldownExpired) {
                await AsyncStorage.setItem(roundsKey, '0');
                roundsPlayedRef.current = 0;
                setRoundsPlayed(0);
                log.debug(`Reset rounds for ${gameId} (cooldown expired)`);
            } else {
                roundsPlayedRef.current = savedRounds;
                setRoundsPlayed(savedRounds);
                log.debug(`Loaded rounds for ${gameId}: ${savedRounds}/${maxRounds}`);
            }
        } catch (err) {
            log.error('Failed to load cooldown state', err);
        }
    }, [gameId, maxRounds, persist]);

    /**
     * Start a new cooldown period
     * Uses per-game key for atomic write (no read-modify-write race)
     */
    const startCooldown = useCallback(async () => {
        const endTime = Date.now() + cooldownMs;
        setCooldownEndTime(endTime);
        log.debug(`Started cooldown for ${gameId}, ends at ${new Date(endTime).toISOString()}`);

        if (persist) {
            try {
                // Direct write to per-game key - no read-modify-write needed
                await AsyncStorage.setItem(getCooldownKey(gameId), endTime.toString());
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
        roundsPlayedRef.current = 0;
        setRoundsPlayed(0);
        log.debug(`Reset cooldown and rounds for ${gameId}`);

        if (persist) {
            try {
                // Direct removal of per-game keys - no read-modify-write needed
                await AsyncStorage.removeItem(getCooldownKey(gameId));
                await AsyncStorage.removeItem(getRoundsKey(gameId));
            } catch (err) {
                log.error('Failed to reset cooldown', err);
            }
        }
    }, [gameId, persist]);

    /**
     * Increment rounds played and persist
     * Returns the new rounds count
     * Uses ref to avoid stale closure when called rapidly
     */
    const incrementRounds = useCallback(async (): Promise<number> => {
        // Use ref to get current value, avoiding stale closure issues
        const newRounds = roundsPlayedRef.current + 1;
        roundsPlayedRef.current = newRounds;
        setRoundsPlayed(newRounds);
        log.debug(`Incremented rounds for ${gameId}: ${newRounds}/${maxRounds}`);

        if (persist) {
            try {
                // Direct write to per-game key - no read-modify-write needed
                await AsyncStorage.setItem(getRoundsKey(gameId), newRounds.toString());
            } catch (err) {
                log.error('Failed to persist rounds', err);
            }
        }

        return newRounds;
    }, [gameId, maxRounds, persist]);

    /**
     * Reset rounds to 0 (called when cooldown expires)
     */
    const resetRounds = useCallback(async () => {
        roundsPlayedRef.current = 0;
        setRoundsPlayed(0);
        log.debug(`Reset rounds for ${gameId}`);

        if (persist) {
            try {
                // Direct write to per-game key - no read-modify-write needed
                await AsyncStorage.setItem(getRoundsKey(gameId), '0');
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
                // Direct write to per-game key - no read-modify-write needed
                await AsyncStorage.setItem(getCooldownKey(gameId), serverEndTime.toString());
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
                roundsPlayedRef.current = 0;
                setRoundsPlayed(0);
                log.debug(`Cooldown expired for ${gameId}, resetting rounds`);

                // Also clear from storage using per-game key
                if (persist) {
                    try {
                        await AsyncStorage.setItem(getRoundsKey(gameId), '0');
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
        refresh: loadCooldownState,
    };
}

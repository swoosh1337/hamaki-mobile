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

// Default cooldown period (15 minutes)
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

interface GameCooldownState {
    [gameId: string]: number; // Timestamp when cooldown ends
}

interface UseGameCooldownOptions {
    /** Game identifier */
    gameId: string;
    /** Cooldown period in milliseconds */
    cooldownMs?: number;
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
}

export function useGameCooldown(options: UseGameCooldownOptions): UseGameCooldownReturn {
    const {
        gameId,
        cooldownMs = DEFAULT_COOLDOWN_MS,
        persist = true,
    } = options;

    const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null);
    const [remainingMs, setRemainingMs] = useState(0);

    /**
     * Load cooldown state from storage
     */
    const loadCooldownState = useCallback(async () => {
        if (!persist) return;

        try {
            const storedData = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
            if (storedData) {
                const cooldowns: GameCooldownState = JSON.parse(storedData);
                const endTime = cooldowns[gameId];

                if (endTime && endTime > Date.now()) {
                    setCooldownEndTime(endTime);
                    log.debug(`Loaded cooldown for ${gameId}, ends at ${new Date(endTime).toISOString()}`);
                } else if (endTime) {
                    // Cooldown expired, clean it up
                    delete cooldowns[gameId];
                    await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
                    log.debug(`Cleared expired cooldown for ${gameId}`);
                }
            }
        } catch (err) {
            log.error('Failed to load cooldown state', err);
        }
    }, [gameId, persist]);

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
     */
    const resetCooldown = useCallback(async () => {
        setCooldownEndTime(null);
        setRemainingMs(0);
        log.debug(`Reset cooldown for ${gameId}`);

        if (persist) {
            try {
                const storedData = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
                if (storedData) {
                    const cooldowns: GameCooldownState = JSON.parse(storedData);
                    delete cooldowns[gameId];
                    await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
                }
            } catch (err) {
                log.error('Failed to reset cooldown', err);
            }
        }
    }, [gameId, persist]);

    /**
     * Format remaining time as MM:SS
     */
    const formatRemaining = useCallback((ms: number): string => {
        if (ms <= 0) return '0:00';

        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

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

        const updateRemaining = () => {
            const now = Date.now();
            const remaining = Math.max(0, cooldownEndTime - now);
            setRemainingMs(remaining);

            // Clear cooldown when it expires
            if (remaining === 0 && cooldownEndTime) {
                setCooldownEndTime(null);
                log.debug(`Cooldown expired for ${gameId}`);
            }
        };

        // Update immediately
        updateRemaining();

        // Then update every second
        const interval = setInterval(updateRemaining, 1000);

        return () => clearInterval(interval);
    }, [cooldownEndTime, gameId]);

    const isOnCooldown = remainingMs > 0;
    const canPlay = !isOnCooldown;

    return {
        canPlay,
        remainingMs,
        remainingFormatted: formatRemaining(remainingMs),
        startCooldown,
        resetCooldown,
        isOnCooldown,
    };
}

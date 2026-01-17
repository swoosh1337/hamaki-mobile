/**
 * XP Events - Simple event system for XP changes
 *
 * Used to trigger global leaderboard refresh after successful XP awards.
 * This avoids the 5-minute staleness window for users who just earned XP.
 *
 * Architecture:
 * - Game components call emitXPAwarded() after successful award-xp response
 * - useLeaderboardSnapshot subscribes to these events
 * - Leaderboard refreshes immediately (with debounce protection)
 */

import { createLogger } from '@/utils/logger';

const log = createLogger('XPEvents');

type XPEventCallback = (amount: number) => void;

class XPEventEmitter {
    private listeners: Set<XPEventCallback> = new Set();

    /**
     * Subscribe to XP awarded events
     * @returns Unsubscribe function
     */
    subscribe(callback: XPEventCallback): () => void {
        this.listeners.add(callback);
        log.debug('Subscribed to XP events', { listenerCount: this.listeners.size });

        return () => {
            this.listeners.delete(callback);
            log.debug('Unsubscribed from XP events', { listenerCount: this.listeners.size });
        };
    }

    /**
     * Emit XP awarded event - triggers all listeners
     * @param amount Amount of XP that was awarded
     */
    emit(amount: number): void {
        log.info('Emitting XP awarded event', { amount, listenerCount: this.listeners.size });
        this.listeners.forEach(callback => {
            try {
                callback(amount);
            } catch (error) {
                log.error('Error in XP event listener', error);
            }
        });
    }
}

// Singleton instance
export const xpEventEmitter = new XPEventEmitter();

/**
 * Emit that XP was successfully awarded
 * Call this after successful award-xp Edge Function response
 */
export function emitXPAwarded(amount: number): void {
    xpEventEmitter.emit(amount);
}

/**
 * Subscribe to XP awarded events
 * Typically used by leaderboard hooks to trigger refresh
 * @returns Unsubscribe function
 */
export function subscribeToXPEvents(callback: XPEventCallback): () => void {
    return xpEventEmitter.subscribe(callback);
}

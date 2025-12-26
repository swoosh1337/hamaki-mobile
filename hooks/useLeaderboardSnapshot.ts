/**
 * useLeaderboardSnapshot Hook
 *
 * Global truth for the leaderboard - authoritative ranking of all users.
 * Uses batched refresh (no per-XP spam).
 *
 * Refresh triggers (belt + suspenders):
 * 1. Periodic interval (every 5 minutes)
 * 2. App foreground (when user returns to app)
 * 3. Realtime subscription to leaderboard_refresh_events (cron emits)
 *
 * Architecture:
 *   UI → useLeaderboardSnapshot → leaderboardService → Supabase
 *   Realtime: leaderboard_refresh_events → triggers refetch
 *
 * IMPORTANT: This snapshot is AUTHORITATIVE for global rankings.
 * Do NOT merge ranks with useMyLeaderboardStatus personal rank.
 *
 * Usage:
 * ```typescript
 * const { entries, isStale, refetch } = useLeaderboardSnapshot();
 *
 * // Display the top 100 users
 * entries.forEach(entry => {
 *   console.log(`#${entry.rank}: ${entry.fullName} - ${entry.totalXP} XP`);
 * });
 * ```
 */

import { leaderboardService } from '@/services/supabase/leaderboardService';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRealtimeInsert } from './useRealtimeSubscription';

const log = createLogger('Hook:LeaderboardSnapshot');

// Refresh interval: 5 minutes
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// Stale threshold: 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
// Debounce window: 5 seconds (only applies after successful fetches)
const DEBOUNCE_MS = 5000;

/**
 * Leaderboard entry in snapshot
 */
export interface LeaderboardEntry {
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    totalXP: number;
    gameXP: number;
    subscriptionXP: number;
    videoLikeXP: number;
    rank: number;
}

/**
 * Refresh event from cron job
 */
interface LeaderboardRefreshEvent extends Record<string, unknown> {
    id: string;
    period_type: string;
    created_at: string;
}

/**
 * Hook return type
 */
export interface LeaderboardSnapshot {
    /** Top N leaderboard entries (default: 100) */
    entries: LeaderboardEntry[];
    /** When the snapshot was last fetched */
    lastUpdated: Date | null;
    /** True if snapshot is older than threshold (5 minutes) */
    isStale: boolean;
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /**
     * This snapshot is the authoritative source of truth for global rankings.
     * Do NOT merge with personal rank from useMyLeaderboardStatus.
     */
    authoritative: true;
    /** Manually refetch the snapshot */
    refetch: () => Promise<void>;
}

interface UseLeaderboardSnapshotOptions {
    /** Maximum entries to fetch (default: 100 for mobile optimization) */
    limit?: number;
    /** Period type to filter refresh events (default: 'monthly') */
    periodType?: 'weekly' | 'monthly';
    /** Auto-fetch on mount (default: true) */
    autoFetch?: boolean;
    /** Enable periodic refresh interval (default: true) */
    enableInterval?: boolean;
    /** Enable app foreground refresh (default: true) */
    enableForegroundRefresh?: boolean;
    /** Enable realtime subscription to refresh events (default: true) */
    enableRealtimeRefresh?: boolean;
}

/**
 * Hook for fetching the global leaderboard snapshot
 *
 * This provides "global truth" - the authoritative leaderboard that refreshes
 * periodically, not on every XP mutation. This prevents per-XP spam.
 */
export function useLeaderboardSnapshot(
    options: UseLeaderboardSnapshotOptions = {}
): LeaderboardSnapshot {
    const {
        limit = 100,
        periodType = 'monthly',
        autoFetch = true,
        enableInterval = true,
        enableForegroundRefresh = true,
        enableRealtimeRefresh = true,
    } = options;

    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Track if component is mounted
    const isMountedRef = useRef(true);
    // Track last SUCCESSFUL fetch time for debounce (don't lock on failures)
    const lastSuccessTimeRef = useRef<number>(0);
    // Prevent parallel fetch calls
    const inFlightRef = useRef(false);

    /**
     * Calculate if snapshot is stale
     */
    const isStale = lastUpdated
        ? Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS
        : true;

    // Store isStale in ref for callbacks to access current value
    const isStaleRef = useRef(isStale);
    isStaleRef.current = isStale;

    /**
     * Fetch leaderboard snapshot from service
     */
    const fetchSnapshot = useCallback(async (reason: string, force = false) => {
        // Prevent parallel calls
        if (inFlightRef.current) {
            log.debug('Skipping fetch (already in flight)', { reason });
            return;
        }

        // Debounce: don't fetch if we just succeeded in the last few seconds
        // (but allow retry on failure by checking lastSuccessTimeRef, not lastFetchTimeRef)
        const now = Date.now();
        if (!force && now - lastSuccessTimeRef.current < DEBOUNCE_MS) {
            log.debug('Skipping fetch (debounced after success)', { reason });
            return;
        }

        inFlightRef.current = true;

        try {
            setIsLoading(true);
            setError(null);
            log.info('Fetching leaderboard snapshot', { reason, limit, periodType });

            const snapshot = await leaderboardService.getLeaderboardSnapshot(limit, periodType);

            if (isMountedRef.current) {
                setEntries(snapshot.entries);
                setLastUpdated(snapshot.fetchedAt);
                // Only update debounce timer on success
                lastSuccessTimeRef.current = Date.now();
                log.debug('Snapshot updated', {
                    count: snapshot.entries.length,
                    reason,
                });
            }
        } catch (err) {
            if (isMountedRef.current) {
                const error = err instanceof Error ? err : new Error('Failed to fetch snapshot');
                log.error('Error fetching snapshot', error);
                setError(error);
                // Don't update lastSuccessTimeRef - allow immediate retry
            }
        } finally {
            inFlightRef.current = false;
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [limit, periodType]);

    /**
     * Manual refetch (always fetches, ignores debounce)
     */
    const refetch = useCallback(async () => {
        await fetchSnapshot('manual', true);
    }, [fetchSnapshot]);

    // Auto-fetch on mount
    useEffect(() => {
        isMountedRef.current = true;
        if (autoFetch) {
            fetchSnapshot('mount', true);
        }
        return () => {
            isMountedRef.current = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Periodic refresh interval
    useEffect(() => {
        if (!enableInterval) return;

        log.debug('Setting up periodic refresh interval');
        const intervalId = setInterval(() => {
            fetchSnapshot('interval');
        }, REFRESH_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
        };
    }, [enableInterval, fetchSnapshot]);

    // App foreground refresh
    useEffect(() => {
        if (!enableForegroundRefresh) return;

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                log.debug('App came to foreground, checking if refresh needed');
                // Only refresh if stale (> 5 minutes old)
                if (isStaleRef.current) {
                    fetchSnapshot('foreground');
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [enableForegroundRefresh, fetchSnapshot]);

    // Realtime subscription to refresh events (filtered by period_type)
    useRealtimeInsert<LeaderboardRefreshEvent>(
        'leaderboard_refresh_events',
        (event) => {
            // Skip if already fresh (avoid unnecessary fetches if cron fires frequently)
            if (!isStaleRef.current) {
                log.debug('Skipping realtime refresh (already fresh)', { periodType: event.period_type });
                return;
            }
            log.info('Received refresh event from cron', { periodType: event.period_type });
            fetchSnapshot('realtime_event');
        },
        {
            enabled: enableRealtimeRefresh,
            filter: `period_type=eq.${periodType}`,
        }
    );

    return {
        entries,
        lastUpdated,
        isStale,
        isLoading,
        error,
        authoritative: true,
        refetch,
    };
}

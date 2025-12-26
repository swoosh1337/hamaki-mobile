/**
 * useMyLeaderboardStatus Hook
 *
 * Personal truth for the current user's leaderboard status.
 * Provides instant feedback after XP awards via Edge Function response.
 *
 * Key principle: This hook manages the user's PERSONAL view of their rank/XP.
 * It updates instantly from Edge Function responses (no need to refetch global list).
 *
 * Architecture:
 *   UI → useMyLeaderboardStatus → leaderboardService → Supabase
 *
 * Usage:
 * ```typescript
 * const { personalRank, myXP, updateFromAwardXP } = useMyLeaderboardStatus({ userId });
 *
 * // After game ends:
 * const result = await invokeEdgeFunction('award-xp', { ... });
 * if (result.success) {
 *   updateFromAwardXP(result.data);  // Instant UI update
 * }
 * ```
 */

import { leaderboardService } from '@/services/supabase/leaderboardService';
import { AwardXPResult, XPBreakdown } from '@/types/leaderboard';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('Hook:MyLeaderboardStatus');

// Re-export types for backwards compatibility
export type { AwardXPResult, XPBreakdown };

/**
 * @deprecated Use XPBreakdown from @/types/leaderboard instead
 */
export type MyXPBreakdown = XPBreakdown;

/**
 * Hook return type
 */
export interface MyLeaderboardStatus {
    /** User's current rank (instant feedback from Edge Function) */
    personalRank: number | null;
    /** XP breakdown by source */
    myXP: MyXPBreakdown;
    /** Loading state for initial fetch */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /** Update state instantly from Edge Function response (no refetch needed) */
    updateFromAwardXP: (result: AwardXPResult) => void;
    /** Refetch from database (rarely needed, use updateFromAwardXP for instant updates) */
    refetch: () => Promise<void>;
}

interface UseMyLeaderboardStatusOptions {
    /** User ID to fetch status for */
    userId?: string;
    /** Auto-fetch on mount (default: true) */
    autoFetch?: boolean;
}

/**
 * Hook for managing current user's personal leaderboard status
 *
 * This provides "personal truth" - the user's own XP and rank that updates
 * instantly from Edge Function responses. No need to poll or refetch the
 * global leaderboard just to see your own rank.
 */
export function useMyLeaderboardStatus(
    options: UseMyLeaderboardStatusOptions = {}
): MyLeaderboardStatus {
    const { userId, autoFetch = true } = options;

    const [personalRank, setPersonalRank] = useState<number | null>(null);
    const [myXP, setMyXP] = useState<MyXPBreakdown>({
        game: 0,
        subscription: 0,
        videoLike: 0,
        total: 0,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /**
     * Fetch user's current status from service
     *
     * NOTE: This is for initial load only. After that, use updateFromAwardXP
     * for instant updates from Edge Function responses. The rank returned here
     * is a fallback - authoritative rank comes from award-xp Edge Function.
     */
    const fetchMyStatus = useCallback(async () => {
        if (!userId) {
            log.debug('No userId provided, skipping fetch');
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const status = await leaderboardService.getMyLeaderboardStatus(userId);

            if (status) {
                setMyXP(status.xp);
                setPersonalRank(status.personalRank);
            } else {
                // New user with no entry yet
                setMyXP({ game: 0, subscription: 0, videoLike: 0, total: 0 });
                setPersonalRank(null);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to fetch status');
            log.error('Error fetching personal status', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    /**
     * Update status instantly from Edge Function response
     *
     * This is the PRIMARY way to update after XP awards - no refetch needed!
     * The award-xp Edge Function returns the authoritative rank calculated server-side.
     */
    const updateFromAwardXP = useCallback((result: AwardXPResult) => {
        if (!result.success) {
            log.warn('Ignoring failed award result');
            return;
        }

        log.info('Instant update from award-xp result', {
            newTotal: result.new_total_xp,
            newRank: result.personal_rank,
        });

        setMyXP({
            game: result.xp_breakdown.game,
            subscription: result.xp_breakdown.subscription,
            videoLike: result.xp_breakdown.video_like,
            total: result.new_total_xp,
        });

        setPersonalRank(result.personal_rank);
    }, []);

    /**
     * Refetch from database
     * Rarely needed - prefer updateFromAwardXP for instant updates
     */
    const refetch = useCallback(async () => {
        await fetchMyStatus();
    }, [fetchMyStatus]);

    // Auto-fetch on mount
    useEffect(() => {
        if (autoFetch && userId) {
            fetchMyStatus();
        }
    }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        personalRank,
        myXP,
        isLoading,
        error,
        updateFromAwardXP,
        refetch,
    };
}

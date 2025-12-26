/**
 * useLeaderboard Hook
 * 
 * Manages leaderboard data including all-time and weekly rankings.
 */

import { leaderboardService } from '@/services/supabase/leaderboardService';
import type { LeaderboardPeriod } from '@/types';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('Hook:Leaderboard');

interface LeaderboardEntry {
    userId: string;
    fullName: string;
    avatarUrl?: string;
    points: number;
    rank: number;
}

interface UseLeaderboardOptions {
    /** Period type: 'all_time' or 'weekly' */
    period?: LeaderboardPeriod;
    /** Number of entries to fetch */
    limit?: number;
    /** Auto-fetch on mount */
    autoFetch?: boolean;
    /** Current user ID for highlighting */
    currentUserId?: string;
}

interface UseLeaderboardReturn {
    /** Leaderboard entries */
    entries: LeaderboardEntry[];
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /** Refresh leaderboard */
    refetch: () => Promise<void>;
    /** Current user's rank (if in leaderboard) */
    currentUserRank: number | null;
    /** Current user's entry (if in leaderboard) */
    currentUserEntry: LeaderboardEntry | null;
}

export function useLeaderboard(options: UseLeaderboardOptions = {}): UseLeaderboardReturn {
    const {
        period = 'all_time',
        limit = 10,
        autoFetch = true,
        currentUserId,
    } = options;

    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
    const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);

    /**
     * Fetch leaderboard data
     */
    const fetchLeaderboard = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            log.debug(`Fetching ${period} leaderboard, limit=${limit}`);

            let data: LeaderboardEntry[];

            if (period === 'weekly') {
                const weeklyData = await leaderboardService.getWeeklyLeaderboard(limit);
                // Deduplicate by user_id (keep first occurrence = highest rank)
                const seenUserIds = new Set<string>();
                data = weeklyData
                    .filter(entry => {
                        if (seenUserIds.has(entry.user_id)) {
                            log.warn('Duplicate user_id in weekly leaderboard', { userId: entry.user_id });
                            return false;
                        }
                        seenUserIds.add(entry.user_id);
                        return true;
                    })
                    .map((entry, index) => ({
                        userId: entry.user_id,
                        fullName: entry.user?.full_name || 'Unknown',
                        avatarUrl: entry.user?.avatar_url,
                        points: entry.points,
                        rank: index + 1,
                    }));
            } else {
                const allTimeData = await leaderboardService.getLeaderboard(limit);
                // Deduplicate by user id (keep first occurrence = highest rank)
                const seenUserIds = new Set<string>();
                data = allTimeData
                    .filter(user => {
                        if (seenUserIds.has(user.id)) {
                            log.warn('Duplicate user_id in all-time leaderboard', { userId: user.id });
                            return false;
                        }
                        seenUserIds.add(user.id);
                        return true;
                    })
                    .map((user, index) => ({
                        userId: user.id,
                        fullName: user.full_name || 'Unknown',
                        avatarUrl: user.avatar_url,
                        points: user.xp_points || 0,
                        rank: index + 1,
                    }));
            }

            setEntries(data);
            log.debug(`Fetched ${data.length} leaderboard entries`);

            // Find current user in leaderboard
            if (currentUserId) {
                const userEntry = data.find(e => e.userId === currentUserId);
                if (userEntry) {
                    setCurrentUserRank(userEntry.rank);
                    setCurrentUserEntry(userEntry);
                } else {
                    setCurrentUserRank(null);
                    setCurrentUserEntry(null);
                }
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to fetch leaderboard');
            log.error('Error fetching leaderboard', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }, [period, limit, currentUserId]);

    /**
     * Refresh leaderboard data
     */
    const refetch = useCallback(async () => {
        await fetchLeaderboard();
    }, [fetchLeaderboard]);

    // Auto-fetch on mount and when period changes
    useEffect(() => {
        if (autoFetch) {
            fetchLeaderboard();
        }
    }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        entries,
        isLoading,
        error,
        refetch,
        currentUserRank,
        currentUserEntry,
    };
}

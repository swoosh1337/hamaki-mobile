/**
 * Leaderboard Service
 * 
 * Handles all leaderboard-related database operations.
 * No React dependencies - pure data access layer.
 */

import type { UserProfile } from '@/types';
import { createLogger } from '@/utils/logger';
import { supabase } from './client';

const log = createLogger('Service:Leaderboard');

/**
 * Leaderboard service for rankings management
 */
export const leaderboardService = {
    /**
     * Get all-time leaderboard (top users by total XP)
     * Uses leaderboard_entries table to avoid duplicates
     */
    async getLeaderboard(limit = 10): Promise<UserProfile[]> {
        try {
            log.debug('Fetching monthly leaderboard entries', { limit });

            const { data, error } = await supabase
                .from('leaderboard_entries')
                .select(`
                    user_id,
                    total_xp,
                    game_xp,
                    subscription_xp,
                    video_like_xp,
                    users!leaderboard_entries_user_id_fkey(
                        id,
                        google_id,
                        email,
                        full_name,
                        avatar_url,
                        xp_points
                    )
                `)
                .eq('period_type', 'monthly')
                .order('total_xp', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Error fetching leaderboard:', error);
                return [];
            }

            log.debug('Fetched monthly leaderboard entries', { count: data?.length || 0 });

            // Map to UserProfile format for backwards compatibility
            return (data || []).map(entry => {
                const user = Array.isArray(entry.users) ? entry.users[0] : entry.users;
                return {
                    ...user,
                    xp_points: entry.total_xp,  // Use total_xp from leaderboard
                    // Provide defaults for required fields if not selected
                    youtube_subscribed: (user as any)?.youtube_subscribed ?? false,
                    created_at: (user as any)?.created_at ?? new Date().toISOString(),
                    updated_at: (user as any)?.updated_at ?? new Date().toISOString(),
                } as UserProfile;
            });
        } catch (error) {
            log.error('Error fetching leaderboard:', error);
            return [];
        }
    },

    /**
     * Get weekly leaderboard entries
     * Uses total_xp from weekly period entries
     * - game_xp resets weekly
     * - subscription_xp and video_like_xp are permanent (never reset)
     */
    async getWeeklyLeaderboard(limit = 10): Promise<Array<{
        user_id: string;
        points: number;  // Keep name for backwards compatibility (uses total_xp)
        user: { full_name: string; avatar_url?: string };
    }>> {
        try {
            log.debug('Fetching weekly leaderboard (total XP)', { limit });

            const { data, error } = await supabase
                .from('leaderboard_entries')
                .select(`
                    user_id,
                    total_xp,
                    users!leaderboard_entries_user_id_fkey(full_name, avatar_url)
                `)
                .eq('period_type', 'weekly')
                .order('total_xp', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Supabase error fetching weekly leaderboard:', error);
                return [];
            }

            log.debug('Fetched weekly leaderboard entries', { count: data?.length || 0 });

            return (data || []).map(entry => ({
                user_id: entry.user_id,
                points: entry.total_xp,  // Use total_xp (includes subscription + video like XP)
                user: Array.isArray(entry.users) ? entry.users[0] : entry.users,
            }));
        } catch (error) {
            log.error('Exception fetching weekly leaderboard:', error);
            return [];
        }
    },

    /**
     * Get leaderboard snapshot (global truth)
     *
     * Returns top N entries ordered by total_xp.
     * This is the authoritative global leaderboard - use for display.
     * Do NOT merge with personal rank from useMyLeaderboardStatus.
     *
     * @param limit Maximum entries to return (default: 100 for mobile optimization)
     * @param periodType Period type to filter by (default: 'monthly')
     */
    async getLeaderboardSnapshot(
        limit = 100,
        periodType: 'weekly' | 'monthly' = 'monthly'
    ): Promise<{
        entries: Array<{
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            totalXP: number;
            gameXP: number;
            subscriptionXP: number;
            videoLikeXP: number;
            rank: number;
        }>;
        fetchedAt: Date;
    }> {
        try {
            log.debug('Fetching leaderboard snapshot', { limit, periodType });

            const { data, error } = await supabase
                .from('leaderboard_entries')
                .select(`
                    user_id,
                    total_xp,
                    game_xp,
                    subscription_xp,
                    video_like_xp,
                    users!leaderboard_entries_user_id_fkey(
                        full_name,
                        avatar_url
                    )
                `)
                .eq('period_type', periodType)
                .order('total_xp', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Error fetching leaderboard snapshot:', error);
                throw error;
            }

            const entries = (data || []).map((entry, index) => {
                const user = Array.isArray(entry.users) ? entry.users[0] : entry.users;
                return {
                    userId: entry.user_id,
                    fullName: user?.full_name || 'Unknown',
                    avatarUrl: user?.avatar_url || null,
                    totalXP: entry.total_xp || 0,
                    gameXP: entry.game_xp || 0,
                    subscriptionXP: entry.subscription_xp || 0,
                    videoLikeXP: entry.video_like_xp || 0,
                    rank: index + 1,
                };
            });

            log.debug('Leaderboard snapshot fetched', { count: entries.length });

            return {
                entries,
                fetchedAt: new Date(),
            };
        } catch (error) {
            log.error('Error fetching leaderboard snapshot:', error);
            throw error;
        }
    },

    /**
     * Get current user's personal leaderboard status
     *
     * Used for initial load. After that, status updates come instantly
     * from the award-xp Edge Function response.
     *
     * NOTE: The rank calculated here is a fallback for initial load only.
     * Authoritative rank updates come from the award-xp Edge Function.
     */
    async getMyLeaderboardStatus(
        userId: string,
        periodType: 'weekly' | 'monthly' = 'monthly'
    ): Promise<{
        xp: {
            game: number;
            subscription: number;
            videoLike: number;
            total: number;
        };
        personalRank: number;
    } | null> {
        try {
            log.debug('Fetching personal leaderboard status', { userId, periodType });

            const { data: entry, error: entryError } = await supabase
                .from('leaderboard_entries')
                .select('game_xp, subscription_xp, video_like_xp, total_xp')
                .eq('user_id', userId)
                .eq('period_type', periodType)
                .single();

            if (entryError) {
                if (entryError.code === 'PGRST116') {
                    // No rows found - new user without entry
                    log.debug('No leaderboard entry found for user (new user)');
                    return null;
                }
                throw entryError;
            }

            // Calculate rank (count users with higher total_xp + 1)
            // NOTE: This is fallback for initial load. Authoritative rank
            // comes from award-xp Edge Function response.
            const { count, error: countError } = await supabase
                .from('leaderboard_entries')
                .select('*', { count: 'exact', head: true })
                .eq('period_type', periodType)
                .gt('total_xp', entry.total_xp);

            if (countError) {
                log.error('Error counting higher entries:', countError);
            }

            const result = {
                xp: {
                    game: entry.game_xp || 0,
                    subscription: entry.subscription_xp || 0,
                    videoLike: entry.video_like_xp || 0,
                    total: entry.total_xp || 0,
                },
                personalRank: (count ?? 0) + 1,
            };

            log.debug('Personal status loaded', {
                total: result.xp.total,
                rank: result.personalRank,
            });

            return result;
        } catch (error) {
            log.error('Error fetching personal status:', error);
            throw error;
        }
    },

    /**
     * Update user's leaderboard points (DEPRECATED - REMOVED)
     *
     * @throws Error This method is no longer available
     * @deprecated Use the award-xp Edge Function instead via invokeEdgeFunction()
     *
     * Migration guide:
     * ```typescript
     * // Before (deprecated):
     * await leaderboardService.updateLeaderboardPoints(userId, xpAmount);
     *
     * // After (correct):
     * import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
     * import type { AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
     *
     * const result = await invokeEdgeFunction<AwardXPResult>({
     *   functionName: 'award-xp',
     *   body: { userId, xpType: 'game', amount: xpAmount },
     *   silentFail: true,
     * });
     * ```
     */
    updateLeaderboardPoints(
        _userId: string,
        _points: number,
        _retryCount = 0
    ): never {
        throw new Error(
            'updateLeaderboardPoints() is deprecated and has been removed. ' +
            'Use the award-xp Edge Function via invokeEdgeFunction() instead. ' +
            'See documentation/hybrid-leaderboard-plan.md for migration guide.'
        );
    },
};

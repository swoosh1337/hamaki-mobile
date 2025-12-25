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
            log.debug('Fetching all-time leaderboard (total XP)', { limit });

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
                .order('total_xp', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Error fetching leaderboard:', error);
                return [];
            }

            log.debug('Fetched all-time leaderboard entries', { count: data?.length || 0 });

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
     * Get weekly/monthly competitive leaderboard entries
     * Uses game_xp which resets monthly for fair competition
     */
    async getWeeklyLeaderboard(limit = 10): Promise<Array<{
        user_id: string;
        points: number;  // Keep name for backwards compatibility
        user: { full_name: string; avatar_url?: string };
    }>> {
        try {
            log.debug('Fetching competitive leaderboard (monthly game XP)', { limit });

            const { data, error } = await supabase
                .from('leaderboard_entries')
                .select(`
                    user_id,
                    game_xp,
                    users!leaderboard_entries_user_id_fkey(full_name, avatar_url)
                `)
                .order('game_xp', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Supabase error fetching competitive leaderboard:', error);
                return [];
            }

            log.debug('Fetched competitive leaderboard entries', { count: data?.length || 0 });

            return (data || []).map(entry => ({
                user_id: entry.user_id,
                points: entry.game_xp,  // Map game_xp to points for backwards compatibility
                user: Array.isArray(entry.users) ? entry.users[0] : entry.users,
            }));
        } catch (error) {
            log.error('Exception fetching competitive leaderboard:', error);
            return [];
        }
    },

    /**
     * Update user's leaderboard points (DEPRECATED)
     * 
     * NOTE: With the new monthly reset system, game XP should be awarded
     * through the `award_xp()` Edge Function, not directly through this service.
     * 
     * This method is kept for backwards compatibility but should not be used
     * for new features.
     */
    async updateLeaderboardPoints(
        userId: string,
        points: number,
        retryCount = 0
    ): Promise<boolean> {
        log.warn('updateLeaderboardPoints is deprecated. Use award_xp Edge Function instead.');

        // For backwards compatibility, update game_xp directly
        // In production, this should go through the Edge Function
        try {
            const { error } = await supabase
                .from('leaderboard_entries')
                .upsert({
                    user_id: userId,
                    game_xp: points  // Will be automatically included in total_xp
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                log.error('Error updating game XP:', error);
                return false;
            }

            return true;
        } catch (error) {
            log.error('Exception updating game XP:', error);
            return false;
        }
    },
};

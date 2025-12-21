/**
 * Leaderboard Service
 * 
 * Handles all leaderboard-related database operations.
 * No React dependencies - pure data access layer.
 */

import type { LeaderboardPeriod, UserProfile } from '@/types';
import { isNetworkError } from '@/utils/errorHandling';
import { createLogger } from '@/utils/logger';
import { supabase } from './client';
import { getWeekStartDate } from './userService';

const log = createLogger('Service:Leaderboard');

/**
 * Leaderboard service for rankings management
 */
export const leaderboardService = {
    /**
     * Get leaderboard (top users by XP)
     */
    async getLeaderboard(limit = 10): Promise<UserProfile[]> {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('xp_points', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Error fetching leaderboard:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            log.error('Error fetching leaderboard:', error);
            return [];
        }
    },

    /**
     * Get weekly leaderboard entries
     */
    async getWeeklyLeaderboard(limit = 10): Promise<Array<{
        user_id: string;
        points: number;
        user: { full_name: string; avatar_url?: string };
    }>> {
        try {
            const weekStartDate = getWeekStartDate();

            const { data, error } = await supabase
                .from('leaderboard_entries')
                .select(`
          user_id,
          points,
          users!leaderboard_entries_user_id_fkey(full_name, avatar_url)
        `)
                .eq('period_type', 'weekly')
                .eq('week_start_date', weekStartDate)
                .order('points', { ascending: false })
                .limit(limit);

            if (error) {
                log.error('Error fetching weekly leaderboard:', error);
                return [];
            }

            return (data || []).map(entry => ({
                user_id: entry.user_id,
                points: entry.points,
                user: Array.isArray(entry.users) ? entry.users[0] : entry.users,
            }));
        } catch (error) {
            log.error('Error fetching weekly leaderboard:', error);
            return [];
        }
    },

    /**
     * Update user's leaderboard points (called after game completion)
     * Includes retry logic for network errors
     */
    async updateLeaderboardPoints(
        userId: string,
        points: number,
        retryCount = 0
    ): Promise<boolean> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // base delay in ms
        const MAX_DELAY = 5000; // cap exponential backoff to 5s

        try {
            const weekStartDate = getWeekStartDate();

            // Update weekly leaderboard
            let weeklySuccess = false;
            let allTimeSuccess = false;

            try {
                weeklySuccess = await this.updatePeriodPoints(
                    userId,
                    points,
                    'weekly',
                    weekStartDate
                );
            } catch (weeklyError) {
                log.error('Weekly leaderboard update failed:', weeklyError);
                // Continue to all-time update even if weekly fails
            }

            // Update all-time leaderboard
            try {
                allTimeSuccess = await this.updatePeriodPoints(
                    userId,
                    points,
                    'all_time'
                );
            } catch (allTimeError) {
                log.error('All-time leaderboard update failed:', allTimeError);
                throw allTimeError; // Throw to trigger retry
            }

            if (weeklySuccess && allTimeSuccess) {
                log.info('Leaderboard updated successfully (both weekly and all-time)');
            } else if (allTimeSuccess) {
                log.warn('Leaderboard partially updated (all-time succeeded, weekly failed)');
            }

            return allTimeSuccess;
        } catch (error) {
            log.error(
                `Error updating leaderboard points (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`,
                error
            );

            // Retry on network errors
            if (isNetworkError(error) && retryCount < MAX_RETRIES) {
                const delay = Math.min(MAX_DELAY, RETRY_DELAY * (retryCount + 1));
                log.info(`Retrying leaderboard update in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.updateLeaderboardPoints(userId, points, retryCount + 1);
            }

            return false;
        }
    },

    /**
     * Update points for a specific period type
     */
    async updatePeriodPoints(
        userId: string,
        points: number,
        periodType: LeaderboardPeriod,
        weekStartDate?: string
    ): Promise<boolean> {
        // Build the query to check for existing entry
        let checkQuery = supabase
            .from('leaderboard_entries')
            .select('points')
            .eq('user_id', userId)
            .eq('period_type', periodType);

        if (periodType === 'weekly' && weekStartDate) {
            checkQuery = checkQuery.eq('week_start_date', weekStartDate);
        }

        const { data: existingEntry, error: checkError } = await checkQuery.single();

        if (checkError && checkError.code !== 'PGRST116') {
            log.error(`Error checking ${periodType} leaderboard:`, checkError);
            throw checkError;
        }

        if (existingEntry) {
            // Update existing entry
            let updateQuery = supabase
                .from('leaderboard_entries')
                .update({ points: existingEntry.points + points })
                .eq('user_id', userId)
                .eq('period_type', periodType);

            if (periodType === 'weekly' && weekStartDate) {
                updateQuery = updateQuery.eq('week_start_date', weekStartDate);
            }

            const { error: updateError } = await updateQuery;

            if (updateError) {
                log.error(`Error updating ${periodType} leaderboard:`, updateError);
                throw updateError;
            }
        } else {
            // Create new entry
            const insertData: Record<string, unknown> = {
                user_id: userId,
                points,
                period_type: periodType,
            };

            if (periodType === 'weekly' && weekStartDate) {
                insertData.week_start_date = weekStartDate;
            }

            const { error: insertError } = await supabase
                .from('leaderboard_entries')
                .insert(insertData);

            if (insertError) {
                log.error(`Error inserting ${periodType} leaderboard:`, insertError);
                throw insertError;
            }
        }

        return true;
    },
};

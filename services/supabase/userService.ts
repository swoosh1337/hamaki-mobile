/**
 * User Service
 * 
 * Handles all user-related database operations.
 * No React dependencies - pure data access layer.
 */

import type { UpsertUserInput, UserProfile, XPStats } from '@/types';
import { VALID_AVATAR_IDS } from '@/types';
import { createLogger } from '@/utils/logger';
import { supabase } from './client';

const log = createLogger('Service:User');

/**
 * User service for profile management
 */
export const userService = {
    /**
     * Create or update user profile after Google authentication
     */
    async upsertUserProfile(userData: UpsertUserInput): Promise<UserProfile | null> {
        try {
            // First, check if user already exists
            const existingUser = await this.getUserProfile(userData.googleId);

            if (existingUser) {
                // User exists, check if we need to update anything
                const needsUpdate =
                    existingUser.email !== userData.email ||
                    existingUser.full_name !== userData.fullName ||
                    existingUser.avatar_url !== userData.avatarUrl ||
                    existingUser.youtube_subscribed !== userData.isSubscribed;

                if (!needsUpdate) {
                    return existingUser;
                }

                // Update existing user
                const { data, error } = await supabase
                    .from('users')
                    .update({
                        email: userData.email,
                        full_name: userData.fullName,
                        avatar_url: userData.avatarUrl,
                        youtube_subscribed: userData.isSubscribed,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('google_id', userData.googleId)
                    .select()
                    .single();

                if (error) {
                    log.error('Error updating user profile:', error);
                    return null;
                }

                return data;
            } else {
                // User doesn't exist, create new one
                const { data, error } = await supabase
                    .from('users')
                    .insert({
                        google_id: userData.googleId,
                        email: userData.email,
                        full_name: userData.fullName,
                        avatar_url: userData.avatarUrl,
                        youtube_subscribed: userData.isSubscribed,
                        xp_points: 0, // Start with 0 XP for new users
                    })
                    .select()
                    .single();

                if (error) {
                    // If duplicate key error, try to fetch the existing user by email
                    if (error.code === '23505') {
                        const { data: existingByEmail } = await supabase
                            .from('users')
                            .select('*')
                            .eq('email', userData.email)
                            .single();

                        if (existingByEmail) {
                            return existingByEmail;
                        }
                    }

                    log.error('Error creating user profile:', error);
                    return null;
                }

                return data;
            }
        } catch (error) {
            log.error('Error upserting user profile:', error);
            return null;
        }
    },

    /**
     * Get user profile by Google ID
     */
    async getUserProfile(googleId: string): Promise<UserProfile | null> {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('google_id', googleId)
                .single();

            if (error) {
                // Only log error if it's not "no rows returned"
                if (error.code !== 'PGRST116') {
                    log.error('Error fetching user profile:', error);
                }
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error fetching user profile:', error);
            return null;
        }
    },

    /**
     * Get user profile by internal user ID
     */
    async getUserProfileById(userId: string): Promise<UserProfile | null> {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    log.error('Error fetching user profile by ID:', error);
                }
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error fetching user profile by ID:', error);
            return null;
        }
    },

    /**
     * Get google_id by internal user id
     */
    async getGoogleIdByUserId(userId: string): Promise<string | null> {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('google_id')
                .eq('id', userId)
                .single();

            if (error || !data) {
                log.error('Error fetching google_id by user id:', error);
                return null;
            }

            return data.google_id;
        } catch (error) {
            log.error('Exception fetching google_id by user id:', error);
            return null;
        }
    },

    /**
     * Update user XP points
     */
    async updateUserXP(googleId: string, xpPoints: number): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('users')
                .update({
                    xp_points: xpPoints,
                    updated_at: new Date().toISOString()
                })
                .eq('google_id', googleId);

            if (error) {
                log.error('Error updating user XP:', error);
                return false;
            }

            return true;
        } catch (error) {
            log.error('Error updating user XP:', error);
            return false;
        }
    },

    /**
     * Update user avatar — accepts avatar ID or URL
     */
    async updateUserAvatar(googleId: string, avatar: string): Promise<UserProfile | null> {
        // Check if it's a valid avatar ID or a full URL
        const isValidUrl = /^https?:\/\//i.test(avatar);
        const isValidAvatarId = VALID_AVATAR_IDS.includes(avatar as any);

        if (!isValidUrl && !isValidAvatarId) {
            throw new Error('Invalid avatar selection');
        }

        try {
            const { data, error } = await supabase
                .from('users')
                .update({
                    avatar_url: avatar,
                    updated_at: new Date().toISOString(),
                })
                .eq('google_id', googleId)
                .select()
                .single();

            if (error) {
                log.error('Error updating user avatar:', error);
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error updating user avatar:', error);
            return null;
        }
    },

    /**
     * Update username
     */
    async updateUsername(googleId: string, username: string): Promise<UserProfile | null> {
        // Validate username
        if (!username || username.length < 2 || username.length > 30) {
            throw new Error('Username must be between 2 and 30 characters');
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(username)) {
            throw new Error('Username can only contain letters, numbers, and spaces');
        }

        try {
            const { data, error } = await supabase
                .from('users')
                .update({
                    full_name: username,
                    updated_at: new Date().toISOString(),
                })
                .eq('google_id', googleId)
                .select()
                .single();

            if (error) {
                log.error('Error updating username:', error);
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error updating username:', error);
            return null;
        }
    },

    /**
     * Get user XP statistics (weekly and total)
     */
    async getUserXPStats(googleId: string): Promise<XPStats | null> {
        try {
            // Get user's total XP
            const userProfile = await this.getUserProfile(googleId);
            if (!userProfile) {
                return null;
            }

            // Calculate week start and end dates (Monday to Sunday)
            const now = new Date();
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - mondayOffset);
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            // Get weekly XP from leaderboard_entries table
            const weekStartDate = getWeekStartDate();

            const { data: weeklyEntry, error: weeklyError } = await supabase
                .from('leaderboard_entries')
                .select('points')
                .eq('user_id', userProfile.id)
                .eq('period_type', 'weekly')
                .eq('week_start_date', weekStartDate)
                .single();

            if (weeklyError && weeklyError.code !== 'PGRST116') {
                log.error('Error fetching weekly XP:', weeklyError);
            }

            const weeklyXP = weeklyEntry?.points || 0;

            return {
                totalXP: userProfile.xp_points,
                weeklyXP,
                weeklyStartDate: weekStart.toISOString(),
                weeklyEndDate: weekEnd.toISOString(),
            };
        } catch (error) {
            log.error('Error getting user XP stats:', error);
            return null;
        }
    },

    /**
     * Delete user account and all associated data
     * Required for Apple App Store compliance
     * 
     * @param googleId - User's Google ID
     * @returns true if deletion was successful, false otherwise
     */
    async deleteUserAccount(googleId: string): Promise<boolean> {
        try {
            log.info('Deleting user account:', googleId);

            // Delete user profile (cascade will handle related data if configured)
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('google_id', googleId);

            if (error) {
                log.error('Error deleting user account:', error);
                return false;
            }

            log.info('User account deleted successfully:', googleId);
            return true;
        } catch (error) {
            log.error('Exception deleting user account:', error);
            return false;
        }
    },
};

/**
 * Helper function to get week start date (Monday) in YYYY-MM-DD format
 */
export function getWeekStartDate(): string {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
}

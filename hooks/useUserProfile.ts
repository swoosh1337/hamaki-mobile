/**
 * useUserProfile Hook
 * 
 * Manages user profile data and operations including XP, avatar, and username updates.
 * Uses caching for XP stats to reduce unnecessary network requests.
 */

import { userService } from '@/services/supabase/userService';
import type { UserProfile, XPStats } from '@/types';
import { createLogger } from '@/utils/logger';
import { getCachedXPStats, setCachedXPStats } from '@/utils/xpStatsCache';
import { useCallback, useEffect, useRef, useState } from 'react';

const log = createLogger('Hook:UserProfile');

interface UseUserProfileOptions {
    /** Google ID of the user to fetch */
    googleId?: string;
    /** User ID (alternative to googleId) */
    userId?: string;
    /** Auto-fetch on mount */
    autoFetch?: boolean;
}

interface UseUserProfileReturn {
    /** User profile data */
    profile: UserProfile | null;
    /** XP statistics */
    xpStats: XPStats | null;
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /** Refresh profile data (uses cache) */
    refetch: () => Promise<void>;
    /** Force refresh profile data (bypasses cache) */
    forceRefetch: () => Promise<void>;
    /** Update user avatar */
    updateAvatar: (avatar: string) => Promise<boolean>;
    /** Update username */
    updateUsername: (username: string) => Promise<boolean>;
    /** Add XP to user */
    addXP: (amount: number) => Promise<boolean>;
}

export function useUserProfile(options: UseUserProfileOptions = {}): UseUserProfileReturn {
    const {
        googleId,
        userId,
        autoFetch = true,
    } = options;

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [xpStats, setXpStats] = useState<XPStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Track if we've already fetched to avoid unnecessary refetches
    const hasFetchedRef = useRef(false);

    /**
     * Fetch user profile with optional cache bypass
     */
    const fetchProfile = useCallback(async (forceRefresh: boolean = false) => {
        if (!googleId && !userId) {
            log.warn('No googleId or userId provided, skipping fetch');
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            let profileData: UserProfile | null = null;

            if (googleId) {
                log.debug(`Fetching profile for googleId: ${googleId}`);
                profileData = await userService.getUserProfile(googleId);
            } else if (userId) {
                log.debug(`Fetching profile for userId: ${userId}`);
                profileData = await userService.getUserProfileById(userId);
            }

            if (profileData) {
                setProfile(profileData);
                log.debug('Profile fetched successfully');

                // Check XP stats cache first (unless force refresh)
                if (!forceRefresh && profileData.id) {
                    const cachedStats = await getCachedXPStats(profileData.id);
                    if (cachedStats) {
                        setXpStats(cachedStats);
                        log.debug('XP stats loaded from cache');
                        hasFetchedRef.current = true;
                        return;
                    }
                }

                // Fetch XP stats from server
                const stats = await userService.getUserXPStats(profileData.google_id);
                if (stats) {
                    setXpStats(stats);
                    // Cache the stats
                    if (profileData.id) {
                        await setCachedXPStats(profileData.id, stats);
                    }
                    log.debug('XP stats fetched and cached');
                }
                hasFetchedRef.current = true;
            } else {
                log.warn('Profile not found');
                setError(new Error('Profile not found'));
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to fetch profile');
            log.error('Error fetching profile', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }, [googleId, userId]);

    /**
     * Refresh profile data (uses cache)
     */
    const refetch = useCallback(async () => {
        await fetchProfile(false);
    }, [fetchProfile]);

    /**
     * Force refresh profile data (bypasses cache)
     */
    const forceRefetch = useCallback(async () => {
        await fetchProfile(true);
    }, [fetchProfile]);

    /**
     * Update user avatar
     */
    const updateAvatar = useCallback(async (avatar: string): Promise<boolean> => {
        if (!profile?.google_id) {
            log.warn('Cannot update avatar without profile');
            return false;
        }

        try {
            log.debug(`Updating avatar to: ${avatar}`);
            const updatedProfile = await userService.updateUserAvatar(profile.google_id, avatar);

            if (updatedProfile) {
                setProfile(updatedProfile);
                log.debug('Avatar updated successfully');
                return true;
            }
            return false;
        } catch (err) {
            log.error('Failed to update avatar', err);
            return false;
        }
    }, [profile?.google_id]);

    /**
     * Update username
     */
    const updateUsername = useCallback(async (username: string): Promise<boolean> => {
        if (!profile?.google_id) {
            log.warn('Cannot update username without profile');
            return false;
        }

        try {
            log.debug(`Updating username to: ${username}`);
            const updatedProfile = await userService.updateUsername(profile.google_id, username);

            if (updatedProfile) {
                setProfile(updatedProfile);
                log.debug('Username updated successfully');
                return true;
            }
            return false;
        } catch (err) {
            log.error('Failed to update username', err);
            throw err; // Re-throw to allow caller to handle validation errors
        }
    }, [profile?.google_id]);

    /**
     * Add XP to user
     */
    const addXP = useCallback(async (amount: number): Promise<boolean> => {
        if (!profile?.google_id) {
            log.warn('Cannot add XP without profile');
            return false;
        }

        try {
            const newXP = (profile.xp_points || 0) + amount;
            log.debug(`Adding ${amount} XP, new total: ${newXP}`);

            const success = await userService.updateUserXP(profile.google_id, newXP);

            if (success) {
                // Update local state
                setProfile(prev => prev ? { ...prev, xp_points: newXP } : null);

                // Refresh XP stats
                const stats = await userService.getUserXPStats(profile.google_id);
                if (stats) {
                    setXpStats(stats);
                }

                log.debug('XP added successfully');
                return true;
            }
            return false;
        } catch (err) {
            log.error('Failed to add XP', err);
            return false;
        }
    }, [profile?.google_id, profile?.xp_points]);

    // Auto-fetch on mount
    useEffect(() => {
        if (autoFetch && (googleId || userId)) {
            fetchProfile();
        }
    }, [googleId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        profile,
        xpStats,
        isLoading,
        error,
        refetch,
        forceRefetch,
        updateAvatar,
        updateUsername,
        addXP,
    };
}

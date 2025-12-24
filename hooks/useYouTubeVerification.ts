/**
 * YouTube Verification Hook
 *
 * Central hook for YouTube subscription and video like verification.
 * Used by UI components in Settings.
 *
 * Features:
 * - Manages loading and error states
 * - Provides manual verify actions
 * - Calculates pending action count for badge
 */

import { useAuth } from '@/contexts/AuthContext';
import { tokenManager } from '@/services/auth';
import {
    getEarnedSubscriptionXP,
    getSubscriptionStatuses,
    getTotalPossibleSubscriptionXP,
    verifyAndAwardSubscriptionXP,
} from '@/services/youtube/subscriptionService';
import { verificationCacheService } from '@/services/youtube/verificationCacheService';
import {
    getTotalPossibleVideoLikeXP,
    getVideoStatusesFromDB,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';
import type {
    SubscriptionStatus,
    VideoLikeStatus,
} from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('UseYouTubeVerification');

interface UseYouTubeVerificationReturn {
    // Subscription state
    subscriptionStatuses: SubscriptionStatus[];
    isLoadingSubscriptions: boolean;
    subscriptionError: Error | null;

    // Video like state
    videoLikeStatuses: VideoLikeStatus[];
    isLoadingVideoLikes: boolean;
    videoLikeError: Error | null;

    // Actions
    verifySubscriptions: () => Promise<void>;
    verifyVideoLikes: () => Promise<void>;
    refreshAll: () => Promise<void>;

    // Computed values
    pendingActionCount: number;
    lastSubscriptionCheck: Date | null;
    totalSubscriptionXP: number;
    earnedSubscriptionXP: number;
    totalVideoLikeXP: number;
}

export function useYouTubeVerification(): UseYouTubeVerificationReturn {
    const { userProfile, authMethod } = useAuth();

    // Subscription state
    const [subscriptionStatuses, setSubscriptionStatuses] = useState<SubscriptionStatus[]>([]);
    const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
    const [subscriptionError, setSubscriptionError] = useState<Error | null>(null);

    // Video like state
    const [videoLikeStatuses, setVideoLikeStatuses] = useState<VideoLikeStatus[]>([]);
    const [isLoadingVideoLikes, setIsLoadingVideoLikes] = useState(false);
    const [videoLikeError, setVideoLikeError] = useState<Error | null>(null);

    // Cache state
    const [lastSubscriptionCheck, setLastSubscriptionCheck] = useState<Date | null>(null);

    /**
     * Load cached data on mount
     */
    useEffect(() => {
        // Only load for Google users with valid user ID
        if (!userProfile?.id || authMethod !== 'google') {
            return;
        }

        loadCachedData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile?.id, authMethod]);

    /**
     * Load cached subscription and video statuses
     */
    const loadCachedData = useCallback(async () => {
        // Use user's UUID (id) - this matches what Edge Function saves to DB
        if (!userProfile?.id) return;

        try {
            // Load subscriptions from cache/DB using user UUID
            const subs = await getSubscriptionStatuses(userProfile.id);
            setSubscriptionStatuses(subs);

            // Load video statuses from database (server-synced)
            const videos = await getVideoStatusesFromDB();
            setVideoLikeStatuses(videos);

            // Get last check time
            const lastCheck = await verificationCacheService.getLastSubscriptionCheckTime();
            if (lastCheck) {
                setLastSubscriptionCheck(new Date(lastCheck));
            }
        } catch (error) {
            log.error('Error loading cached data', error);
        }
    }, [userProfile?.id]);

    /**
     * Verify subscriptions and award XP
     */
    const verifySubscriptions = useCallback(async () => {
        if (!userProfile?.id || !userProfile?.google_id) {
            setSubscriptionError(new Error('User not authenticated'));
            return;
        }

        setIsLoadingSubscriptions(true);
        setSubscriptionError(null);

        try {
            const accessToken = await tokenManager.getValidAccessToken();
            if (!accessToken) {
                throw new Error('No valid access token');
            }

            const result = await verifyAndAwardSubscriptionXP(
                accessToken,
                userProfile.id,
                userProfile.google_id,
                true // Force refresh
            );

            if (result.success) {
                setSubscriptionStatuses(result.statuses);
                setLastSubscriptionCheck(new Date());

                if (result.totalXPAwarded > 0) {
                    log.info(`Awarded ${result.totalXPAwarded} XP for subscriptions`);
                }
            } else if (result.errors.length > 0) {
                throw new Error(result.errors[0]);
            }
        } catch (error) {
            log.error('Error verifying subscriptions', error);
            setSubscriptionError(error instanceof Error ? error : new Error('Unknown error'));
        } finally {
            setIsLoadingSubscriptions(false);
        }
    }, [userProfile?.id, userProfile?.google_id]);

    /**
     * Verify video likes and award XP
     */
    const verifyVideoLikes = useCallback(async () => {
        if (!userProfile?.id) {
            setVideoLikeError(new Error('User not authenticated'));
            return;
        }

        setIsLoadingVideoLikes(true);
        setVideoLikeError(null);

        try {
            const accessToken = await tokenManager.getValidAccessToken();
            if (!accessToken) {
                throw new Error('No valid access token');
            }

            const result = await verifyAndAwardVideoLikeXP(accessToken, userProfile.id);

            if (result.success) {
                setVideoLikeStatuses(result.statuses);

                if (result.totalXPAwarded > 0) {
                    log.info(`Awarded ${result.totalXPAwarded} XP for video likes`);
                }
            } else if (result.errors.length > 0) {
                throw new Error(result.errors[0]);
            }
        } catch (error) {
            log.error('Error verifying video likes', error);
            setVideoLikeError(error instanceof Error ? error : new Error('Unknown error'));
        } finally {
            setIsLoadingVideoLikes(false);
        }
    }, [userProfile?.id]);

    /**
     * Refresh all verification data
     */
    const refreshAll = useCallback(async () => {
        await Promise.all([verifySubscriptions(), verifyVideoLikes()]);
    }, [verifySubscriptions, verifyVideoLikes]);

    /**
     * Calculate pending action count for badge
     * Counts:
     * - Channels not yet subscribed (user could subscribe)
     * - Videos not yet liked (user could like)
     */
    const pendingActionCount = (() => {
        let count = 0;

        // Count unsubscribed channels where XP not yet awarded
        for (const status of subscriptionStatuses) {
            if (!status.xpAwarded) {
                count++;
            }
        }

        // Count videos not liked where XP not yet awarded
        for (const status of videoLikeStatuses) {
            if (status.latestVideoId && !status.xpAwarded) {
                count++;
            }
        }

        return count;
    })();

    /**
     * Calculate XP totals
     */
    const totalSubscriptionXP = getTotalPossibleSubscriptionXP();
    const earnedSubscriptionXP = getEarnedSubscriptionXP(subscriptionStatuses);
    const totalVideoLikeXP = getTotalPossibleVideoLikeXP();

    return {
        // Subscription state
        subscriptionStatuses,
        isLoadingSubscriptions,
        subscriptionError,

        // Video like state
        videoLikeStatuses,
        isLoadingVideoLikes,
        videoLikeError,

        // Actions
        verifySubscriptions,
        verifyVideoLikes,
        refreshAll,

        // Computed values
        pendingActionCount,
        lastSubscriptionCheck,
        totalSubscriptionXP,
        earnedSubscriptionXP,
        totalVideoLikeXP,
    };
}

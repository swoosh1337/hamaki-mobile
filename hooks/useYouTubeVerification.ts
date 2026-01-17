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
import { getDataVersion, incrementDataVersion } from '@/services/youtube/verificationDataVersion';
import {
    getTotalPossibleVideoLikeXP,
    getVideoStatusesFromDB,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';
import type {
    SubscriptionStatus,
    VideoLikeStatus,
} from '@/types/youtube';
import { YOUTUBE_CHANNELS } from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';

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
    pendingSubscriptionCount: number;
    pendingVideoLikeCount: number;
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

    // Track data version to detect background updates
    const lastDataVersionRef = useRef<number>(0);

    /**
     * Load cached data on mount and poll for background updates (Google users only)
     * Polling stops after first version change is detected
     */
    useEffect(() => {
        // Only poll for Google users - magic link users don't have verification
        if (!userProfile?.id || authMethod !== 'google') {
            return;
        }

        // Initial load
        loadCachedData();

        // Poll for data version changes (detects background and manual verification)
        const checkIntervalId = setInterval(async () => {
            const currentVersion = await getDataVersion();
            if (currentVersion > lastDataVersionRef.current) {
                log.info('Data version changed, refreshing', {
                    old: lastDataVersionRef.current,
                    new: currentVersion
                });
                lastDataVersionRef.current = currentVersion;
                loadCachedData();
            }
        }, 2000);

        return () => {
            clearInterval(checkIntervalId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile?.id, authMethod]);

    /**
     * Load cached subscription and video statuses
     * First tries AsyncStorage cache, then falls back to DB
     */
    const loadCachedData = useCallback(async () => {
        // Use user's UUID (id) - this matches what Edge Function saves to DB
        if (!userProfile?.id) return;

        try {
            // Load subscriptions from cache/DB using user UUID
            const subs = await getSubscriptionStatuses(userProfile.id);
            setSubscriptionStatuses(subs);

            const expectedChannelCount = Object.keys(YOUTUBE_CHANNELS).length;
            // Cache TTL: 4 hours (matches sync interval)
            const VIDEO_LIKE_CACHE_TTL = 4 * 60 * 60 * 1000;

            // First try to load video like statuses from cache (instant)
            const hasCache = await verificationCacheService.hasVideoLikeCache();
            if (hasCache) {
                const cachedStatuses = await verificationCacheService.getCachedVideoLikeStatuses();
                const lastCheck = await verificationCacheService.getLastSubscriptionCheckTime();
                const cacheAge = lastCheck ? Date.now() - lastCheck : Infinity;
                const isCacheFresh = cacheAge < VIDEO_LIKE_CACHE_TTL;

                // Only use cache if it has ALL expected channels AND is fresh
                if (cachedStatuses.length >= expectedChannelCount && isCacheFresh) {
                    log.debug('Loaded video like statuses from cache', {
                        count: cachedStatuses.length,
                        ageMinutes: Math.round(cacheAge / 60000)
                    });
                    setVideoLikeStatuses(cachedStatuses);

                    if (lastCheck) {
                        setLastSubscriptionCheck(new Date(lastCheck));
                    }
                    return; // Don't fetch from DB if we have complete and fresh cache
                } else {
                    log.info('Cache invalid, fetching from DB', {
                        cached: cachedStatuses.length,
                        expected: expectedChannelCount,
                        isFresh: isCacheFresh,
                        ageHours: Math.round(cacheAge / 3600000)
                    });
                }
            }

            // No cache - fetch from DB (slower, but accurate)
            log.debug('No video like cache, fetching from DB');
            const videos = await getVideoStatusesFromDB(userProfile.id);
            setVideoLikeStatuses(videos);

            // Cache the results for next time
            if (videos.length > 0) {
                await verificationCacheService.updateAllVideoLikeStatuses(videos);
            }

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

                // Increment data version so other hook instances (e.g., home screen badge) refresh
                await incrementDataVersion();
            } else if (result.errors.length > 0) {
                throw new Error(result.errors[0]);
            }
        } catch (error) {
            log.error('Error verifying subscriptions', error);
            setSubscriptionError(error instanceof Error ? error : new Error('Unknown error'));
            throw error; // Re-throw so caller can handle
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
                // Token refresh failed - gracefully fall back to cached data
                log.warn('Token refresh failed, using cached video like data');
                const cachedStatuses = await verificationCacheService.getCachedVideoLikeStatuses();
                if (cachedStatuses.length > 0) {
                    setVideoLikeStatuses(cachedStatuses);
                    log.info(`Loaded ${cachedStatuses.length} cached video statuses`);
                } else {
                    // No cache - load from DB (shows XP awarded status but can't verify new likes)
                    const dbStatuses = await getVideoStatusesFromDB(userProfile.id);
                    setVideoLikeStatuses(dbStatuses);
                    log.info(`Loaded ${dbStatuses.length} video statuses from DB`);
                }
                // Don't throw - silently use fallback data
                // User can re-authenticate to refresh
                setIsLoadingVideoLikes(false);
                return;
            }

            // Add timeout to prevent infinite loading
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Verification timed out after 30 seconds')), 30000)
            );

            const verifyPromise = verifyAndAwardVideoLikeXP(accessToken, userProfile.id);

            // Race between verification and timeout
            const result = await Promise.race([verifyPromise, timeoutPromise]);

            if (result.success) {
                setVideoLikeStatuses(result.statuses);

                // Cache the results for next time
                await verificationCacheService.updateAllVideoLikeStatuses(result.statuses);

                if (result.totalXPAwarded > 0) {
                    log.info(`Awarded ${result.totalXPAwarded} XP for video likes`);
                }

                // Increment data version so other hook instances (e.g., home screen badge) refresh
                await incrementDataVersion();
            } else if (result.errors.length > 0) {
                throw new Error(result.errors[0]);
            }
        } catch (error) {
            log.error('Error verifying video likes', error);
            setVideoLikeError(error instanceof Error ? error : new Error('Unknown error'));
            throw error; // Re-throw so caller can handle
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
    const pendingCounts = (() => {
        let subscriptionCount = 0;
        let videoLikeCount = 0;

        // Count unsubscribed channels where XP not yet awarded
        for (const status of subscriptionStatuses) {
            if (!status.xpAwarded) {
                subscriptionCount++;
            }
        }

        // Count videos not liked where XP not yet awarded
        for (const status of videoLikeStatuses) {
            if (status.latestVideoId && !status.xpAwarded) {
                videoLikeCount++;
            }
        }

        return {
            total: subscriptionCount + videoLikeCount,
            subscriptions: subscriptionCount,
            videoLikes: videoLikeCount,
        };
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
        pendingActionCount: pendingCounts.total,
        pendingSubscriptionCount: pendingCounts.subscriptions,
        pendingVideoLikeCount: pendingCounts.videoLikes,
        lastSubscriptionCheck,
        totalSubscriptionXP,
        earnedSubscriptionXP,
        totalVideoLikeXP,
    };
}

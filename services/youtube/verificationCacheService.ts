/**
 * Verification Cache Service
 *
 * Manages caching for YouTube subscription and video like verification.
 * Uses AsyncStorage for persistence with TTL-based invalidation.
 *
 * Cache TTL:
 * - Subscriptions: 7 days
 * - Video IDs: 24 hours
 */

import type {
    ChannelKey,
    SubscriptionStatus,
    VerificationCache,
    VideoCache,
    VideoLikeStatus
} from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

const log = createLogger('VerificationCache');

// Storage keys
const CACHE_KEY = 'youtube_verification_cache';

// TTL constants (also exported from types for consistency)
const SUBSCRIPTION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const VIDEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Creates an empty verification cache
 */
function createEmptyCache(): VerificationCache {
    return {
        subscriptions: {
            statuses: {} as Record<ChannelKey, SubscriptionStatus>,
            lastFullCheck: 0,
        },
        videos: {
            videos: {} as VideoCache['videos'],
        },
        lastUpdated: 0,
    };
}

export const verificationCacheService = {
    /**
     * Get the entire verification cache from AsyncStorage
     */
    async getCache(): Promise<VerificationCache> {
        try {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (!cached) {
                log.debug('No cache found, returning empty cache');
                return createEmptyCache();
            }

            const parsed = JSON.parse(cached) as VerificationCache;
            log.debug('Cache retrieved', { lastUpdated: new Date(parsed.lastUpdated).toISOString() });
            return parsed;
        } catch (error) {
            log.error('Error reading cache', error);
            return createEmptyCache();
        }
    },

    /**
     * Save the entire cache to AsyncStorage
     */
    async saveCache(cache: VerificationCache): Promise<void> {
        try {
            cache.lastUpdated = Date.now();
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            log.debug('Cache saved');
        } catch (error) {
            log.error('Error saving cache', error);
        }
    },

    /**
     * Update subscription status for a specific channel
     */
    async updateSubscriptionStatus(
        channelKey: ChannelKey,
        status: SubscriptionStatus
    ): Promise<void> {
        const cache = await this.getCache();
        cache.subscriptions.statuses[channelKey] = status;
        await this.saveCache(cache);
        log.debug('Subscription status updated', { channelKey, isSubscribed: status.isSubscribed });
    },

    /**
     * Update all subscription statuses after a full check
     */
    async updateAllSubscriptionStatuses(
        statuses: Record<ChannelKey, SubscriptionStatus>
    ): Promise<void> {
        const cache = await this.getCache();
        cache.subscriptions.statuses = statuses;
        cache.subscriptions.lastFullCheck = Date.now();
        await this.saveCache(cache);
        log.info('All subscription statuses updated');
    },

    /**
     * Get subscription status for a channel (from cache)
     */
    async getSubscriptionStatus(channelKey: ChannelKey): Promise<SubscriptionStatus | null> {
        const cache = await this.getCache();
        return cache.subscriptions.statuses[channelKey] || null;
    },

    /**
     * Check if subscription cache is still valid (< 7 days old)
     */
    isSubscriptionCacheValid(lastChecked: number): boolean {
        if (!lastChecked) return false;
        const age = Date.now() - lastChecked;
        const isValid = age < SUBSCRIPTION_CACHE_TTL;
        log.debug('Subscription cache validity', {
            age: Math.round(age / (1000 * 60 * 60)), // hours
            isValid
        });
        return isValid;
    },

    /**
     * Check if full subscription check is needed
     */
    async needsFullSubscriptionCheck(): Promise<boolean> {
        const cache = await this.getCache();
        return !this.isSubscriptionCacheValid(cache.subscriptions.lastFullCheck);
    },

    /**
     * Update cached video info for a channel
     */
    async updateVideoCache(
        channelKey: ChannelKey,
        videoId: string,
        title: string,
        thumbnail?: string
    ): Promise<void> {
        const cache = await this.getCache();
        cache.videos.videos[channelKey] = {
            videoId,
            title,
            thumbnail,
            fetchedAt: Date.now(),
        };
        await this.saveCache(cache);
        log.debug('Video cache updated', { channelKey, videoId });
    },

    /**
     * Get cached video info for a channel
     */
    async getCachedVideo(
        channelKey: ChannelKey
    ): Promise<{ videoId: string; title: string; thumbnail?: string } | null> {
        const cache = await this.getCache();
        const video = cache.videos.videos[channelKey];

        if (!video) {
            return null;
        }

        // Check if cache is still valid (< 24 hours)
        if (!this.isVideoCacheValid(video.fetchedAt)) {
            log.debug('Video cache expired', { channelKey });
            return null;
        }

        return {
            videoId: video.videoId,
            title: video.title,
            thumbnail: video.thumbnail,
        };
    },

    /**
     * Check if video ID cache is still valid (< 24 hours old)
     */
    isVideoCacheValid(fetchedAt: number): boolean {
        if (!fetchedAt) return false;
        const age = Date.now() - fetchedAt;
        return age < VIDEO_CACHE_TTL;
    },

    /**
     * Update video like status
     */
    async updateVideoLikeStatus(
        channelKey: ChannelKey,
        status: VideoLikeStatus
    ): Promise<void> {
        // Video like statuses are part of the main cache
        const cache = await this.getCache();
        // Store in a special location if needed
        // For now, video likes are checked fresh each time (not cached long-term)
        log.debug('Video like status noted', { channelKey, isLiked: status.isLiked });
    },

    /**
     * Clear all cached data
     */
    async clearCache(): Promise<void> {
        try {
            await AsyncStorage.removeItem(CACHE_KEY);
            log.info('Verification cache cleared');
        } catch (error) {
            log.error('Error clearing cache', error);
        }
    },

    /**
     * Get the timestamp of last full subscription check
     */
    async getLastSubscriptionCheckTime(): Promise<number> {
        const cache = await this.getCache();
        return cache.subscriptions.lastFullCheck;
    },

    /**
     * Check if any video caches need refresh
     */
    async getChannelsNeedingVideoRefresh(): Promise<ChannelKey[]> {
        const cache = await this.getCache();
        const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

        return channelKeys.filter(key => {
            const video = cache.videos.videos[key];
            return !video || !this.isVideoCacheValid(video.fetchedAt);
        });
    },
};

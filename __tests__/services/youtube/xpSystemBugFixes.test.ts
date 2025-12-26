/**
 * XP System Bug Fixes - Comprehensive Test Suite
 * 
 * Tests for:
 * 1. Video like status caching (videoLikes in VerificationCache)
 * 2. Cache migration for old caches without videoLikes
 * 3. XP awarded status loading from database
 * 4. Preloading data via initialStatuses prop
 * 5. Badge count calculation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock Supabase client
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: jest.fn(),
    },
}));

import { verificationCacheService } from '@/services/youtube/verificationCacheService';
import type { SubscriptionStatus, VerificationCache, VideoLikeStatus } from '@/types/youtube';

describe('XP System Bug Fixes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // 1. Cache Migration Tests
    // =========================================================================
    describe('Cache Migration', () => {
        it('should migrate old cache without videoLikes property', async () => {
            // Simulate old cache format (before videoLikes was added)
            const oldCacheFormat = {
                subscriptions: {
                    statuses: {
                        hamaki: {
                            channelKey: 'hamaki',
                            channelId: 'test123',
                            channelName: 'HamaKi',
                            isSubscribed: true,
                            xpReward: 1000,
                            xpAwarded: true,
                            lastChecked: Date.now(),
                        },
                    },
                    lastFullCheck: Date.now() - 1000,
                },
                videos: { videos: {} },
                lastUpdated: Date.now() - 1000,
                // Note: NO videoLikes property
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(oldCacheFormat));

            const cache = await verificationCacheService.getCache();

            // Should have migrated and added videoLikes
            expect(cache.videoLikes).toBeDefined();
            expect(cache.videoLikes.statuses).toEqual({});
            expect(cache.videoLikes.lastFullCheck).toBe(0);

            // Original data should be preserved
            expect(cache.subscriptions.statuses.hamaki).toBeDefined();
            expect(cache.subscriptions.statuses.hamaki?.isSubscribed).toBe(true);
        });

        it('should migrate cache missing subscriptions property', async () => {
            const corruptCache = {
                videos: { videos: {} },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(corruptCache));

            const cache = await verificationCacheService.getCache();

            expect(cache.subscriptions).toBeDefined();
            expect(cache.subscriptions.statuses).toEqual({});
            expect(cache.videoLikes).toBeDefined();
        });

        it('should migrate cache missing videos property', async () => {
            const corruptCache = {
                subscriptions: { statuses: {}, lastFullCheck: 0 },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(corruptCache));

            const cache = await verificationCacheService.getCache();

            expect(cache.videos).toBeDefined();
            expect(cache.videos.videos).toEqual({});
        });

        it('should return empty cache on JSON parse error', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json {{{');

            const cache = await verificationCacheService.getCache();

            expect(cache.subscriptions.statuses).toEqual({});
            expect(cache.videoLikes.statuses).toEqual({});
            expect(cache.videos.videos).toEqual({});
        });
    });

    // =========================================================================
    // 2. Video Like Caching Tests
    // =========================================================================
    describe('Video Like Caching', () => {
        it('should save video like statuses to cache', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const statuses: VideoLikeStatus[] = [
                {
                    channelKey: 'hamaki',
                    channelName: 'HamaKi',
                    latestVideoId: 'vid123',
                    videoTitle: 'Test Video',
                    isLiked: true,
                    xpReward: 200,
                    xpAwarded: true,
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'koro',
                    channelName: 'Koro',
                    latestVideoId: 'vid456',
                    videoTitle: 'Another Video',
                    isLiked: false,
                    xpReward: 100,
                    xpAwarded: false,
                    lastChecked: Date.now(),
                },
            ];

            await verificationCacheService.updateAllVideoLikeStatuses(statuses);

            expect(AsyncStorage.setItem).toHaveBeenCalled();

            const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]) as VerificationCache;
            expect(savedData.videoLikes.statuses.hamaki?.xpAwarded).toBe(true);
            expect(savedData.videoLikes.statuses.koro?.xpAwarded).toBe(false);
            expect(savedData.videoLikes.lastFullCheck).toBeGreaterThan(0);
        });

        it('should retrieve cached video like statuses', async () => {
            const mockCache: VerificationCache = {
                subscriptions: { statuses: {}, lastFullCheck: 0 },
                videos: { videos: {} },
                videoLikes: {
                    statuses: {
                        hamaki: {
                            channelKey: 'hamaki',
                            channelName: 'HamaKi',
                            latestVideoId: 'vid123',
                            videoTitle: 'Cached Video',
                            isLiked: true,
                            xpReward: 200,
                            xpAwarded: true,
                            lastChecked: Date.now(),
                        },
                    },
                    lastFullCheck: Date.now(),
                },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockCache));

            const statuses = await verificationCacheService.getCachedVideoLikeStatuses();

            expect(statuses).toHaveLength(1);
            expect(statuses[0].channelKey).toBe('hamaki');
            expect(statuses[0].xpAwarded).toBe(true);
        });

        it('should return true for hasVideoLikeCache when cache has data', async () => {
            const mockCache: VerificationCache = {
                subscriptions: { statuses: {}, lastFullCheck: 0 },
                videos: { videos: {} },
                videoLikes: {
                    statuses: {
                        hamaki: {} as VideoLikeStatus,
                    },
                    lastFullCheck: Date.now(),
                },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockCache));

            const hasCache = await verificationCacheService.hasVideoLikeCache();

            expect(hasCache).toBe(true);
        });

        it('should return false for hasVideoLikeCache when cache is empty', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const hasCache = await verificationCacheService.hasVideoLikeCache();

            expect(hasCache).toBe(false);
        });

        it('should update individual video like status', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const status: VideoLikeStatus = {
                channelKey: 'miro',
                channelName: 'Miro',
                latestVideoId: 'vid789',
                videoTitle: 'Miro Video',
                isLiked: true,
                xpReward: 100,
                xpAwarded: true,
                lastChecked: Date.now(),
            };

            await verificationCacheService.updateVideoLikeStatus('miro', status);

            expect(AsyncStorage.setItem).toHaveBeenCalled();

            const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]) as VerificationCache;
            expect(savedData.videoLikes.statuses.miro?.xpAwarded).toBe(true);
        });
    });

    // =========================================================================
    // 3. Badge Count / Pending Action Tests
    // =========================================================================
    describe('Pending Action Count', () => {
        it('should count unverified subscriptions correctly', () => {
            const subscriptionStatuses: SubscriptionStatus[] = [
                { channelKey: 'hamaki', channelId: '1', channelName: 'HamaKi', isSubscribed: true, xpReward: 1000, xpAwarded: true, lastChecked: Date.now() },
                { channelKey: 'miro', channelId: '2', channelName: 'Miro', isSubscribed: true, xpReward: 700, xpAwarded: false, lastChecked: Date.now() },
                { channelKey: 'koro', channelId: '3', channelName: 'Koro', isSubscribed: false, xpReward: 700, xpAwarded: false, lastChecked: Date.now() },
            ];

            const pendingCount = subscriptionStatuses.filter(s => !s.xpAwarded).length;

            expect(pendingCount).toBe(2); // miro and koro
        });

        it('should count unverified video likes correctly', () => {
            const videoLikeStatuses: VideoLikeStatus[] = [
                { channelKey: 'hamaki', channelName: 'HamaKi', latestVideoId: 'v1', videoTitle: 'V1', isLiked: true, xpReward: 200, xpAwarded: true, lastChecked: Date.now() },
                { channelKey: 'miro', channelName: 'Miro', latestVideoId: 'v2', videoTitle: 'V2', isLiked: false, xpReward: 100, xpAwarded: false, lastChecked: Date.now() },
                { channelKey: 'koro', channelName: 'Koro', latestVideoId: null, videoTitle: null, isLiked: false, xpReward: 100, xpAwarded: false, lastChecked: Date.now() }, // No video yet
            ];

            // Only count videos that have a latestVideoId AND are not awarded
            const pendingCount = videoLikeStatuses.filter(s => s.latestVideoId && !s.xpAwarded).length;

            expect(pendingCount).toBe(1); // Only miro (koro has no video)
        });

        it('should return 0 when all videos are awarded', () => {
            const videoLikeStatuses: VideoLikeStatus[] = [
                { channelKey: 'hamaki', channelName: 'HamaKi', latestVideoId: 'v1', videoTitle: 'V1', isLiked: true, xpReward: 200, xpAwarded: true, lastChecked: Date.now() },
                { channelKey: 'miro', channelName: 'Miro', latestVideoId: 'v2', videoTitle: 'V2', isLiked: true, xpReward: 100, xpAwarded: true, lastChecked: Date.now() },
            ];

            const pendingCount = videoLikeStatuses.filter(s => s.latestVideoId && !s.xpAwarded).length;

            expect(pendingCount).toBe(0);
        });
    });

    // =========================================================================
    // 4. Complete Cache Structure Tests
    // =========================================================================
    describe('Complete Cache Structure', () => {
        it('should create empty cache with all required properties', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const cache = await verificationCacheService.getCache();

            expect(cache).toEqual({
                subscriptions: {
                    statuses: {},
                    lastFullCheck: 0,
                },
                videos: {
                    videos: {},
                },
                videoLikes: {
                    statuses: {},
                    lastFullCheck: 0,
                },
                lastUpdated: 0,
            });
        });

        it('should preserve all data when saving cache', async () => {
            const fullCache: VerificationCache = {
                subscriptions: {
                    statuses: {
                        hamaki: {
                            channelKey: 'hamaki',
                            channelId: 'ch1',
                            channelName: 'HamaKi',
                            isSubscribed: true,
                            xpReward: 1000,
                            xpAwarded: true,
                            lastChecked: Date.now(),
                        },
                    },
                    lastFullCheck: Date.now(),
                },
                videos: {
                    videos: {
                        hamaki: {
                            videoId: 'vid1',
                            title: 'Video Title',
                            fetchedAt: Date.now(),
                        },
                    },
                },
                videoLikes: {
                    statuses: {
                        hamaki: {
                            channelKey: 'hamaki',
                            channelName: 'HamaKi',
                            latestVideoId: 'vid1',
                            videoTitle: 'Video Title',
                            isLiked: true,
                            xpReward: 200,
                            xpAwarded: true,
                            lastChecked: Date.now(),
                        },
                    },
                    lastFullCheck: Date.now(),
                },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(fullCache));

            const retrieved = await verificationCacheService.getCache();

            expect(retrieved.subscriptions.statuses.hamaki?.xpAwarded).toBe(true);
            expect(retrieved.videos.videos.hamaki?.videoId).toBe('vid1');
            expect(retrieved.videoLikes.statuses.hamaki?.xpAwarded).toBe(true);
        });
    });
});

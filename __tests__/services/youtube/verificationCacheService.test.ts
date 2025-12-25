/**
 * Verification Cache Service Tests
 *
 * Tests caching functionality for YouTube verification
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

import { verificationCacheService } from '@/services/youtube/verificationCacheService';
import type { SubscriptionStatus, VerificationCache } from '@/types/youtube';

describe('verificationCacheService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCache', () => {
        it('should return empty cache when no data exists', async () => {
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

        it('should return parsed cache when data exists', async () => {
            const mockCache: VerificationCache = {
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
                    } as any,
                    lastFullCheck: Date.now() - 1000,
                },
                videos: { videos: {} },
                videoLikes: { statuses: {}, lastFullCheck: 0 },
                lastUpdated: Date.now() - 1000,
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockCache));

            const cache = await verificationCacheService.getCache();

            expect(cache.subscriptions.statuses.hamaki).toBeDefined();
            expect(cache.subscriptions.statuses.hamaki?.isSubscribed).toBe(true);
        });

        it('should return empty cache on parse error', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json');

            const cache = await verificationCacheService.getCache();

            expect(cache.subscriptions.statuses).toEqual({});
        });
    });

    describe('saveCache', () => {
        it('should save cache with updated timestamp', async () => {
            const mockCache: VerificationCache = {
                subscriptions: { statuses: {} as any, lastFullCheck: 0 },
                videos: { videos: {} },
                videoLikes: { statuses: {}, lastFullCheck: 0 },
                lastUpdated: 0,
            };

            await verificationCacheService.saveCache(mockCache);

            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                'youtube_verification_cache',
                expect.any(String)
            );

            // Check that lastUpdated was set
            const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
            expect(savedData.lastUpdated).toBeGreaterThan(0);
        });
    });

    describe('isSubscriptionCacheValid', () => {
        it('should return true for cache less than 7 days old', () => {
            const lastChecked = Date.now() - (6 * 24 * 60 * 60 * 1000); // 6 days ago
            expect(verificationCacheService.isSubscriptionCacheValid(lastChecked)).toBe(true);
        });

        it('should return false for cache more than 7 days old', () => {
            const lastChecked = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
            expect(verificationCacheService.isSubscriptionCacheValid(lastChecked)).toBe(false);
        });

        it('should return false for zero timestamp', () => {
            expect(verificationCacheService.isSubscriptionCacheValid(0)).toBe(false);
        });
    });

    describe('isVideoCacheValid', () => {
        it('should return true for cache less than 24 hours old', () => {
            const fetchedAt = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago
            expect(verificationCacheService.isVideoCacheValid(fetchedAt)).toBe(true);
        });

        it('should return false for cache more than 24 hours old', () => {
            const fetchedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            expect(verificationCacheService.isVideoCacheValid(fetchedAt)).toBe(false);
        });

        it('should return false for zero timestamp', () => {
            expect(verificationCacheService.isVideoCacheValid(0)).toBe(false);
        });
    });

    describe('clearCache', () => {
        it('should remove cache from AsyncStorage', async () => {
            await verificationCacheService.clearCache();

            expect(AsyncStorage.removeItem).toHaveBeenCalledWith('youtube_verification_cache');
        });
    });

    describe('updateSubscriptionStatus', () => {
        it('should update single subscription status in cache', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const status: SubscriptionStatus = {
                channelKey: 'hamaki',
                channelId: 'test123',
                channelName: 'HamaKi',
                isSubscribed: true,
                xpReward: 1000,
                xpAwarded: false,
                lastChecked: Date.now(),
            };

            await verificationCacheService.updateSubscriptionStatus('hamaki', status);

            expect(AsyncStorage.setItem).toHaveBeenCalled();

            const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
            expect(savedData.subscriptions.statuses.hamaki?.isSubscribed).toBe(true);
        });
    });

    describe('getCachedVideo', () => {
        it('should return null if no video cached', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

            const video = await verificationCacheService.getCachedVideo('hamaki');

            expect(video).toBeNull();
        });

        it('should return null if cache expired', async () => {
            const mockCache: VerificationCache = {
                subscriptions: { statuses: {} as any, lastFullCheck: 0 },
                videos: {
                    videos: {
                        hamaki: {
                            videoId: 'vid123',
                            title: 'Test Video',
                            fetchedAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
                        },
                    },
                },
                videoLikes: { statuses: {}, lastFullCheck: 0 },
                lastUpdated: 0,
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockCache));

            const video = await verificationCacheService.getCachedVideo('hamaki');

            expect(video).toBeNull();
        });

        it('should return video if cache is valid', async () => {
            const mockCache: VerificationCache = {
                subscriptions: { statuses: {} as any, lastFullCheck: 0 },
                videos: {
                    videos: {
                        hamaki: {
                            videoId: 'vid123',
                            title: 'Test Video',
                            fetchedAt: Date.now() - (12 * 60 * 60 * 1000), // 12 hours ago
                        },
                    },
                },
                videoLikes: { statuses: {}, lastFullCheck: 0 },
                lastUpdated: Date.now(),
            };

            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockCache));

            const video = await verificationCacheService.getCachedVideo('hamaki');

            expect(video).toEqual({
                videoId: 'vid123', title: 'Test Video',
                thumbnail: undefined,
            });
        });
    });
});

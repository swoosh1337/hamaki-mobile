/**
 * Video Like Service Tests
 *
 * Tests video like verification and XP awarding with deduplication
 */


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

// Mock Supabase
const mockSupabaseFrom = jest.fn();
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: () => mockSupabaseFrom(),
    },
}));

// Mock verification cache service
const mockGetCachedVideo = jest.fn();
const mockUpdateVideoCache = jest.fn();
jest.mock('@/services/youtube/verificationCacheService', () => ({
    verificationCacheService: {
        getCachedVideo: () => mockGetCachedVideo(),
        updateVideoCache: (...args: any[]) => mockUpdateVideoCache(...args),
    },
}));

// Mock fetch
global.fetch = jest.fn();

import {
    checkAllVideoLikes,
    getTotalPossibleVideoLikeXP,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';

describe('videoLikeService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getTotalPossibleVideoLikeXP', () => {
        it('should return sum of all video like XP rewards', () => {
            // hamaki: 200, miro: 100, bastos: 100, koro: 100 = 500
            expect(getTotalPossibleVideoLikeXP()).toBe(500);
        });
    });

    describe('checkAllVideoLikes', () => {
        it('should use cached video data when available', async () => {
            // Setup: cached video available
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'cached-video-123',
                title: 'Cached Video',
                thumbnail: 'http://thumb.jpg',
            });

            // Mock DB response for user's awarded likes
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { video_like_xp_awarded: {} },
                            error: null,
                        }),
                    }),
                }),
            });

            // Mock video rating check - liked
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const statuses = await checkAllVideoLikes('test-token', 'user-123');

            expect(statuses).toHaveLength(4); // 4 channels
            expect(statuses[0].latestVideoId).toBe('cached-video-123');
            expect(statuses[0].isLiked).toBe(true);
        });

        it('should mark xpAwarded true if video was already awarded', async () => {
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'video-123',
                title: 'Test Video',
            });

            // Mock DB: this video ID was already awarded
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: { 'video-123': true }
                            },
                            error: null,
                        }),
                    }),
                }),
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const statuses = await checkAllVideoLikes('test-token', 'user-123');

            // First channel should have xpAwarded = true
            expect(statuses[0].xpAwarded).toBe(true);
        });
    });

    describe('verifyAndAwardVideoLikeXP', () => {
        it('should award XP for liked video not previously awarded', async () => {
            // Mock cached video
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'new-video-123',
                title: 'New Video',
            });

            // Mock DB: no previous awards
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: {},
                                xp_points: 100,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            // Mock fetch: user liked the video
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBeGreaterThan(0);
        });

        it('should NOT award XP if video was already awarded (deduplication)', async () => {
            // Mock cached video
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'already-awarded-video',
                title: 'Already Awarded Video',
            });

            // Mock DB: this video was already awarded
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: { 'already-awarded-video': true },
                                xp_points: 200,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            // Mock fetch: user liked the video
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0); // No new XP
        });

        it('should NOT award XP if video is not liked', async () => {
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'not-liked-video',
                title: 'Not Liked Video',
            });

            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: {},
                                xp_points: 100,
                            },
                            error: null,
                        }),
                    }),
                }),
            });

            // Mock fetch: user did NOT like the video
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'none' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle API errors gracefully', async () => {
            mockGetCachedVideo.mockResolvedValue({
                videoId: 'error-video',
                title: 'Error Video',
            });

            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'DB Error' },
                        }),
                    }),
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases - Like/Unlike/Like Deduplication', () => {
        it('should NOT award duplicate XP if user unlikes and relikes same video', async () => {
            // Scenario: User liked video → got XP → unliked → liked again
            // Expected: No new XP (already awarded for this video ID)

            mockGetCachedVideo.mockResolvedValue({
                videoId: 'reliked-video-123',
                title: 'Reliked Video',
            });

            // DB shows this video was already awarded
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: { 'reliked-video-123': true },
                                xp_points: 500,
                            },
                            error: null,
                        }),
                    }),
                }),
            });

            // User has liked again
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0); // No duplicate XP!
            expect(result.statuses[0].xpAwarded).toBe(true); // Already awarded
        });

        it('should award XP for NEW video even if old video was awarded', async () => {
            // Scenario: Old video was awarded, new video released
            // Expected: New XP for new video

            // First call returns new video ID
            mockGetCachedVideo.mockResolvedValueOnce({
                videoId: 'new-video-456', // NEW video
                title: 'Brand New Video',
            });
            // Subsequent calls for other channels
            mockGetCachedVideo.mockResolvedValue(null);

            // DB shows old video was awarded, but not the new one
            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: { 'old-video-123': true }, // Old video
                                xp_points: 200,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            // User liked the new video
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBeGreaterThan(0); // New XP for new video!
        });
    });

    describe('Edge Cases - API Errors', () => {
        it('should not revoke XP when API fails', async () => {
            // Scenario: User has XP, API fails to check
            // Expected: Keep existing XP, don't revoke anything

            mockGetCachedVideo.mockRejectedValue(new Error('Network error'));

            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: { 'video-123': true },
                                xp_points: 500, // Existing XP
                            },
                            error: null,
                        }),
                    }),
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            // XP should NOT be negative or reduced
            expect(result.totalXPAwarded).toBe(0); // No change
            // No DB update to remove XP should have happened
        });

        it('should continue checking other channels if one fails', async () => {
            // First channel fails, others succeed
            mockGetCachedVideo
                .mockRejectedValueOnce(new Error('Channel 1 error'))
                .mockResolvedValueOnce({ videoId: 'video-2', title: 'Video 2' })
                .mockResolvedValueOnce({ videoId: 'video-3', title: 'Video 3' })
                .mockResolvedValueOnce({ videoId: 'video-4', title: 'Video 4' });

            mockSupabaseFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                video_like_xp_awarded: {},
                                xp_points: 0,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ rating: 'like' }],
                }),
            });

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            // Should still succeed with partial results
            expect(result.success).toBe(true);
            // 3 channels succeeded, should have XP from them
            expect(result.totalXPAwarded).toBeGreaterThan(0);
        });
    });
});

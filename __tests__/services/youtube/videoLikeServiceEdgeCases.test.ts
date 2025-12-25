/**
 * Video Like Service Edge Cases and Error Handling Tests
 *
 * Comprehensive tests for:
 * - Empty video list handling
 * - Token validation
 * - Network failures
 * - Edge Function errors
 * - Database errors
 * - XP award logic
 * - Missing video data
 * - Invalid responses
 */

import {
    getTotalPossibleVideoLikeXP,
    getVideoStatusesFromDB,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';
import type { YouTubeChannelState } from '@/types/youtube';

// Mock dependencies
const mockGetAll = jest.fn();
const mockGetByChannelKey = jest.fn();

jest.mock('@/services/supabase', () => ({
    channelStateService: {
        getAll: () => mockGetAll(),
        getByChannelKey: (...args: any[]) => mockGetByChannelKey(...args),
    },
    supabase: {
        functions: {
            invoke: jest.fn(),
        },
        from: jest.fn(),
    },
}));

import { supabase } from '@/services/supabase';

describe('Video Like Service Edge Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock users.video_like_xp_awarded query (default: no existing awarded videos)
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                        data: { video_like_xp_awarded: {} },
                        error: null,
                    }),
                }),
            }),
        });
    });

    describe('Empty Video List Handling', () => {
        it('should handle no videos in database gracefully', async () => {
            mockGetAll.mockResolvedValue([]);

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
            expect(result.statuses).toEqual([]);
            expect(result.errors).toEqual([]);
        });

        it('should handle channels with null video IDs', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: null,
                    latest_video_title: null,
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
                {
                    channel_key: 'miro',
                    channel_id: 'UC456',
                    channel_name: 'Miro',
                    latest_video_id: null,
                    latest_video_title: null,
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle mixed null and valid video IDs', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: 'https://example.com/thumb.jpg',
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
                {
                    channel_key: 'miro',
                    channel_id: 'UC456',
                    channel_name: 'Miro',
                    latest_video_id: null,
                    latest_video_title: null,
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'video123', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                    ],
                    totalXPAwarded: 150,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(150);
            // Should only verify the video with valid ID
            expect(supabase.functions.invoke).toHaveBeenCalledWith(
                'verify-video-likes',
                expect.objectContaining({
                    body: expect.objectContaining({
                        videos: [{ videoId: 'video123', channelKey: 'hamaki' }],
                    }),
                })
            );
        });
    });

    describe('Database Error Handling', () => {
        it('should handle database read errors gracefully', async () => {
            mockGetAll.mockRejectedValue(
                new Error('Database connection failed')
            );

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toEqual([]);
        });

        it('should handle null database response', async () => {
            mockGetAll.mockResolvedValue(null);

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toEqual([]);
        });

        it('should handle malformed database records', async () => {
            const mockStates = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    // Missing channel_name
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ] as any[];

            mockGetAll.mockResolvedValue(mockStates);

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toBeInstanceOf(Array);
            expect(statuses.length).toBe(1);
        });
    });

    describe('Edge Function Errors', () => {
        beforeEach(() => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);
        });

        it('should handle Edge Function returning error', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: null,
                error: new Error('Network error'),
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle Edge Function returning success: false', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: false,
                    error: 'YouTube API quota exceeded',
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(false);
            expect(result.errors).toContain('YouTube API quota exceeded');
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle Edge Function timeout', async () => {
            (supabase.functions.invoke as jest.Mock).mockRejectedValue(
                new Error('Request timeout')
            );

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle malformed Edge Function response', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    // Missing results array
                    totalXPAwarded: 0,
                },
                error: null,
            });

            await expect(
                verifyAndAwardVideoLikeXP('valid-token', 'user-uuid')
            ).resolves.not.toThrow();
        });
    });

    describe('XP Award Logic', () => {
        it('should calculate total possible XP correctly', () => {
            const total = getTotalPossibleVideoLikeXP();
            expect(total).toBe(500); // 4 channels × ~125 XP each (varies by channel)
        });

        it('should award XP only for liked videos', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video1',
                    latest_video_title: 'Video 1',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
                {
                    channel_key: 'miro',
                    channel_id: 'UC456',
                    channel_name: 'Miro',
                    latest_video_id: 'video2',
                    latest_video_title: 'Video 2',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'video1', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                        { videoId: 'video2', channelKey: 'miro', liked: false, xpAwarded: 0 },
                    ],
                    totalXPAwarded: 150,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(150);
            expect(result.statuses.find(s => s.channelKey === 'hamaki')?.xpAwarded).toBe(true);
            expect(result.statuses.find(s => s.channelKey === 'miro')?.xpAwarded).toBe(false);
        });

        it('should handle zero XP for no likes', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video1',
                    latest_video_title: 'Video 1',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'video1', channelKey: 'hamaki', liked: false, xpAwarded: 0 },
                    ],
                    totalXPAwarded: 0,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
            expect(result.statuses.every(s => !s.xpAwarded)).toBe(true);
        });
    });

    describe('Missing Video Data Handling', () => {
        it('should handle missing video thumbnail gracefully', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            const statuses = await getVideoStatusesFromDB();

            expect(statuses[0].videoThumbnail).toBeUndefined();
        });

        it('should handle missing video title', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: null,
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            const statuses = await getVideoStatusesFromDB();

            // decodeHtmlEntities returns '' for null input
            expect(statuses[0].videoTitle).toBe('');
        });

        it('should handle video not found in Edge Function results', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video1',
                    latest_video_title: 'Video 1',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
                {
                    channel_key: 'miro',
                    channel_id: 'UC456',
                    channel_name: 'Miro',
                    latest_video_id: 'video2',
                    latest_video_title: 'Video 2',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            // Edge Function only returns result for one video
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'video1', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                        // video2 missing from results
                    ],
                    totalXPAwarded: 150,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.statuses.length).toBe(2);
            // Video not in results should default to not liked
            expect(result.statuses.find(s => s.channelKey === 'miro')?.isLiked).toBe(false);
            expect(result.statuses.find(s => s.channelKey === 'miro')?.xpAwarded).toBe(false);
        });
    });

    describe('Video ID Validation', () => {
        it('should filter out empty video IDs', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: '',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ] as any[];

            mockGetAll.mockResolvedValue(mockStates);

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            // Should not call Edge Function with empty video ID
            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle video ID with special characters', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'dQw4w9WgXcQ', // Real YouTube video ID format
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'dQw4w9WgXcQ', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                    ],
                    totalXPAwarded: 150,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(150);
        });
    });

    describe('Concurrent Request Handling', () => {
        it('should handle multiple simultaneous verification requests', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: null,
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            let callCount = 0;
            (supabase.functions.invoke as jest.Mock).mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    data: {
                        success: true,
                        results: [
                            { videoId: 'video123', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                        ],
                        totalXPAwarded: 150,
                    },
                    error: null,
                });
            });

            // Simulate two simultaneous calls
            const [result1, result2] = await Promise.all([
                verifyAndAwardVideoLikeXP('token1', 'user-uuid'),
                verifyAndAwardVideoLikeXP('token2', 'user-uuid'),
            ]);

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(callCount).toBe(2); // Both should execute
        });
    });

    describe('Status Conversion', () => {
        it('should correctly convert Edge Function results to VideoLikeStatus', async () => {
            const mockStates: YouTubeChannelState[] = [
                {
                    channel_key: 'hamaki',
                    channel_id: 'UC123',
                    channel_name: 'HamaKi',
                    latest_video_id: 'video123',
                    latest_video_title: 'Test Video',
                    latest_video_thumbnail: 'https://example.com/thumb.jpg',
                    last_checked_at: new Date().toISOString(),
                    latest_video_published_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                },
            ];

            mockGetAll.mockResolvedValue(mockStates);

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { videoId: 'video123', channelKey: 'hamaki', liked: true, xpAwarded: 150 },
                    ],
                    totalXPAwarded: 150,
                },
                error: null,
            });

            const result = await verifyAndAwardVideoLikeXP('valid-token', 'user-uuid');

            expect(result.statuses[0]).toMatchObject({
                channelKey: 'hamaki',
                channelName: 'HamaKi',
                latestVideoId: 'video123',
                videoTitle: 'Test Video',
                videoThumbnail: 'https://example.com/thumb.jpg',
                isLiked: true,
                xpAwarded: true,
            });
            expect(result.statuses[0].lastChecked).toBeGreaterThan(0);
        });
    });
});

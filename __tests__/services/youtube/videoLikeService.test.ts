/**
 * Video Like Service Tests
 *
 * Tests video like verification via Edge Function with client-side filtering
 */

import { supabase } from '@/services/supabase';
import {
    getTotalPossibleVideoLikeXP,
    getVideoStatusesFromDB,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';
import type { YouTubeChannelState } from '@/types/youtube';

// Mock channelStateService
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

const mockChannelState: YouTubeChannelState = {
    channel_id: 'UC123',
    channel_key: 'hamaki',
    channel_name: 'HamaKi',
    latest_video_id: 'video-123',
    latest_video_title: 'Test Video',
    latest_video_thumbnail: 'https://example.com/thumb.jpg',
    latest_video_published_at: '2025-01-01T00:00:00Z',
    last_checked_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
};

describe('videoLikeService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getVideoStatusesFromDB', () => {
        it('should return video statuses from database', async () => {
            mockGetAll.mockResolvedValue([mockChannelState]);

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toHaveLength(1);
            expect(statuses[0].channelKey).toBe('hamaki');
            expect(statuses[0].latestVideoId).toBe('video-123');
            expect(statuses[0].xpAwarded).toBe(false);
        });

        it('should return empty array on error', async () => {
            mockGetAll.mockRejectedValue(new Error('DB error'));

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toEqual([]);
        });
    });

    describe('verifyAndAwardVideoLikeXP', () => {
        describe('Basic Functionality', () => {
            it('should call Edge Function and return results', async () => {
                mockGetAll.mockResolvedValue([mockChannelState]);

                // Mock users.video_like_xp_awarded query (no existing awarded videos)
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

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: {
                        success: true,
                        results: [{
                            videoId: 'video-123',
                            channelKey: 'hamaki',
                            liked: true,
                            xpAwarded: 200,
                        }],
                        totalXPAwarded: 200,
                    },
                    error: null,
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(true);
                expect(result.totalXPAwarded).toBe(200);
                expect(supabase.functions.invoke).toHaveBeenCalledWith('verify-video-likes', expect.any(Object));
            });

            it('should handle Edge Function errors', async () => {
                mockGetAll.mockResolvedValue([mockChannelState]);

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

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: null,
                    error: { message: 'Function error' },
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(false);
                expect(result.errors).toContain('Function error');
            });

            it('should return success with no videos to verify', async () => {
                mockGetAll.mockResolvedValue([{
                    ...mockChannelState,
                    latest_video_id: null,
                }]);

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

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(true);
                expect(result.totalXPAwarded).toBe(0);
                expect(supabase.functions.invoke).not.toHaveBeenCalled();
            });
        });

        describe('Client-Side Filtering (Skip Awarded Videos)', () => {
            it('should skip videos that already have XP awarded', async () => {
                mockGetAll.mockResolvedValue([
                    mockChannelState,
                    { ...mockChannelState, channel_key: 'koro', latest_video_id: 'video-456' },
                ]);

                // Mock: video-123 already has XP (JSONB format), video-456 does not
                (supabase.from as jest.Mock).mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: { video_like_xp_awarded: { 'video-123': true } },
                                error: null,
                            }),
                        }),
                    }),
                });

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: {
                        success: true,
                        results: [{
                            videoId: 'video-456',
                            channelKey: 'koro',
                            liked: true,
                            xpAwarded: 100,
                        }],
                        totalXPAwarded: 100,
                    },
                    error: null,
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(true);

                // Should only verify video-456, not video-123
                const invokeCall = (supabase.functions.invoke as jest.Mock).mock.calls[0][1];
                expect(invokeCall.body.videos).toHaveLength(1);
                expect(invokeCall.body.videos[0].videoId).toBe('video-456');
            });

            it('should return early if all videos already have XP', async () => {
                mockGetAll.mockResolvedValue([mockChannelState]);

                // Mock: video already has XP (JSONB format)
                (supabase.from as jest.Mock).mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: { video_like_xp_awarded: { 'video-123': true } },
                                error: null,
                            }),
                        }),
                    }),
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(true);
                expect(result.totalXPAwarded).toBe(0);
                expect(supabase.functions.invoke).not.toHaveBeenCalled();
                expect(result.statuses[0].xpAwarded).toBe(true);
            });

            it('should continue on user_video_likes query error', async () => {
                mockGetAll.mockResolvedValue([mockChannelState]);

                // Mock: error querying users table
                (supabase.from as jest.Mock).mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: null,
                                error: { message: 'User not found' },
                            }),
                        }),
                    }),
                });

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: {
                        success: true,
                        results: [{
                            videoId: 'video-123',
                            channelKey: 'hamaki',
                            liked: true,
                            xpAwarded: 200,
                        }],
                        totalXPAwarded: 200,
                    },
                    error: null,
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                // Should still verify (worst case: re-verify)
                expect(result.success).toBe(true);
                expect(supabase.functions.invoke).toHaveBeenCalled();
            });
        });

        describe('Edge Cases', () => {
            it('should handle partial XP awards correctly', async () => {
                mockGetAll.mockResolvedValue([
                    mockChannelState,
                    { ...mockChannelState, channel_key: 'koro', latest_video_id: 'video-456' },
                ]);

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

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: {
                        success: true,
                        results: [
                            { videoId: 'video-123', channelKey: 'hamaki', liked: true, xpAwarded: 200 },
                            { videoId: 'video-456', channelKey: 'koro', liked: false, xpAwarded: 0 },
                        ],
                        totalXPAwarded: 200,
                    },
                    error: null,
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(true);
                expect(result.totalXPAwarded).toBe(200);
                expect(result.statuses[0].xpAwarded).toBe(true);
                expect(result.statuses[1].xpAwarded).toBe(false);
            });

            it('should handle Edge Function success=false', async () => {
                mockGetAll.mockResolvedValue([mockChannelState]);

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

                (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                    data: {
                        success: false,
                        error: 'YouTube API error',
                        results: [],
                        totalXPAwarded: 0,
                    },
                    error: null,
                });

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(false);
                expect(result.errors).toContain('YouTube API error');
            });

            it('should handle unexpected errors gracefully', async () => {
                mockGetAll.mockRejectedValue(new Error('Unexpected DB error'));

                const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

                expect(result.success).toBe(false);
                expect(result.errors[0]).toContain('Unexpected DB error');
            });
        });
    });

    describe('getTotalPossibleVideoLikeXP', () => {
        it('should return total possible XP', () => {
            const total = getTotalPossibleVideoLikeXP();
            expect(total).toBe(500); // hamaki:200 + miro:100 + bastos:100 + koro:100
        });
    });
});

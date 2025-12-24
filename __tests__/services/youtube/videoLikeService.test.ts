/**
 * Video Like Service Tests
 *
 * Tests video like verification via Edge Function
 * 
 * NOTE: Service now calls Edge Function, not YouTube API directly
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
    },
}));

import { supabase } from '@/services/supabase';
import {
    getTotalPossibleVideoLikeXP,
    getVideoStatusesFromDB,
    verifyAndAwardVideoLikeXP,
} from '@/services/youtube/videoLikeService';
import type { YouTubeChannelState } from '@/types/youtube';

const mockInvoke = supabase.functions.invoke as jest.Mock;

describe('videoLikeService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockChannelState: YouTubeChannelState = {
        channel_id: 'UCtest',
        channel_key: 'hamaki',
        channel_name: 'HamaKi',
        latest_video_id: 'video-123',
        latest_video_title: 'Test Video',
        latest_video_thumbnail: 'https://thumb.jpg',
        latest_video_published_at: '2024-01-01T00:00:00Z',
        last_checked_at: '2024-01-01T12:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
    };

    describe('getTotalPossibleVideoLikeXP', () => {
        it('should return sum of all video like XP rewards', () => {
            // hamaki: 200, miro: 100, bastos: 100, koro: 100 = 500
            expect(getTotalPossibleVideoLikeXP()).toBe(500);
        });
    });

    describe('getVideoStatusesFromDB', () => {
        it('should return video statuses from database', async () => {
            mockGetAll.mockResolvedValue([mockChannelState]);

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toHaveLength(1);
            expect(statuses[0].channelKey).toBe('hamaki');
            expect(statuses[0].latestVideoId).toBe('video-123');
            expect(statuses[0].isLiked).toBe(false); // Unknown until verified
        });

        it('should return empty array on error', async () => {
            mockGetAll.mockRejectedValue(new Error('DB Error'));

            const statuses = await getVideoStatusesFromDB();

            expect(statuses).toEqual([]);
        });
    });

    describe('verifyAndAwardVideoLikeXP', () => {
        it('should call Edge Function and return results', async () => {
            mockGetAll.mockResolvedValue([mockChannelState]);
            mockInvoke.mockResolvedValue({
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
            expect(mockInvoke).toHaveBeenCalledWith('verify-video-likes', expect.any(Object));
        });

        it('should handle Edge Function errors', async () => {
            mockGetAll.mockResolvedValue([mockChannelState]);
            mockInvoke.mockResolvedValue({
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
                latest_video_id: null, // No video
            }]);

            const result = await verifyAndAwardVideoLikeXP('test-token', 'user-123');

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
            expect(mockInvoke).not.toHaveBeenCalled(); // No Edge Function call
        });
    });
});

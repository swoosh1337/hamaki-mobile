/**
 * Channel State Service Tests
 *
 * Tests for the read-only channel state service that provides
 * server-synced YouTube video data from the database.
 */

// Mock logger
jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock Supabase client with chainable methods
const mockFrom = jest.fn();
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

import { channelStateService } from '@/services/supabase/channelStateService';
import type { YouTubeChannelState } from '@/types/youtube';

describe('channelStateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockChannelState: YouTubeChannelState = {
        channel_id: 'UCgdME9lBqBHrNNzyMqzfrag',
        channel_key: 'hamaki',
        channel_name: 'HamaKi',
        latest_video_id: 'video-123',
        latest_video_title: 'Test Video',
        latest_video_thumbnail: 'https://thumb.jpg',
        latest_video_published_at: '2024-01-01T00:00:00Z',
        last_checked_at: '2024-01-01T12:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
    };

    describe('getAll', () => {
        it('should return all channel states ordered by latest video date', async () => {
            const mockData = [
                { ...mockChannelState, channel_key: 'hamaki' },
                { ...mockChannelState, channel_key: 'miro', channel_id: 'miro-id' },
            ];

            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
                }),
            });

            const result = await channelStateService.getAll();

            expect(mockFrom).toHaveBeenCalledWith('youtube_channel_state');
            expect(result).toHaveLength(2);
            expect(result[0].channel_key).toBe('hamaki');
        });

        it('should return empty array when no data exists', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
            });

            const result = await channelStateService.getAll();

            expect(result).toEqual([]);
        });

        it('should throw error when database query fails', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
                }),
            });

            await expect(channelStateService.getAll()).rejects.toEqual({ message: 'DB Error' });
        });

        it('should return empty array when data is null', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
            });

            const result = await channelStateService.getAll();

            expect(result).toEqual([]);
        });
    });

    describe('getByChannelKey', () => {
        it('should return channel state for valid channel key', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockChannelState, error: null }),
                    }),
                }),
            });

            const result = await channelStateService.getByChannelKey('hamaki');

            expect(mockFrom).toHaveBeenCalledWith('youtube_channel_state');
            expect(result).toEqual(mockChannelState);
        });

        it('should return null when channel not found (PGRST116)', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                    }),
                }),
            });

            const result = await channelStateService.getByChannelKey('hamaki');

            expect(result).toBeNull();
        });

        it('should throw error for database errors other than PGRST116', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { code: 'OTHER_ERROR', message: 'DB Error' }
                        }),
                    }),
                }),
            });

            await expect(channelStateService.getByChannelKey('hamaki')).rejects.toEqual({
                code: 'OTHER_ERROR',
                message: 'DB Error',
            });
        });
    });

    describe('getByChannelId', () => {
        it('should return channel state for valid channel ID', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockChannelState, error: null }),
                    }),
                }),
            });

            const result = await channelStateService.getByChannelId('UCgdME9lBqBHrNNzyMqzfrag');

            expect(result).toEqual(mockChannelState);
        });

        it('should return null when channel ID not found', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                    }),
                }),
            });

            const result = await channelStateService.getByChannelId('unknown-id');

            expect(result).toBeNull();
        });
    });

    describe('hasStaleData', () => {
        it('should return true when data is stale', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue({
                            data: [{ channel_key: 'hamaki' }],
                            error: null
                        }),
                    }),
                }),
            });

            const result = await channelStateService.hasStaleData();

            expect(result).toBe(true);
        });

        it('should return false when data is fresh', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                }),
            });

            const result = await channelStateService.hasStaleData();

            expect(result).toBe(false);
        });

        it('should return false on error', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
                    }),
                }),
            });

            const result = await channelStateService.hasStaleData();

            expect(result).toBe(false);
        });
    });
});

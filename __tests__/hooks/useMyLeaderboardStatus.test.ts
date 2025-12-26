/**
 * useMyLeaderboardStatus Hook Tests
 *
 * Tests cover:
 * - Initial fetch from service
 * - Instant update from Edge Function response
 * - Error handling
 * - New user handling (no entry)
 */

import { useMyLeaderboardStatus, AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
import { leaderboardService } from '@/services/supabase/leaderboardService';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Mock the leaderboardService
jest.mock('@/services/supabase/leaderboardService', () => ({
    leaderboardService: {
        getMyLeaderboardStatus: jest.fn(),
    },
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

const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;

describe('useMyLeaderboardStatus', () => {
    const mockUserId = 'user-123';

    const mockStatus = {
        xp: {
            game: 500,
            subscription: 200,
            videoLike: 100,
            total: 800,
        },
        personalRank: 42,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockLeaderboardService.getMyLeaderboardStatus.mockResolvedValue(mockStatus);
    });

    describe('initial state', () => {
        it('should start with default values when autoFetch is disabled', () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId, autoFetch: false })
            );

            expect(result.current.personalRank).toBeNull();
            expect(result.current.myXP).toEqual({
                game: 0,
                subscription: 0,
                videoLike: 0,
                total: 0,
            });
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should auto-fetch on mount when userId provided', async () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockLeaderboardService.getMyLeaderboardStatus).toHaveBeenCalledWith(mockUserId);
            expect(result.current.myXP).toEqual(mockStatus.xp);
            expect(result.current.personalRank).toBe(42);
        });

        it('should not fetch when userId is not provided', () => {
            renderHook(() => useMyLeaderboardStatus({}));

            expect(mockLeaderboardService.getMyLeaderboardStatus).not.toHaveBeenCalled();
        });
    });

    describe('updateFromAwardXP', () => {
        it('should update state instantly from Edge Function result', async () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId, autoFetch: false })
            );

            const awardResult: AwardXPResult = {
                success: true,
                new_total_xp: 1000,
                personal_rank: 35,
                xp_breakdown: {
                    game: 600,
                    subscription: 250,
                    video_like: 150,
                },
            };

            act(() => {
                result.current.updateFromAwardXP(awardResult);
            });

            expect(result.current.myXP).toEqual({
                game: 600,
                subscription: 250,
                videoLike: 150,
                total: 1000,
            });
            expect(result.current.personalRank).toBe(35);
        });

        it('should ignore failed award results', async () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            await waitFor(() => {
                expect(result.current.personalRank).toBe(42);
            });

            const failedResult: AwardXPResult = {
                success: false,
                new_total_xp: 0,
                personal_rank: 0,
                xp_breakdown: { game: 0, subscription: 0, video_like: 0 },
            };

            act(() => {
                result.current.updateFromAwardXP(failedResult);
            });

            // State should remain unchanged
            expect(result.current.personalRank).toBe(42);
            expect(result.current.myXP.total).toBe(800);
        });
    });

    describe('refetch', () => {
        it('should refetch status from service', async () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Update mock data
            mockLeaderboardService.getMyLeaderboardStatus.mockResolvedValue({
                xp: { game: 700, subscription: 300, videoLike: 200, total: 1200 },
                personalRank: 25,
            });

            await act(async () => {
                await result.current.refetch();
            });

            expect(result.current.myXP.total).toBe(1200);
            expect(result.current.personalRank).toBe(25);
        });
    });

    describe('new user handling', () => {
        it('should handle null response (new user with no entry)', async () => {
            mockLeaderboardService.getMyLeaderboardStatus.mockResolvedValue(null);

            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.myXP).toEqual({
                game: 0,
                subscription: 0,
                videoLike: 0,
                total: 0,
            });
            expect(result.current.personalRank).toBeNull();
        });
    });

    describe('error handling', () => {
        it('should handle fetch errors', async () => {
            mockLeaderboardService.getMyLeaderboardStatus.mockRejectedValue(
                new Error('Database error')
            );

            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Database error');
        });
    });

    describe('loading state', () => {
        it('should set loading while fetching', async () => {
            mockLeaderboardService.getMyLeaderboardStatus.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockStatus), 100))
            );

            const { result } = renderHook(() =>
                useMyLeaderboardStatus({ userId: mockUserId })
            );

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });
    });
});

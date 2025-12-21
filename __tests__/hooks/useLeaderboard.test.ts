/**
 * useLeaderboard Hook Tests
 */

import { useLeaderboard } from '@/hooks/useLeaderboard';
import { leaderboardService } from '@/services/supabase/leaderboardService';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Mock the leaderboardService
jest.mock('@/services/supabase/leaderboardService', () => ({
    leaderboardService: {
        getLeaderboard: jest.fn(),
        getWeeklyLeaderboard: jest.fn(),
    },
}));

const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;

describe('useLeaderboard', () => {
    const mockCurrentUserId = 'user-2';

    const mockAllTimeData = [
        { id: 'user-1', full_name: 'Top Player', avatar_url: 'avatar1.jpg', xp_points: 5000 },
        { id: 'user-2', full_name: 'Current User', avatar_url: 'avatar2.jpg', xp_points: 3000 },
        { id: 'user-3', full_name: 'Third Place', avatar_url: null, xp_points: 2000 },
    ];

    const mockWeeklyData = [
        { user_id: 'user-1', points: 500, user: { full_name: 'Weekly Leader', avatar_url: 'avatar1.jpg' } },
        { user_id: 'user-2', points: 300, user: { full_name: 'Current User', avatar_url: 'avatar2.jpg' } },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockLeaderboardService.getLeaderboard.mockResolvedValue(mockAllTimeData as any);
        mockLeaderboardService.getWeeklyLeaderboard.mockResolvedValue(mockWeeklyData);
    });

    describe('initial state', () => {
        it('should start with empty entries', () => {
            const { result } = renderHook(() => useLeaderboard({ autoFetch: false }));

            expect(result.current.entries).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should auto-fetch all-time leaderboard by default', async () => {
            const { result } = renderHook(() => useLeaderboard());

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(3);
            });

            expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(10);
            expect(mockLeaderboardService.getWeeklyLeaderboard).not.toHaveBeenCalled();
        });
    });

    describe('all-time leaderboard', () => {
        it('should fetch and transform all-time data correctly', async () => {
            const { result } = renderHook(() => useLeaderboard({ period: 'all_time' }));

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(3);
            });

            expect(result.current.entries[0]).toEqual({
                userId: 'user-1',
                fullName: 'Top Player',
                avatarUrl: 'avatar1.jpg',
                points: 5000,
                rank: 1,
            });

            expect(result.current.entries[2]).toEqual({
                userId: 'user-3',
                fullName: 'Third Place',
                avatarUrl: null,
                points: 2000,
                rank: 3,
            });
        });

        it('should use custom limit', async () => {
            const { result } = renderHook(() => useLeaderboard({ limit: 5 }));

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(3);
            });

            expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(5);
        });
    });

    describe('weekly leaderboard', () => {
        it('should fetch weekly leaderboard when period is weekly', async () => {
            const { result } = renderHook(() => useLeaderboard({ period: 'weekly' }));

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(2);
            });

            expect(mockLeaderboardService.getWeeklyLeaderboard).toHaveBeenCalledWith(10);
            expect(mockLeaderboardService.getLeaderboard).not.toHaveBeenCalled();
        });

        it('should transform weekly data correctly', async () => {
            const { result } = renderHook(() => useLeaderboard({ period: 'weekly' }));

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(2);
            });

            expect(result.current.entries[0]).toEqual({
                userId: 'user-1',
                fullName: 'Weekly Leader',
                avatarUrl: 'avatar1.jpg',
                points: 500,
                rank: 1,
            });
        });
    });

    describe('current user tracking', () => {
        it('should find current user in leaderboard', async () => {
            const { result } = renderHook(() =>
                useLeaderboard({ currentUserId: mockCurrentUserId })
            );

            await waitFor(() => {
                expect(result.current.currentUserRank).toBe(2);
            });

            expect(result.current.currentUserEntry).toEqual({
                userId: 'user-2',
                fullName: 'Current User',
                avatarUrl: 'avatar2.jpg',
                points: 3000,
                rank: 2,
            });
        });

        it('should return null when current user not in leaderboard', async () => {
            const { result } = renderHook(() =>
                useLeaderboard({ currentUserId: 'non-existent-user' })
            );

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(3);
            });

            expect(result.current.currentUserRank).toBeNull();
            expect(result.current.currentUserEntry).toBeNull();
        });
    });

    describe('error handling', () => {
        it('should handle fetch errors', async () => {
            mockLeaderboardService.getLeaderboard.mockRejectedValue(
                new Error('Database error')
            );

            const { result } = renderHook(() => useLeaderboard());

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Database error');
            expect(result.current.entries).toEqual([]);
        });
    });

    describe('refetch', () => {
        it('should refetch leaderboard data', async () => {
            const { result } = renderHook(() => useLeaderboard());

            await waitFor(() => {
                expect(result.current.entries).toHaveLength(3);
            });

            // Update mock data
            const newData = [{ id: 'user-new', full_name: 'New Leader', xp_points: 10000 }];
            mockLeaderboardService.getLeaderboard.mockResolvedValue(newData as any);

            await act(async () => {
                await result.current.refetch();
            });

            await waitFor(() => {
                expect(result.current.entries[0].fullName).toBe('New Leader');
            });
        });
    });

    describe('loading state', () => {
        it('should set loading while fetching', async () => {
            mockLeaderboardService.getLeaderboard.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockAllTimeData as any), 100))
            );

            const { result } = renderHook(() => useLeaderboard());

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });
    });
});

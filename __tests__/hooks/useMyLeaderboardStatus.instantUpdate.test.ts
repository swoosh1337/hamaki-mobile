/**
 * Tests for instant leaderboard rank updates after game XP awards
 */

import { useMyLeaderboardStatus } from '@/hooks/useMyLeaderboardStatus';
import type { AwardXPResult } from '@/types/leaderboard';
import { act, renderHook } from '@testing-library/react-native';

// Mock the leaderboard service
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

describe('useMyLeaderboardStatus - Instant Updates', () => {
    const mockUserId = 'user-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('updateFromAwardXP', () => {
        it('should instantly update personal rank and XP from Edge Function response', () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({
                    userId: mockUserId,
                    autoFetch: false,
                })
            );

            // Initial state
            expect(result.current.personalRank).toBeNull();
            expect(result.current.myXP.total).toBe(0);

            // Simulate successful XP award from Edge Function
            const awardResult: AwardXPResult = {
                success: true,
                new_total_xp: 150,
                personal_rank: 42,
                xp_breakdown: {
                    game: 100,
                    subscription: 30,
                    video_like: 20,
                },
            };

            act(() => {
                result.current.updateFromAwardXP(awardResult);
            });

            // Should update instantly without refetch
            expect(result.current.personalRank).toBe(42);
            expect(result.current.myXP.total).toBe(150);
            expect(result.current.myXP.game).toBe(100);
            expect(result.current.myXP.subscription).toBe(30);
            expect(result.current.myXP.videoLike).toBe(20);
        });

        it('should handle multiple consecutive updates', () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({
                    userId: mockUserId,
                    autoFetch: false,
                })
            );

            // First game
            act(() => {
                result.current.updateFromAwardXP({
                    success: true,
                    new_total_xp: 50,
                    personal_rank: 100,
                    xp_breakdown: { game: 50, subscription: 0, video_like: 0 },
                });
            });

            expect(result.current.personalRank).toBe(100);
            expect(result.current.myXP.total).toBe(50);

            // Second game (rank improved)
            act(() => {
                result.current.updateFromAwardXP({
                    success: true,
                    new_total_xp: 100,
                    personal_rank: 75,
                    xp_breakdown: { game: 100, subscription: 0, video_like: 0 },
                });
            });

            expect(result.current.personalRank).toBe(75);
            expect(result.current.myXP.total).toBe(100);
        });

        it('should ignore failed award results', () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({
                    userId: mockUserId,
                    autoFetch: false,
                })
            );

            // Set initial state
            act(() => {
                result.current.updateFromAwardXP({
                    success: true,
                    new_total_xp: 50,
                    personal_rank: 100,
                    xp_breakdown: { game: 50, subscription: 0, video_like: 0 },
                });
            });

            const initialRank = result.current.personalRank;
            const initialXP = result.current.myXP.total;

            // Try to update with failed result
            act(() => {
                result.current.updateFromAwardXP({
                    success: false,
                    new_total_xp: 0,
                    personal_rank: 0,
                    xp_breakdown: { game: 0, subscription: 0, video_like: 0 },
                });
            });

            // Should not change
            expect(result.current.personalRank).toBe(initialRank);
            expect(result.current.myXP.total).toBe(initialXP);
        });
    });

    describe('Integration with games', () => {
        it('should work with typical game XP award flow', () => {
            const { result } = renderHook(() =>
                useMyLeaderboardStatus({
                    userId: mockUserId,
                    autoFetch: false,
                })
            );

            // Simulate game completion and XP award
            const gameScore = 500;
            const xpToAward = Math.floor(gameScore / 10); // 50 XP

            // Simulate Edge Function response
            const edgeFunctionResponse: AwardXPResult = {
                success: true,
                new_total_xp: 150, // User had 100 XP, now has 150
                personal_rank: 42,
                xp_breakdown: {
                    game: 150,
                    subscription: 0,
                    video_like: 0,
                },
            };

            // Game calls updateFromAwardXP
            act(() => {
                result.current.updateFromAwardXP(edgeFunctionResponse);
            });

            // Rank should update instantly (no 5-minute wait)
            expect(result.current.personalRank).toBe(42);
            expect(result.current.myXP.total).toBe(150);
            expect(result.current.myXP.game).toBe(150);
        });
    });
});

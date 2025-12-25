/**
 * Subscription Service Edge Cases and Error Handling Tests
 *
 * Comprehensive tests for:
 * - Token validation (empty, whitespace, null)
 * - Network failures and retries
 * - Edge Function errors
 * - Database errors
 * - XP award logic edge cases
 * - Race conditions
 * - Invalid responses
 */

import {
    getEarnedSubscriptionXP,
    getSubscriptionStatuses,
    getTotalPossibleSubscriptionXP,
    verifyAndAwardSubscriptionXP,
} from '@/services/youtube/subscriptionService';
import type { SubscriptionStatus } from '@/types/youtube';

// Mock dependencies
jest.mock('@/services/supabase', () => ({
    supabase: {
        from: jest.fn(),
        functions: {
            invoke: jest.fn(),
        },
    },
    leaderboardService: {
        updateLeaderboardPoints: jest.fn(),
    },
}));

jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { leaderboardService, supabase } from '@/services/supabase';

describe('Subscription Service Edge Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Token Validation', () => {
        it('should reject empty access token', async () => {
            const result = await verifyAndAwardSubscriptionXP(
                '',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Access token is empty');
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should reject whitespace-only access token', async () => {
            const result = await verifyAndAwardSubscriptionXP(
                '   ',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Access token is empty');
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should trim access token before use', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                        { channelKey: 'miro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'bastos', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'koro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1000,
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                '  valid-token  ',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(true);
            expect(supabase.functions.invoke).toHaveBeenCalledWith(
                'verify-subscriptions',
                expect.objectContaining({
                    body: expect.objectContaining({
                        accessToken: 'valid-token', // Trimmed
                    }),
                })
            );
        });

        it('should handle newline characters in token', async () => {
            const result = await verifyAndAwardSubscriptionXP(
                '  \n  ',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Access token is empty');
        });
    });

    describe('Edge Function Errors', () => {
        it('should handle Edge Function returning error', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: null,
                error: new Error('Network error'),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle Edge Function returning success: false', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: false,
                    error: 'YouTube API rate limit exceeded',
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors).toContain('YouTube API rate limit exceeded');
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle Edge Function timeout', async () => {
            (supabase.functions.invoke as jest.Mock).mockRejectedValue(
                new Error('Request timeout')
            );

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        }, 10000); // 10 second timeout since retryWithBackoff will retry 3 times

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
                verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false)
            ).resolves.not.toThrow();
        });
    });

    describe('Database Error Handling', () => {
        it('should handle database read errors gracefully', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'Database connection failed' },
                    }),
                }),
            });

            const result = await getSubscriptionStatuses('user-uuid');

            // Should return empty/default statuses instead of throwing
            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBe(4); // All 4 channels
            expect(result.every(s => !s.isSubscribed && !s.xpAwarded)).toBe(true);
        });

        it('should handle null database response', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: null,
                        error: null,
                    }),
                }),
            });

            const result = await getSubscriptionStatuses('user-uuid');

            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBe(4);
        });
    });

    describe('XP Award Logic', () => {
        it('should calculate total possible XP correctly', () => {
            const total = getTotalPossibleSubscriptionXP();
            expect(total).toBe(3100); // 1000 + 700 + 700 + 700
        });

        it('should calculate earned XP for partial subscription', () => {
            const statuses: SubscriptionStatus[] = [
                {
                    channelKey: 'hamaki',
                    channelId: 'id1',
                    channelName: 'HamaKi',
                    isSubscribed: true,
                    xpReward: 1000,
                    xpAwarded: true,
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'miro',
                    channelId: 'id2',
                    channelName: 'Miro',
                    isSubscribed: true,
                    xpReward: 700,
                    xpAwarded: true,
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'bastos',
                    channelId: 'id3',
                    channelName: 'Bastos',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
                {
                    channelKey: 'koro',
                    channelId: 'id4',
                    channelName: 'Koro',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
            ];

            const earned = getEarnedSubscriptionXP(statuses);
            expect(earned).toBe(1700); // 1000 + 700
        });

        it('should calculate zero XP for no subscriptions', () => {
            const statuses: SubscriptionStatus[] = [
                {
                    channelKey: 'hamaki',
                    channelId: 'id1',
                    channelName: 'HamaKi',
                    isSubscribed: false,
                    xpReward: 1000,
                    xpAwarded: false,
                    lastChecked: 0,
                },
                {
                    channelKey: 'miro',
                    channelId: 'id2',
                    channelName: 'Miro',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
                {
                    channelKey: 'bastos',
                    channelId: 'id3',
                    channelName: 'Bastos',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
                {
                    channelKey: 'koro',
                    channelId: 'id4',
                    channelName: 'Koro',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
            ];

            const earned = getEarnedSubscriptionXP(statuses);
            expect(earned).toBe(0);
        });

        it('should only count xpAwarded channels', () => {
            const statuses: SubscriptionStatus[] = [
                {
                    channelKey: 'hamaki',
                    channelId: 'id1',
                    channelName: 'HamaKi',
                    isSubscribed: true, // Subscribed but...
                    xpReward: 1000,
                    xpAwarded: false, // ...not awarded yet (first-time check)
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'miro',
                    channelId: 'id2',
                    channelName: 'Miro',
                    isSubscribed: true,
                    xpReward: 700,
                    xpAwarded: true,
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'bastos',
                    channelId: 'id3',
                    channelName: 'Bastos',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
                {
                    channelKey: 'koro',
                    channelId: 'id4',
                    channelName: 'Koro',
                    isSubscribed: false,
                    xpReward: 700,
                    xpAwarded: false,
                    lastChecked: 0,
                },
            ];

            const earned = getEarnedSubscriptionXP(statuses);
            expect(earned).toBe(700); // Only miro
        });
    });

    describe('Leaderboard Integration', () => {
        it('should update leaderboard when XP is awarded', async () => {
            const mockUpdateLeaderboard = jest.fn().mockResolvedValue(undefined);
            (leaderboardService.updateLeaderboardPoints as jest.Mock) = mockUpdateLeaderboard;

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                        { channelKey: 'miro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'bastos', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'koro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1000,
                },
                error: null,
            });

            await verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false);

            expect(mockUpdateLeaderboard).toHaveBeenCalledWith('user-uuid', 1000);
        });

        it('should not update leaderboard when no XP awarded', async () => {
            const mockUpdateLeaderboard = jest.fn();
            (leaderboardService.updateLeaderboardPoints as jest.Mock) = mockUpdateLeaderboard;

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'miro', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'bastos', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'koro', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                error: null,
            });

            await verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false);

            expect(mockUpdateLeaderboard).not.toHaveBeenCalled();
        });

        it('should continue even if leaderboard update fails', async () => {
            const mockUpdateLeaderboard = jest.fn().mockRejectedValue(
                new Error('Leaderboard service unavailable')
            );
            (leaderboardService.updateLeaderboardPoints as jest.Mock) = mockUpdateLeaderboard;

            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                        { channelKey: 'miro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'bastos', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'koro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1000,
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            // Should still succeed even if leaderboard update failed
            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(1000);
        });
    });

    describe('Already Verified Handling', () => {
        it('should handle all channels already verified', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'miro', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'bastos', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'koro', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0);
            expect(result.statuses.every(s => s.xpAwarded)).toBe(true);
        });

        it('should handle mixed already verified and new subscriptions', async () => {
            (supabase.functions.invoke as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                        { channelKey: 'miro', subscribed: true, xpAwarded: 700, alreadyVerified: false },
                        { channelKey: 'bastos', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        { channelKey: 'koro', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 700,
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(700);
            expect(result.statuses.filter(s => s.xpAwarded).length).toBe(3); // hamaki, miro, koro
        });
    });

    describe('Concurrent Request Handling', () => {
        it('should handle multiple simultaneous verification requests', async () => {
            let callCount = 0;
            (supabase.functions.invoke as jest.Mock).mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    data: {
                        success: true,
                        results: [
                            { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                            { channelKey: 'miro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                            { channelKey: 'bastos', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                            { channelKey: 'koro', subscribed: false, xpAwarded: 0, alreadyVerified: false },
                        ],
                        totalXPAwarded: 1000,
                    },
                    error: null,
                });
            });

            // Simulate two simultaneous calls
            const [result1, result2] = await Promise.all([
                verifyAndAwardSubscriptionXP('token1', 'user-uuid', 'google-id', false),
                verifyAndAwardSubscriptionXP('token2', 'user-uuid', 'google-id', false),
            ]);

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(callCount).toBe(2); // Both should execute
        });
    });
});

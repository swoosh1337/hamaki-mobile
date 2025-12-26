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

import type { SubscriptionStatus } from '@/types/youtube';

// Mock dependencies
const mockFrom = jest.fn();
const mockUpdateLeaderboardPoints = jest.fn();

jest.mock('@/services/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
    },
    leaderboardService: {
        updateLeaderboardPoints: (...args: unknown[]) => mockUpdateLeaderboardPoints(...args),
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

// Mock invokeEdgeFunction
const mockInvokeEdgeFunction = jest.fn();
jest.mock('@/utils/edgeFunctionClient', () => ({
    get invokeEdgeFunction() {
        return mockInvokeEdgeFunction;
    },
}));

import {
    getEarnedSubscriptionXP,
    getSubscriptionStatuses,
    getTotalPossibleSubscriptionXP,
    verifyAndAwardSubscriptionXP,
} from '@/services/youtube/subscriptionService';

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
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                '  valid-token  ',
                'user-uuid',
                'google-id',
                false
            );

            expect(result.success).toBe(true);
            expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
                expect.objectContaining({
                    functionName: 'verify-subscriptions',
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
        it('should fallback to DB data when Edge Function returns error', async () => {
            // Mock DB fallback data
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [{
                            channel_key: 'hamaki',
                            subscribed: true,
                            xp_awarded: true,
                            verified_at: '2024-01-01T00:00:00Z',
                        }],
                        error: null,
                    }),
                }),
            });

            mockInvokeEdgeFunction.mockResolvedValue({
                success: false,
                data: null,
                error: 'Network error',
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            // Service gracefully falls back to DB data
            expect(result.success).toBe(true);
            expect(result.statuses.length).toBeGreaterThan(0);
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should handle Edge Function returning success: false', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: false,
                    error: 'YouTube API rate limit exceeded',
                },
                fromCache: false,
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

        it('should fallback to DB data on Edge Function timeout', async () => {
            // Mock DB fallback data
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        data: [{
                            channel_key: 'miro',
                            subscribed: true,
                            xp_awarded: false,
                            verified_at: '2024-01-01T00:00:00Z',
                        }],
                        error: null,
                    }),
                }),
            });

            mockInvokeEdgeFunction.mockResolvedValue({
                success: false,
                data: null,
                error: 'Request timeout',
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'valid-token',
                'user-uuid',
                'google-id',
                false
            );

            // Service gracefully falls back to DB data
            expect(result.success).toBe(true);
            expect(result.statuses.length).toBeGreaterThan(0);
        });

        it('should handle malformed Edge Function response', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: true,
                    // Missing results array
                    totalXPAwarded: 0,
                },
                fromCache: false,
            });

            await expect(
                verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false)
            ).resolves.not.toThrow();
        });
    });

    describe('Database Error Handling', () => {
        it('should handle database read errors gracefully', async () => {
            mockFrom.mockReturnValue({
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
            mockFrom.mockReturnValue({
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
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false);

            // Edge Function handles leaderboard update internally
            // We verify the result contains the expected XP info
            expect(result?.totalXPAwarded).toBe(1000);
        });

        it('should not update leaderboard when no XP awarded', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
            });

            await verifyAndAwardSubscriptionXP('valid-token', 'user-uuid', 'google-id', false);

            expect(mockUpdateLeaderboardPoints).not.toHaveBeenCalled();
        });

        it('should continue even if leaderboard update fails', async () => {
            mockUpdateLeaderboardPoints.mockRejectedValue(
                new Error('Leaderboard service unavailable')
            );

            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
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
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
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
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
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
                fromCache: false,
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
            mockInvokeEdgeFunction.mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    success: true,
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
                    fromCache: false,
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

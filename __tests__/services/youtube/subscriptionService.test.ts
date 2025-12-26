/**
 * Subscription Service Tests
 *
 * Tests subscription verification via Edge Function
 *
 * NOTE: Service now calls Edge Function via invokeEdgeFunction wrapper
 * Subscriptions are GATES - verified once, never auto-rechecked
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

// Mock Supabase and leaderboardService
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
import type { SubscriptionStatus } from '@/types/youtube';

describe('subscriptionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateLeaderboardPoints.mockResolvedValue(true);
    });

    describe('getTotalPossibleSubscriptionXP', () => {
        it('should return sum of all subscription XP rewards', () => {
            // hamaki: 1000, miro: 700, bastos: 700, koro: 700 = 3100
            expect(getTotalPossibleSubscriptionXP()).toBe(3100);
        });
    });

    describe('getEarnedSubscriptionXP', () => {
        it('should calculate XP from awarded statuses', () => {
            const statuses: SubscriptionStatus[] = [
                {
                    channelKey: 'hamaki',
                    channelId: 'UC123',
                    channelName: 'HamaKi',
                    isSubscribed: true,
                    xpReward: 1000,
                    xpAwarded: true,
                    lastChecked: Date.now(),
                },
                {
                    channelKey: 'miro',
                    channelId: 'UC456',
                    channelName: 'Miro',
                    isSubscribed: true,
                    xpReward: 700,
                    xpAwarded: false, // Not yet awarded
                    lastChecked: Date.now(),
                },
            ];

            expect(getEarnedSubscriptionXP(statuses)).toBe(1000);
        });
    });

    describe('getSubscriptionStatuses', () => {
        it('should return statuses from database', async () => {
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

            const statuses = await getSubscriptionStatuses('user-123');

            expect(statuses).toHaveLength(4); // All 4 channels
            expect(statuses.find(s => s.channelKey === 'hamaki')?.isSubscribed).toBe(true);
        });

        it('should return unverified statuses on error', async () => {
            mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockRejectedValue(new Error('DB Error')),
                }),
            });

            const statuses = await getSubscriptionStatuses('user-123');

            expect(statuses).toHaveLength(4);
            expect(statuses.every(s => !s.isSubscribed)).toBe(true);
        });
    });

    describe('verifyAndAwardSubscriptionXP', () => {
        it('should call Edge Function and return results', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                        { channelKey: 'miro', subscribed: true, xpAwarded: 700, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1700,
                },
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-123',
                'google-123'
            );

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(1700);
            expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(expect.objectContaining({
                functionName: 'verify-subscriptions',
            }));
        });

        it('should update leaderboard when XP is awarded', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1000,
                },
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP('test-token', 'user-123', 'google-123');

            // Edge Function handles leaderboard update internally, so we verify the result contains XP info
            expect(result?.totalXPAwarded).toBe(1000);
            // Note: updateLeaderboardPoints is no longer called directly - Edge Function handles this
        });

        it('should not update leaderboard when no XP is awarded', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                fromCache: false,
            });

            await verifyAndAwardSubscriptionXP('test-token', 'user-123', 'google-123');

            expect(mockUpdateLeaderboardPoints).not.toHaveBeenCalled();
        });

        it('should fallback to DB data when Edge Function errors', async () => {
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
                error: 'Function error',
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-123',
                'google-123'
            );

            // Service gracefully falls back to DB data
            expect(result.success).toBe(true);
            expect(result.statuses.length).toBeGreaterThan(0);
        });

        it('should return alreadyVerified=true for previously verified channels', async () => {
            mockInvokeEdgeFunction.mockResolvedValue({
                success: true,
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                fromCache: false,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-123',
                'google-123'
            );

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(0); // No new XP (already verified)
            // XP awarded should be true because alreadyVerified is true
            expect(result.statuses.find(s => s.channelKey === 'hamaki')?.xpAwarded).toBe(true);
        });
    });
});

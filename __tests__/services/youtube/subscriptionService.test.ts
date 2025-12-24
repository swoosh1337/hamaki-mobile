/**
 * Subscription Service Tests
 *
 * Tests subscription verification via Edge Function
 * 
 * NOTE: Service now calls Edge Function, not YouTube API directly
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
        from: (...args: any[]) => mockFrom(...args),
        functions: {
            invoke: jest.fn(),
        },
    },
    leaderboardService: {
        updateLeaderboardPoints: (...args: any[]) => mockUpdateLeaderboardPoints(...args),
    },
}));

import { supabase } from '@/services/supabase';
import {
    getEarnedSubscriptionXP,
    getSubscriptionStatuses,
    getTotalPossibleSubscriptionXP,
    verifyAndAwardSubscriptionXP,
} from '@/services/youtube/subscriptionService';
import type { SubscriptionStatus } from '@/types/youtube';

const mockInvoke = supabase.functions.invoke as jest.Mock;

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
            mockInvoke.mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                        { channelKey: 'miro', subscribed: true, xpAwarded: 700, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1700,
                },
                error: null,
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-123',
                'google-123'
            );

            expect(result.success).toBe(true);
            expect(result.totalXPAwarded).toBe(1700);
            expect(mockInvoke).toHaveBeenCalledWith('verify-subscriptions', expect.any(Object));
        });

        it('should update leaderboard when XP is awarded', async () => {
            mockInvoke.mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 1000, alreadyVerified: false },
                    ],
                    totalXPAwarded: 1000,
                },
                error: null,
            });

            await verifyAndAwardSubscriptionXP('test-token', 'user-123', 'google-123');

            expect(mockUpdateLeaderboardPoints).toHaveBeenCalledWith('user-123', 1000);
        });

        it('should not update leaderboard when no XP is awarded', async () => {
            mockInvoke.mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                error: null,
            });

            await verifyAndAwardSubscriptionXP('test-token', 'user-123', 'google-123');

            expect(mockUpdateLeaderboardPoints).not.toHaveBeenCalled();
        });

        it('should handle Edge Function errors', async () => {
            mockInvoke.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-123',
                'google-123'
            );

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Function error');
        });

        it('should return alreadyVerified=true for previously verified channels', async () => {
            mockInvoke.mockResolvedValue({
                data: {
                    success: true,
                    results: [
                        { channelKey: 'hamaki', subscribed: true, xpAwarded: 0, alreadyVerified: true },
                    ],
                    totalXPAwarded: 0,
                },
                error: null,
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

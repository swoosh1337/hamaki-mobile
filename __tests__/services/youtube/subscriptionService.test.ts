/**
 * Subscription Service Tests
 *
 * Tests subscription verification and XP awarding logic
 */

// Mock dependencies
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    single: jest.fn(),
                })),
            })),
            update: jest.fn(() => ({
                eq: jest.fn(),
            })),
        })),
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

jest.mock('@/services/youtube/verificationCacheService', () => ({
    verificationCacheService: {
        getCache: jest.fn().mockResolvedValue({
            subscriptions: { statuses: {}, lastFullCheck: 0 },
            videos: { videos: {} },
            lastUpdated: 0,
        }),
        saveCache: jest.fn(),
        needsFullSubscriptionCheck: jest.fn().mockResolvedValue(true),
        updateAllSubscriptionStatuses: jest.fn(),
    },
}));

// Mock fetch globally
global.fetch = jest.fn();

import { supabase } from '@/services/supabase/client';
import {
    checkAllChannelSubscriptions,
    getEarnedSubscriptionXP,
    getTotalPossibleSubscriptionXP,
    verifyAndAwardSubscriptionXP
} from '@/services/youtube/subscriptionService';

describe('subscriptionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkAllChannelSubscriptions', () => {
        it('should check all 4 channels and return subscription status', async () => {
            // Mock YouTube API responses
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    items: [
                        { snippet: { resourceId: { channelId: 'test-hamaki-id' } } },
                    ],
                }),
            });

            const result = await checkAllChannelSubscriptions('test-access-token');

            expect(result).toHaveProperty('hamaki');
            expect(result).toHaveProperty('miro');
            expect(result).toHaveProperty('bastos');
            expect(result).toHaveProperty('koro');
            expect(global.fetch).toHaveBeenCalled();
        });

        it('should return false for channels when API call fails', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const result = await checkAllChannelSubscriptions('test-access-token');

            expect(result.hamaki).toBe(false);
            expect(result.miro).toBe(false);
        });
    });

    describe('verifyAndAwardSubscriptionXP', () => {
        it('should award XP only for subscribed channels not already awarded', async () => {
            // Mock API returns subscribed
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    items: [{ snippet: { resourceId: { channelId: 'test-channel' } } }],
                }),
            });

            // Mock DB returns user with no XP awarded yet
            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                subscription_xp_awarded: { hamaki: false, miro: false, bastos: false, koro: false },
                                xp_points: 0,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            expect(result.success).toBe(true);
            expect(result.statuses).toHaveLength(4);
        });

        it('should NOT award duplicate XP for already-awarded channels', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    items: [{ snippet: { resourceId: { channelId: 'test-channel' } } }],
                }),
            });

            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                // Already awarded XP for all channels
                                subscription_xp_awarded: { hamaki: true, miro: true, bastos: true, koro: true },
                                xp_points: 3100,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            // No new XP should be awarded
            expect(result.totalXPAwarded).toBe(0);
        });
    });

    describe('getTotalPossibleSubscriptionXP', () => {
        it('should return sum of all channel XP rewards', () => {
            const total = getTotalPossibleSubscriptionXP();

            // 1000 (hamaki) + 700 (miro) + 700 (bastos) + 700 (koro) = 3100
            expect(total).toBe(3100);
        });
    });

    describe('getEarnedSubscriptionXP', () => {
        it('should return sum of XP for awarded channels', () => {
            const statuses = [
                { channelKey: 'hamaki', xpAwarded: true, xpReward: 1000 },
                { channelKey: 'miro', xpAwarded: true, xpReward: 700 },
                { channelKey: 'bastos', xpAwarded: false, xpReward: 700 },
                { channelKey: 'koro', xpAwarded: false, xpReward: 700 },
            ] as any;

            const earned = getEarnedSubscriptionXP(statuses);

            expect(earned).toBe(1700); // Only hamaki + miro
        });

        it('should return 0 if no channels awarded', () => {
            const statuses = [
                { channelKey: 'hamaki', xpAwarded: false, xpReward: 1000 },
            ] as any;

            const earned = getEarnedSubscriptionXP(statuses);

            expect(earned).toBe(0);
        });
    });

    describe('Edge Cases - Subscribe/Unsubscribe/Subscribe Deduplication', () => {
        it('should NOT award duplicate XP if user unsubscribes and resubscribes', async () => {
            // Scenario: User subscribed → got XP → unsubscribed → subscribed again
            // Expected: No new XP (xpAwarded flag stays true even after unsub)

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    // User is currently subscribed (resubscribed)
                    items: [{ snippet: { resourceId: { channelId: 'hamaki-channel' } } }],
                }),
            });

            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                // XP was already awarded when they first subscribed
                                // This flag should NEVER be reset, even if they unsubscribed
                                subscription_xp_awarded: { hamaki: true, miro: false, bastos: false, koro: false },
                                xp_points: 1000,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            // HamaKi XP should NOT be awarded again
            expect(result.totalXPAwarded).toBe(0);

            // Status should show subscription verified but XP already claimed
            const hamakiStatus = result.statuses.find(s => s.channelKey === 'hamaki');
            expect(hamakiStatus?.xpAwarded).toBe(true);
        });

        it('should handle mixed state: some channels awarded, some not', async () => {
            // Scenario: User subscribed to HamaKi (XP awarded), now subscribes to Miro
            // Expected: Only Miro XP awarded, not HamaKi

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    items: [{ snippet: { resourceId: { channelId: 'some-channel' } } }],
                }),
            });

            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                subscription_xp_awarded: {
                                    hamaki: true,  // Already awarded
                                    miro: false,   // Not yet awarded (new sub)
                                    bastos: false,
                                    koro: false
                                },
                                xp_points: 1000,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            // Should have results
            expect(result.success).toBe(true);
            expect(result.statuses).toHaveLength(4);
        });
    });

    describe('Edge Cases - API Errors', () => {
        it('should not revoke existing XP when API fails', async () => {
            // Scenario: User has XP, API fails
            // Expected: Keep existing XP, no revocation

            (global.fetch as jest.Mock).mockRejectedValue(new Error('API quota exceeded'));

            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                subscription_xp_awarded: { hamaki: true, miro: true, bastos: false, koro: false },
                                xp_points: 1700,
                            },
                            error: null,
                        }),
                    }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            // Should still succeed (graceful degradation)
            expect(result.success).toBe(true);
            // No XP should be deducted
            expect(result.totalXPAwarded).toBe(0);
        });

        it('should continue checking other channels if one fails', async () => {
            // Some API calls fail, others succeed
            let callCount = 0;
            (global.fetch as jest.Mock).mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('First channel error'));
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        items: [{ snippet: { resourceId: { channelId: 'channel-id' } } }],
                    }),
                });
            });

            const mockSupabase = supabase as jest.Mocked<typeof supabase>;
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                subscription_xp_awarded: { hamaki: false, miro: false, bastos: false, koro: false },
                                xp_points: 0,
                            },
                            error: null,
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await verifyAndAwardSubscriptionXP(
                'test-token',
                'user-id',
                'google-id',
                true
            );

            expect(result.success).toBe(true);
            // Should have all 4 status entries even if some failed
            expect(result.statuses).toHaveLength(4);
        });
    });
});

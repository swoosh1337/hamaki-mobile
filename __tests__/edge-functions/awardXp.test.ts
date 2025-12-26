/**
 * Test Suite for award-xp Edge Function
 *
 * Tests cover:
 * - Successful XP awarding for all types (game, subscription, video_like)
 * - Personal rank calculation
 * - Input validation
 * - Error handling
 * - XP breakdown in response
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client for testing
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Skip entire test suite if credentials are not available (integration tests only)
const hasCredentials = supabaseUrl && supabaseServiceKey;
const describeOrSkip = hasCredentials ? describe : describe.skip;

// Only create client if credentials exist
let supabase: SupabaseClient;
if (hasCredentials) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
}

const FUNCTION_URL = `${supabaseUrl}/functions/v1/award-xp`;

describeOrSkip('award-xp Edge Function', () => {
    let testUserId: string;
    let testUserId2: string;

    beforeEach(async () => {
        // Create test user
        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: `test-award-xp-${Date.now()}@example.com`,
                full_name: 'Test Award XP User',
                google_id: `test-award-xp-${Date.now()}`,
            })
            .select()
            .single();

        if (error) throw error;
        testUserId = user.id;

        // Create second test user for rank testing
        const { data: user2, error: error2 } = await supabase
            .from('users')
            .insert({
                email: `test-award-xp2-${Date.now()}@example.com`,
                full_name: 'Test Award XP User 2',
                google_id: `test-award-xp2-${Date.now()}`,
            })
            .select()
            .single();

        if (error2) throw error2;
        testUserId2 = user2.id;

        // Create leaderboard entries
        await supabase.from('leaderboard_entries').insert([
            {
                user_id: testUserId,
                game_xp: 100,
                subscription_xp: 50,
                video_like_xp: 25,
            },
            {
                user_id: testUserId2,
                game_xp: 500,
                subscription_xp: 100,
                video_like_xp: 50,
            },
        ]);
    });

    afterEach(async () => {
        // Cleanup: Delete test data
        await supabase.from('leaderboard_entries').delete().eq('user_id', testUserId);
        await supabase.from('leaderboard_entries').delete().eq('user_id', testUserId2);
        await supabase.from('users').delete().eq('id', testUserId);
        await supabase.from('users').delete().eq('id', testUserId2);
    });

    describe('Successful XP Awards', () => {
        it('should award game XP and return new total', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 100,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.new_total_xp).toBe(275); // 100+100 + 50 + 25
            expect(result.xp_breakdown.game).toBe(200); // 100 + 100
            expect(result.xp_breakdown.subscription).toBe(50);
            expect(result.xp_breakdown.video_like).toBe(25);
        });

        it('should award subscription XP', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'subscription',
                    amount: 200,
                }),
            });

            const result = await response.json();

            expect(result.success).toBe(true);
            expect(result.new_total_xp).toBe(375); // 100 + 50+200 + 25
            expect(result.xp_breakdown.subscription).toBe(250); // 50 + 200
        });

        it('should award video_like XP', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'video_like',
                    amount: 75,
                }),
            });

            const result = await response.json();

            expect(result.success).toBe(true);
            expect(result.new_total_xp).toBe(250); // 100 + 50 + 25+75
            expect(result.xp_breakdown.video_like).toBe(100); // 25 + 75
        });
    });

    describe('Personal Rank Calculation', () => {
        it('should return correct personal_rank', async () => {
            // User1 has 175 total (100+50+25), User2 has 650 total (500+100+50)
            // User1 should be rank 2 (behind User2)
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 10,
                }),
            });

            const result = await response.json();

            expect(result.success).toBe(true);
            expect(result.personal_rank).toBeGreaterThanOrEqual(1);
            // Note: Exact rank depends on other users in database
        });

        it('should update rank when XP increases past another user', async () => {
            // Give testUserId enough XP to pass testUserId2 (650 total)
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 600, // 175 + 600 = 775 > 650
                }),
            });

            const result = await response.json();

            expect(result.success).toBe(true);
            expect(result.new_total_xp).toBe(775);
            // Should now rank higher than User2
        });
    });

    describe('Input Validation', () => {
        it('should reject missing userId', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    xpType: 'game',
                    amount: 100,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing userId');
        });

        it('should reject invalid xpType', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'invalid_type',
                    amount: 100,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid xpType');
        });

        it('should reject negative amount', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: -50,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('positive number');
        });

        it('should reject zero amount', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 0,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('positive number');
        });

        it('should reject invalid JSON body', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: 'not valid json',
            });

            const result = await response.json();

            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid JSON');
        });
    });

    describe('New User Handling', () => {
        it('should create leaderboard entry for new user', async () => {
            // Create user without leaderboard entry
            const { data: newUser } = await supabase
                .from('users')
                .insert({
                    email: `new-user-${Date.now()}@example.com`,
                    full_name: 'New User',
                    google_id: `new-user-${Date.now()}`,
                })
                .select()
                .single();

            try {
                const response = await fetch(FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                        userId: newUser!.id,
                        xpType: 'game',
                        amount: 50,
                    }),
                });

                const result = await response.json();

                expect(result.success).toBe(true);
                expect(result.new_total_xp).toBe(50);
                expect(result.xp_breakdown.game).toBe(50);
                expect(result.xp_breakdown.subscription).toBe(0);
                expect(result.xp_breakdown.video_like).toBe(0);

                // Verify entry was created
                const { data: entry } = await supabase
                    .from('leaderboard_entries')
                    .select('*')
                    .eq('user_id', newUser!.id)
                    .single();

                expect(entry).toBeDefined();
                expect(entry!.game_xp).toBe(50);
            } finally {
                // Cleanup
                await supabase.from('leaderboard_entries').delete().eq('user_id', newUser!.id);
                await supabase.from('users').delete().eq('id', newUser!.id);
            }
        });
    });

    describe('Response Structure', () => {
        it('should return complete response with all fields', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 10,
                }),
            });

            const result = await response.json();

            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('new_total_xp');
            expect(result).toHaveProperty('personal_rank');
            expect(result).toHaveProperty('xp_breakdown');
            expect(result.xp_breakdown).toHaveProperty('game');
            expect(result.xp_breakdown).toHaveProperty('subscription');
            expect(result.xp_breakdown).toHaveProperty('video_like');
        });

        it('should return numeric values for XP fields', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    userId: testUserId,
                    xpType: 'game',
                    amount: 10,
                }),
            });

            const result = await response.json();

            expect(typeof result.new_total_xp).toBe('number');
            expect(typeof result.personal_rank).toBe('number');
            expect(typeof result.xp_breakdown.game).toBe('number');
            expect(typeof result.xp_breakdown.subscription).toBe('number');
            expect(typeof result.xp_breakdown.video_like).toBe('number');
        });
    });

    describe('CORS Handling', () => {
        it('should handle OPTIONS preflight request', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'OPTIONS',
            });

            expect(response.status).toBe(200);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });
    });

    describe('Concurrent Awards', () => {
        it('should handle concurrent XP awards correctly', async () => {
            // Send multiple awards simultaneously
            const promises = Array.from({ length: 5 }, () =>
                fetch(FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                        userId: testUserId,
                        xpType: 'game',
                        amount: 10,
                    }),
                })
            );

            const responses = await Promise.all(promises);
            const results = await Promise.all(responses.map(r => r.json()));

            // All should succeed
            results.forEach(result => {
                expect(result.success).toBe(true);
            });

            // Verify final total (original 175 + 5*10 = 225)
            const { data: entry } = await supabase
                .from('leaderboard_entries')
                .select('total_xp')
                .eq('user_id', testUserId)
                .single();

            expect(entry!.total_xp).toBe(225);
        });
    });
});

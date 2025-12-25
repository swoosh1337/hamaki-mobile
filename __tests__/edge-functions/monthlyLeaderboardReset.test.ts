/**
 * Test Suite for Monthly Leaderboard Reset System
 * 
 * Tests cover:
 * - Export generation and CSV integrity
 * - Idempotency (duplicate prevention)
 * - XP source separation
 * - Reset logic
 * - Error handling
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

const FUNCTION_URL = `${supabaseUrl}/functions/v1/monthly-leaderboard-reset`;

describeOrSkip('Monthly Leaderboard Reset System', () => {
    let testUserId: string;
    const testPeriodKey = '2025-12';

    beforeEach(async () => {
        // Create test user
        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: `test-${Date.now()}@example.com`,
                full_name: 'Test User',
                google_id: `test-${Date.now()}`,
            })
            .select()
            .single();

        if (error) throw error;
        testUserId = user.id;

        // Create leaderboard entry with mixed XP
        await supabase.from('leaderboard_entries').insert({
            user_id: testUserId,
            game_xp: 1000,
            subscription_xp: 500,
            video_like_xp: 300,
        });
    });

    afterEach(async () => {
        // Cleanup: Delete test data
        await supabase.from('leaderboard_entries').delete().eq('user_id', testUserId);
        await supabase.from('users').delete().eq('id', testUserId);
        await supabase
            .from('leaderboard_exports')
            .delete()
            .eq('period_key', testPeriodKey);
    });

    describe('Export Generation', () => {
        it('should create CSV export with correct format', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.dry_run).toBe(true);
            expect(result.row_count).toBeGreaterThan(0);
            expect(result.checksum).toBeDefined();
            expect(result.preview).toBeInstanceOf(Array);
        });

        it('should include all required CSV columns', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result = await response.json();
            const previewEntry = result.preview[0];

            expect(previewEntry).toHaveProperty('rank');
            expect(previewEntry).toHaveProperty('user_id');
            expect(previewEntry).toHaveProperty('full_name');
            expect(previewEntry).toHaveProperty('game_xp');
            expect(previewEntry).toHaveProperty('subscription_xp');
            expect(previewEntry).toHaveProperty('video_like_xp');
            expect(previewEntry).toHaveProperty('total_xp');
        });

        it('should correctly calculate total_xp', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result = await response.json();
            const testEntry = result.preview.find((e: any) => e.user_id === testUserId);

            expect(testEntry.total_xp).toBe(1800); // 1000 + 500 + 300
            expect(testEntry.game_xp).toBe(1000);
            expect(testEntry.subscription_xp).toBe(500);
            expect(testEntry.video_like_xp).toBe(300);
        });
    });

    describe('Idempotency', () => {
        it('should prevent duplicate exports for the same period', async () => {
            // First export
            const response1 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            const result1 = await response1.json();
            expect(result1.success).toBe(true);

            // Second export (should be rejected)
            const response2 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            const result2 = await response2.json();
            expect(result2.success).toBe(true);
            expect(result2.message).toContain('already completed');
        });

        it('should create only one export record per period', async () => {
            // Run export
            await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            // Check database
            const { data: exports } = await supabase
                .from('leaderboard_exports')
                .select('*')
                .eq('period_key', testPeriodKey)
                .eq('period_type', 'monthly');

            expect(exports).toHaveLength(1);
            expect(exports![0].status).toBe('succeeded');
        });
    });

    describe('XP Reset Logic', () => {
        it('should reset only game_xp, not permanent XP', async () => {
            // Run reset
            await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            // Check leaderboard entry
            const { data: entry } = await supabase
                .from('leaderboard_entries')
                .select('*')
                .eq('user_id', testUserId)
                .single();

            expect(entry!.game_xp).toBe(0);              // Reset to 0
            expect(entry!.subscription_xp).toBe(500);     // Unchanged
            expect(entry!.video_like_xp).toBe(300);       // Unchanged
            expect(entry!.total_xp).toBe(800);            // 0 + 500 + 300
        });

        it('should update total_xp automatically after reset', async () => {
            // Before reset
            const { data: before } = await supabase
                .from('leaderboard_entries')
                .select('total_xp')
                .eq('user_id', testUserId)
                .single();

            expect(before!.total_xp).toBe(1800);

            // Run reset
            await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            // After reset
            const { data: after } = await supabase
                .from('leaderboard_entries')
                .select('total_xp')
                .eq('user_id', testUserId)
                .single();

            expect(after!.total_xp).toBe(800); // Auto-computed
        });
    });

    describe('Storage Integration', () => {
        it('should upload CSV to Supabase Storage', async () => {
            // Run export
            await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            // Check storage
            const { data: files } = await supabase.storage
                .from('leaderboard-exports')
                .list('monthly');

            const csvFile = files?.find((f) => f.name === `${testPeriodKey}.csv`);
            expect(csvFile).toBeDefined();
        });

        it('should store correct file_path in database', async () => {
            await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: false,
                }),
            });

            const { data: exportRecord } = await supabase
                .from('leaderboard_exports')
                .select('file_path')
                .eq('period_key', testPeriodKey)
                .single();

            expect(exportRecord!.file_path).toBe(
                `leaderboard-exports/monthly/${testPeriodKey}.csv`
            );
        });
    });

    describe('Error Handling', () => {
        it('should require period_key parameter', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    dry_run: true,
                }),
            });

            const result = await response.json();
            expect(response.status).toBe(400);
            expect(result.success).toBe(false);
            expect(result.error).toContain('period_key is required');
        });

        it('should validate period_key format', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: 'invalid-format',
                    dry_run: true,
                }),
            });

            const result = await response.json();
            expect(response.status).toBe(400);
            expect(result.error).toContain('Invalid period_key format');
        });
    });

    describe('Checksum Verification', () => {
        it('should generate consistent checksum for same data', async () => {
            const response1 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result1 = await response.json();
            const checksum1 = result1.checksum;

            const response2 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result2 = await response.json();
            const checksum2 = result2.checksum;

            expect(checksum1).toBe(checksum2);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty leaderboard gracefully', async () => {
            // Delete all entries
            await supabase.from('leaderboard_entries').delete().neq('user_id', '');

            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.message).toContain('No entries to export');
        });

        it('should handle users with zero XP', async () => {
            // Create user with all zeros
            const { data: zeroUser } = await supabase
                .from('users')
                .insert({
                    email: 'zero@test.com',
                    full_name: 'Zero User',
                    google_id: 'zero-123',
                })
                .select()
                .single();

            await supabase.from('leaderboard_entries').insert({
                user_id: zeroUser!.id,
                game_xp: 0,
                subscription_xp: 0,
                video_like_xp: 0,
            });

            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    period_key: testPeriodKey,
                    dry_run: true,
                }),
            });

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.row_count).toBeGreaterThan(0);

            // Cleanup
            await supabase.from('leaderboard_entries').delete().eq('user_id', zeroUser!.id);
            await supabase.from('users').delete().eq('id', zeroUser!.id);
        });
    });
});

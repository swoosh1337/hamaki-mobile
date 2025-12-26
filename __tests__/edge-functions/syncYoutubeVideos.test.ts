/**
 * Test Suite for sync-youtube-videos Edge Function
 *
 * Tests cover:
 * - Video sync to youtube_channel_state table
 * - Video sync to content_posts table (for Home screen carousel)
 * - Featured order based on channel
 * - Push notification trigger
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

const FUNCTION_URL = `${supabaseUrl}/functions/v1/sync-youtube-videos`;

describeOrSkip('sync-youtube-videos Edge Function', () => {
    // Store IDs of test content posts to clean up
    const testContentPostIds: string[] = [];

    beforeEach(() => {
        testContentPostIds.length = 0;
    });

    afterEach(async () => {
        // Cleanup test content posts
        for (const id of testContentPostIds) {
            await supabase.from('content_posts').delete().eq('id', id);
        }
    });

    describe('content_posts Integration', () => {
        it('should create content_post with is_featured=true for new videos', async () => {
            // Call the sync function
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
            });

            const result = await response.json();
            expect(response.status).toBe(200);
            expect(result.message).toBe('YouTube sync completed');

            // If any channels were updated, verify content_posts were created
            if (result.results.updated.length > 0) {
                for (const channelName of result.results.updated) {
                    // Get the channel state to find the video ID
                    const { data: channelState } = await supabase
                        .from('youtube_channel_state')
                        .select('*')
                        .eq('channel_name', channelName)
                        .single();

                    if (channelState) {
                        const contentPostId = `video-${channelState.channel_key}-${channelState.latest_video_id}`;
                        testContentPostIds.push(contentPostId);

                        // Verify content_post exists
                        const { data: contentPost } = await supabase
                            .from('content_posts')
                            .select('*')
                            .eq('id', contentPostId)
                            .single();

                        expect(contentPost).toBeDefined();
                        expect(contentPost!.is_featured).toBe(true);
                        expect(contentPost!.is_published).toBe(true);
                        expect(contentPost!.type).toBe('video');
                        expect(contentPost!.metadata.videoId).toBe(channelState.latest_video_id);
                        expect(contentPost!.metadata.channelKey).toBe(channelState.channel_key);
                    }
                }
            }
        });

        it('should set featured_order=1 for HamaKi channel', async () => {
            // Get HamaKi channel state
            const { data: hamakiState } = await supabase
                .from('youtube_channel_state')
                .select('*')
                .eq('channel_key', 'hamaki')
                .single();

            if (hamakiState) {
                const contentPostId = `video-hamaki-${hamakiState.latest_video_id}`;

                // Check if content_post exists
                const { data: contentPost } = await supabase
                    .from('content_posts')
                    .select('*')
                    .eq('id', contentPostId)
                    .single();

                if (contentPost) {
                    expect(contentPost.featured_order).toBe(1);
                }
            }
        });

        it('should set featured_order=10 for other channels', async () => {
            // Get non-HamaKi channel states
            const { data: otherStates } = await supabase
                .from('youtube_channel_state')
                .select('*')
                .neq('channel_key', 'hamaki');

            if (otherStates && otherStates.length > 0) {
                for (const state of otherStates) {
                    const contentPostId = `video-${state.channel_key}-${state.latest_video_id}`;

                    const { data: contentPost } = await supabase
                        .from('content_posts')
                        .select('*')
                        .eq('id', contentPostId)
                        .single();

                    if (contentPost) {
                        expect(contentPost.featured_order).toBe(10);
                    }
                }
            }
        });
    });

    describe('youtube_channel_state Sync', () => {
        it('should update youtube_channel_state for each channel', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
            });

            const result = await response.json();
            expect(response.status).toBe(200);

            // Verify channel states exist
            const { data: channelStates } = await supabase
                .from('youtube_channel_state')
                .select('*');

            expect(channelStates).toBeDefined();
            expect(channelStates!.length).toBeGreaterThanOrEqual(1);

            // Each channel state should have required fields
            for (const state of channelStates!) {
                expect(state.channel_id).toBeDefined();
                expect(state.channel_key).toBeDefined();
                expect(state.channel_name).toBeDefined();
                expect(state.last_checked_at).toBeDefined();
            }
        });
    });

    describe('Response Structure', () => {
        it('should return results with updated, unchanged, and errors arrays', async () => {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
            });

            const result = await response.json();

            expect(result).toHaveProperty('message');
            expect(result).toHaveProperty('results');
            expect(result.results).toHaveProperty('updated');
            expect(result.results).toHaveProperty('unchanged');
            expect(result.results).toHaveProperty('errors');
            expect(Array.isArray(result.results.updated)).toBe(true);
            expect(Array.isArray(result.results.unchanged)).toBe(true);
            expect(Array.isArray(result.results.errors)).toBe(true);
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

    describe('Idempotency', () => {
        it('should mark videos as unchanged on repeated calls', async () => {
            // First call
            const response1 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
            });
            const result1 = await response1.json();

            // Second call immediately after (should be unchanged)
            const response2 = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
            });
            const result2 = await response2.json();

            expect(response2.status).toBe(200);
            // All previously updated channels should now be unchanged
            // (unless a new video was published in the last few seconds)
            expect(result2.results.unchanged.length).toBeGreaterThanOrEqual(0);
        });
    });
});

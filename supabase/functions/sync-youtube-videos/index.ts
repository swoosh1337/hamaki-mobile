/**
 * sync-youtube-videos Edge Function
 *
 * Server-side function that syncs latest videos from YouTube channels.
 * Called by pg_cron every 4 hours.
 *
 * ✅ Single source of truth for video state
 * ✅ No client-side YouTube API calls needed
 * ✅ Idempotent - safe to run multiple times
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

// Channel configuration with keys matching the mobile app
const CHANNELS = [
    { id: 'UCSI5XbaxsX1USijrfFVuJqA', key: 'hamaki', name: 'HamaKi' },
    { id: 'UChJnB_7-JUYXEr-Fv3Y_rGA', key: 'miro', name: 'Miro' },
    { id: 'UCjSZIjLKfQHkdZbZMvYQhAw', key: 'bastos', name: 'Basto' },
    { id: 'UCPCQmO5MrP3S1oVu6p9bxRw', key: 'koro', name: 'Koro' },
];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HTML entity mappings for common entities from YouTube API
 */
const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
};

/**
 * Decodes HTML entities in a string
 * YouTube API returns HTML-encoded titles (e.g., &quot; for quotes)
 */
function decodeHtmlEntities(text: string | null | undefined): string {
    if (!text) return '';

    let decoded = text;

    // Replace named entities
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        decoded = decoded.replaceAll(entity, char);
    }

    // Handle numeric character references (&#123; or &#x7B;)
    decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 10));
    });

    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
    });

    return decoded;
}

interface YouTubeSearchItem {
    id: { videoId: string };
    snippet: {
        title: string;
        description: string;
        publishedAt: string;
        thumbnails: {
            high: { url: string };
        };
    };
}

/**
 * Fetch the latest video from a YouTube channel
 * Uses search.list endpoint (100 quota units per call)
 */
async function fetchLatestVideo(channelId: string) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('key', YOUTUBE_API_KEY);
    url.searchParams.set('channelId', channelId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('order', 'date');
    url.searchParams.set('maxResults', '1');
    url.searchParams.set('type', 'video');

    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`YouTube API error: ${res.status}`);
    }

    const json = await res.json();
    const item = json.items?.[0] as YouTubeSearchItem | undefined;
    if (!item) return null;

    return {
        videoId: item.id.videoId,
        title: decodeHtmlEntities(item.snippet.title),
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        publishedAt: item.snippet.publishedAt,
    };
}

Deno.serve(async (req: Request) => {
    console.log('[sync-youtube-videos] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    console.log('[sync-youtube-videos] Environment check:', {
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
        hasYoutubeApiKey: !!YOUTUBE_API_KEY,
        channelCount: CHANNELS.length,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results = {
        updated: [] as string[],
        unchanged: [] as string[],
        errors: [] as string[],
    };

    console.log('[sync-youtube-videos] Starting sync for', CHANNELS.length, 'channels...');

    for (const channel of CHANNELS) {
        try {
            const latest = await fetchLatestVideo(channel.id);
            if (!latest) {
                console.log(`[${channel.name}] No videos found`);
                continue;
            }

            // Check if video has changed
            const { data: existing } = await supabase
                .from('youtube_channel_state')
                .select('latest_video_id')
                .eq('channel_id', channel.id)
                .single();

            const videoUnchanged = existing?.latest_video_id === latest.videoId;

            if (videoUnchanged) {
                console.log(`[${channel.name}] Video unchanged, checking content_posts status...`);

                // Even if video unchanged, check if content_posts needs fixing
                const { data: existingPost } = await supabase
                    .from('content_posts')
                    .select('id, is_published, is_featured')
                    .eq('metadata->>videoId', latest.videoId)
                    .maybeSingle();

                if (existingPost && (!existingPost.is_published || !existingPost.is_featured)) {
                    console.log(`[${channel.name}] Fixing content post status for video ${latest.videoId}`);

                    // Un-feature other videos from this channel first
                    await supabase
                        .from('content_posts')
                        .update({ is_featured: false })
                        .eq('type', 'video')
                        .eq('metadata->>channelKey', channel.key)
                        .eq('is_featured', true)
                        .neq('id', existingPost.id);

                    // Fix the current video's status
                    const { error: fixError } = await supabase
                        .from('content_posts')
                        .update({ is_published: true, is_featured: true })
                        .eq('id', existingPost.id);

                    if (fixError) {
                        console.error(`[${channel.name}] Failed to fix content post:`, fixError);
                    } else {
                        console.log(`[${channel.name}] Fixed content post - now published and featured`);
                        results.updated.push(`${channel.name} (fixed)`);
                        continue;
                    }
                }

                results.unchanged.push(channel.name);
                continue;
            }

            // Upsert new video state (atomic operation)
            const { error } = await supabase
                .from('youtube_channel_state')
                .upsert({
                    channel_id: channel.id,
                    channel_key: channel.key, // Required by schema
                    channel_name: channel.name,
                    latest_video_id: latest.videoId,
                    latest_video_title: latest.title,
                    latest_video_thumbnail: latest.thumbnail,
                    latest_video_published_at: latest.publishedAt,
                    last_checked_at: new Date().toISOString(),
                });

            if (error) {
                throw error;
            }

            // Also upsert to content_posts for Home screen carousel
            // This ensures new videos appear in the featured section
            // First check if this video already exists (by metadata->videoId)
            const { data: existingPost } = await supabase
                .from('content_posts')
                .select('id')
                .eq('metadata->>videoId', latest.videoId)
                .maybeSingle();

            if (!existingPost) {
                // Un-feature old videos from this channel (keep only 1 per channel in carousel)
                const { error: unfeatError } = await supabase
                    .from('content_posts')
                    .update({ is_featured: false })
                    .eq('type', 'video')
                    .eq('metadata->>channelKey', channel.key)
                    .eq('is_featured', true);

                if (unfeatError) {
                    console.error(`[${channel.name}] Failed to un-feature old videos:`, unfeatError);
                } else {
                    console.log(`[${channel.name}] Un-featured old videos from this channel`);
                }

                // Insert new content post with auto-generated UUID
                const { error: contentError } = await supabase
                    .from('content_posts')
                    .insert({
                        type: 'video',
                        title: latest.title,
                        excerpt: `${channel.name}-ს ახალი ვიდეო`, // "New video from [channel]" in Georgian
                        content: latest.description || '',
                        thumbnail: latest.thumbnail,
                        is_published: true,
                        published_at: latest.publishedAt,
                        is_featured: true,  // Shows in carousel
                        featured_order: 100, // Auto-ranked (admin can set 1-99 to pin)
                        metadata: {
                            videoId: latest.videoId,
                            channelKey: channel.key,
                            channelName: channel.name,
                        },
                    });

                if (contentError) {
                    console.error(`[${channel.name}] Failed to insert content_posts:`, contentError);
                    // Don't fail the whole sync, just log the error
                } else {
                    console.log(`[${channel.name}] Content post created for video ${latest.videoId}`);
                }
            } else {
                // Fix existing post if it has wrong is_published or is_featured status
                const { data: postStatus } = await supabase
                    .from('content_posts')
                    .select('is_published, is_featured')
                    .eq('id', existingPost.id)
                    .single();

                if (postStatus && (!postStatus.is_published || !postStatus.is_featured)) {
                    console.log(`[${channel.name}] Fixing content post status for video ${latest.videoId}`);

                    // Un-feature other videos from this channel first
                    await supabase
                        .from('content_posts')
                        .update({ is_featured: false })
                        .eq('type', 'video')
                        .eq('metadata->>channelKey', channel.key)
                        .eq('is_featured', true)
                        .neq('id', existingPost.id);

                    // Fix the current video's status
                    const { error: fixError } = await supabase
                        .from('content_posts')
                        .update({ is_published: true, is_featured: true })
                        .eq('id', existingPost.id);

                    if (fixError) {
                        console.error(`[${channel.name}] Failed to fix content post:`, fixError);
                    } else {
                        console.log(`[${channel.name}] Fixed content post - now published and featured`);
                    }
                } else {
                    console.log(`[${channel.name}] Content post already exists and is correctly published`);
                }
            }

            console.log(`[${channel.name}] Updated → ${latest.title}`);
            results.updated.push(channel.name);

            // Send push notifications for new video (non-blocking)
            fetch(`${SUPABASE_URL}/functions/v1/send-new-video-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                    channelKey: channel.key,
                    channelName: channel.name,
                    videoId: latest.videoId,
                    videoTitle: latest.title,
                    thumbnail: latest.thumbnail,
                }),
            }).catch(err => {
                console.error(`[${channel.name}] Failed to trigger notifications:`, err);
            });
        } catch (err) {
            console.error(`[${channel.name}] Error:`, err);
            results.errors.push(channel.name);
        }
    }

    console.log('[sync-youtube-videos] Completed', results);

    return new Response(
        JSON.stringify({
            message: 'YouTube sync completed',
            results,
        }),
        {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            },
        }
    );
});

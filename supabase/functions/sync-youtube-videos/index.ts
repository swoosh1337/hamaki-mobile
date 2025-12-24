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
    { id: Deno.env.get('YOUTUBE_CHANNEL_ID')!, key: 'hamaki', name: 'HamaKi' },
    { id: 'UChJnB_7-JUYXEr-Fv3Y_rGA', key: 'miro', name: 'Miro' },
    { id: 'UCjSZIjLKfQHkdZbZMvYQhAw', key: 'bastos', name: 'Basto' },
    { id: 'UCPCQmO5MrP3S1oVu6p9bxRw', key: 'koro', name: 'Koro' },
];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        publishedAt: item.snippet.publishedAt,
    };
}

Deno.serve(async (req) => {
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

            if (existing?.latest_video_id === latest.videoId) {
                console.log(`[${channel.name}] Unchanged`);
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

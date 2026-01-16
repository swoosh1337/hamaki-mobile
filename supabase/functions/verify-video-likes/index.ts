/**
 * verify-video-likes Edge Function
 *
 * Verifies if user has liked specific YouTube videos and awards XP.
 * 
 * RULES:
 * ✅ Batch check videos.getRating (1 API call total)
 * ✅ XP awarded per video ID (once per video)
 * ✅ User-initiated only
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// XP rewards per channel for video likes
const CHANNEL_VIDEO_XP: Record<string, number> = {
    'hamaki': 200,
    'miro': 100,
    'bastos': 100,
    'koro': 100,
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoToVerify {
    videoId: string;
    channelKey: string;
}

interface VerificationResult {
    videoId: string;
    channelKey: string;
    liked: boolean;
    xpAwarded: number;
}

interface YouTubeRatingItem {
    videoId: string;
    rating: string;
}

/**
 * Batch check video ratings using YouTube API
 * Single API call for multiple videos (1 quota unit)
 */
async function checkVideoRatings(
    accessToken: string,
    videoIds: string[]
): Promise<Map<string, boolean>> {
    const ratings = new Map<string, boolean>();

    // Batch up to 50 videos per call
    const url = new URL('https://www.googleapis.com/youtube/v3/videos/getRating');
    url.searchParams.set('id', videoIds.join(','));

    const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('[verify-video-likes] YouTube API error:', error);
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    for (const item of (data.items || []) as YouTubeRatingItem[]) {
        ratings.set(item.videoId, item.rating === 'like');
    }

    return ratings;
}

Deno.serve(async (req: Request) => {
    console.log('[verify-video-likes] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Parse request body first to get access token (matching verify-subscriptions pattern)
        let body: { videos?: VideoToVerify[]; userId?: string; accessToken?: string };
        try {
            body = await req.json();
            console.log('[verify-video-likes] Request body:', {
                videoCount: body?.videos?.length,
                userId: body?.userId ? 'present' : 'missing',
                hasAccessToken: !!body?.accessToken,
                accessTokenLength: body?.accessToken?.length || 0,
            });
        } catch (parseError) {
            console.error('[verify-video-likes] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { videos, userId, accessToken } = body;

        if (!videos?.length || !userId) {
            console.error('[verify-video-likes] Missing required fields:', { videos: !!videos?.length, userId: !!userId });
            return new Response(
                JSON.stringify({ error: 'Missing videos or userId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate access token (from body, not header)
        if (!accessToken?.trim()) {
            console.error('[verify-video-likes] Missing or empty access token');
            return new Response(
                JSON.stringify({ error: 'Missing access token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[verify-video-likes] Access token validated:', {
            length: accessToken.trim().length,
            prefix: accessToken.trim().substring(0, 10),
        });

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const results: VerificationResult[] = [];
        let totalXPAwarded = 0;

        // Get user's existing awarded video likes + details for logging
        const { data: userData } = await supabase
            .from('users')
            .select('id, full_name, email, video_like_xp_awarded, xp_points')
            .eq('id', userId)
            .single();

        console.log('[verify-video-likes] ========================================');
        console.log('[verify-video-likes] User:', {
            id: userId,
            name: userData?.full_name || 'Unknown',
            email: userData?.email || 'Unknown',
        });
        console.log('[verify-video-likes] Videos to verify:', videos.length);
        console.log('[verify-video-likes] ========================================');

        const awardedLikes: Record<string, boolean> = userData?.video_like_xp_awarded || {};
        let currentXP = userData?.xp_points || 0;

        // Filter out already-awarded videos
        const videosToCheck = videos.filter(v => !awardedLikes[v.videoId]);

        if (videosToCheck.length === 0) {
            // All videos already awarded - return cached results
            console.log('[verify-video-likes] All videos already awarded');
            return new Response(
                JSON.stringify({
                    success: true,
                    results: videos.map(v => ({
                        videoId: v.videoId,
                        channelKey: v.channelKey,
                        liked: true,
                        xpAwarded: 0,
                    })),
                    totalXPAwarded: 0,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check video ratings via YouTube API (single batch call)
        console.log(`[verify-video-likes] Checking ${videosToCheck.length} videos`);
        const videoIds = videosToCheck.map(v => v.videoId);
        const ratings = await checkVideoRatings(accessToken, videoIds);

        // Process results
        const newAwardedLikes = { ...awardedLikes };

        for (const video of videos) {
            const isLiked = ratings.get(video.videoId) ?? false;
            const alreadyAwarded = awardedLikes[video.videoId] || false;
            let xpAmount = 0;

            if (isLiked && !alreadyAwarded) {
                xpAmount = CHANNEL_VIDEO_XP[video.channelKey] || 0;
                newAwardedLikes[video.videoId] = true;
                totalXPAwarded += xpAmount;
                console.log(`[${video.channelKey}] Video liked, awarding ${xpAmount} XP`);
            }

            results.push({
                videoId: video.videoId,
                channelKey: video.channelKey,
                liked: isLiked,
                xpAwarded: xpAmount,
            });
        }

        // Update user's XP and awarded likes
        if (totalXPAwarded > 0) {
            // Update users table
            await supabase
                .from('users')
                .update({
                    xp_points: currentXP + totalXPAwarded,
                    video_like_xp_awarded: newAwardedLikes,
                })
                .eq('id', userId);

            // Update leaderboard_entries.video_like_xp for BOTH monthly and weekly
            // Using the award_xp RPC function which handles both periods correctly
            const { error: awardError } = await supabase.rpc('award_xp', {
                p_user_id: userId,
                p_xp_type: 'video_like',
                p_amount: totalXPAwarded,
            });

            if (awardError) {
                console.error('[verify-video-likes] Failed to award XP via RPC:', awardError);
                // Fallback: try direct upsert for both periods
                for (const periodType of ['monthly', 'weekly']) {
                    const { data: existing } = await supabase
                        .from('leaderboard_entries')
                        .select('video_like_xp, game_xp, subscription_xp')
                        .eq('user_id', userId)
                        .eq('period_type', periodType)
                        .maybeSingle();

                    const existingVideoXP = existing?.video_like_xp || 0;
                    const existingGameXP = existing?.game_xp || 0;
                    const existingSubscriptionXP = existing?.subscription_xp || 0;

                    await supabase
                        .from('leaderboard_entries')
                        .upsert({
                            user_id: userId,
                            period_type: periodType,
                            video_like_xp: existingVideoXP + totalXPAwarded,
                            game_xp: existingGameXP,
                            subscription_xp: existingSubscriptionXP,
                        }, {
                            onConflict: 'user_id,period_type'
                        });
                }
            }

            console.log(`[verify-video-likes] Awarded ${totalXPAwarded} video_like XP via RPC`);
        }

        console.log(`[verify-video-likes] Complete. Total XP: ${totalXPAwarded}`);

        return new Response(
            JSON.stringify({
                success: true,
                results,
                totalXPAwarded,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[verify-video-likes] Error:', errorMessage);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

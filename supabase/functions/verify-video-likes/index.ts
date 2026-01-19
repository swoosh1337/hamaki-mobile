/**
 * verify-video-likes Edge Function
 *
 * Verifies if user has liked specific YouTube videos and awards XP.
 *
 * RULES:
 * ✅ Batch check videos.getRating (1 API call total)
 * ✅ XP awarded per video ID (once per video)
 * ✅ User-initiated only
 * ✅ AUTH REQUIRED: User must be authenticated and can only verify their own likes
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

        // Check for quota exhaustion (403 with specific reason)
        const errorReason = error?.error?.errors?.[0]?.reason;
        const isQuotaError = response.status === 403 && (
            errorReason === 'quotaExceeded' ||
            errorReason === 'dailyLimitExceeded' ||
            errorReason === 'rateLimitExceeded' ||
            error?.error?.message?.toLowerCase()?.includes('quota')
        );

        if (isQuotaError) {
            console.error('[verify-video-likes] YouTube quota exhausted!');
            throw new Error('YOUTUBE_QUOTA_EXHAUSTED');
        }

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
        // ========================================
        // STEP 1: Parse request body first
        // ========================================
        let body: { videos?: VideoToVerify[]; accessToken?: string };
        try {
            body = await req.json();
            console.log('[verify-video-likes] Request body:', {
                videoCount: body?.videos?.length,
                hasAccessToken: !!body?.accessToken,
                accessTokenLength: body?.accessToken?.length || 0,
            });
        } catch (parseError) {
            console.error('[verify-video-likes] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { videos, accessToken } = body;

        if (!videos?.length) {
            console.error('[verify-video-likes] Missing videos');
            return new Response(
                JSON.stringify({ success: false, error: 'Missing videos' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate YouTube access token (required for YouTube API calls)
        if (!accessToken?.trim()) {
            console.error('[verify-video-likes] Missing or empty YouTube access token');
            return new Response(
                JSON.stringify({ success: false, error: 'Missing YouTube access token' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Service role client for database operations
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ========================================
        // STEP 2: Verify User Identity
        // ========================================
        // Support two auth methods:
        // 1. Magic Link users: Have Supabase JWT in Authorization header
        // 2. Google OAuth users: Have YouTube access token (can verify via Google API)
        let userId: string;
        let authMethod: 'supabase_jwt' | 'youtube_token' = 'youtube_token';

        const authHeader = req.headers.get('Authorization');

        // Try Supabase JWT first (Magic Link users)
        if (authHeader?.startsWith('Bearer ')) {
            const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { persistSession: false }
            });

            const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(
                authHeader.replace('Bearer ', '')
            );

            if (!authError && authUser) {
                userId = authUser.id;
                authMethod = 'supabase_jwt';
                console.log('[verify-video-likes] Auth via Supabase JWT:', userId);
            }
        }

        // Fallback: Use YouTube token to verify identity (Google OAuth users)
        // The YouTube token proves ownership of the Google account
        if (!userId) {
            // Get Google user info using the YouTube access token
            const googleResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!googleResponse.ok) {
                console.error('[verify-video-likes] Failed to verify Google identity');
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid YouTube access token' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const googleUser = await googleResponse.json();
            if (!googleUser.id) {
                console.error('[verify-video-likes] No Google ID in response');
                return new Response(
                    JSON.stringify({ success: false, error: 'Could not verify user identity' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Look up user by Google ID in our database
            const { data: dbUser, error: dbError } = await supabase
                .from('users')
                .select('id')
                .eq('google_id', googleUser.id)
                .single();

            if (dbError || !dbUser) {
                console.error('[verify-video-likes] User not found for Google ID:', googleUser.id);
                return new Response(
                    JSON.stringify({ success: false, error: 'User not found' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            userId = dbUser.id;
            console.log('[verify-video-likes] Auth via YouTube token, Google ID:', googleUser.id, '-> User:', userId);
        }

        console.log('[verify-video-likes] User verified:', { userId, authMethod });
        console.log('[verify-video-likes] YouTube access token validated:', {
            length: accessToken.trim().length,
            prefix: accessToken.trim().substring(0, 10),
        });

        const results: VerificationResult[] = [];
        let totalXPAwarded = 0;

        // Get user details for logging
        const { data: userData } = await supabase
            .from('users')
            .select('id, full_name, email, xp_points')
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

        let currentXP = userData?.xp_points || 0;

        // Get already-awarded video likes from tracking table (prevents double-award)
        const videoIds = videos.map(v => v.videoId);
        const { data: existingAwards } = await supabase
            .from('user_video_like_awards')
            .select('video_id')
            .eq('user_id', userId)
            .in('video_id', videoIds);

        const awardedVideoIds = new Set((existingAwards || []).map(a => a.video_id));
        console.log('[verify-video-likes] Already awarded videos:', awardedVideoIds.size);

        // Filter out already-awarded videos
        const videosToCheck = videos.filter(v => !awardedVideoIds.has(v.videoId));

        if (videosToCheck.length === 0) {
            // All videos already awarded - return cached results with alreadyAwarded flag
            console.log('[verify-video-likes] All videos already awarded');
            return new Response(
                JSON.stringify({
                    success: true,
                    results: videos.map(v => ({
                        videoId: v.videoId,
                        channelKey: v.channelKey,
                        liked: true,
                        xpAwarded: 0,
                        alreadyAwarded: true,  // Client needs this to know XP was previously awarded
                    })),
                    totalXPAwarded: 0,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check video ratings via YouTube API (single batch call)
        console.log(`[verify-video-likes] Checking ${videosToCheck.length} videos`);
        const videoIdsToCheck = videosToCheck.map(v => v.videoId);
        const ratings = await checkVideoRatings(accessToken, videoIdsToCheck);

        // Log quota usage (1 unit for videos.getRating batch call)
        const { error: quotaError } = await supabase.rpc('log_youtube_quota_usage', {
            p_operation: 'videos.getRating',
            p_units: 1,
        });
        if (quotaError) {
            console.error('[verify-video-likes] Failed to log quota usage:', quotaError);
        } else {
            console.log('[verify-video-likes] Logged 1 quota unit for videos.getRating');
        }

        // Process results
        const newAwards: Array<{
            user_id: string;
            video_id: string;
            channel_key: string;
            xp_awarded: number;
        }> = [];

        for (const video of videos) {
            const isLiked = ratings.get(video.videoId) ?? false;
            const wasAlreadyAwarded = awardedVideoIds.has(video.videoId);
            let xpAmount = 0;

            if (isLiked && !wasAlreadyAwarded) {
                xpAmount = CHANNEL_VIDEO_XP[video.channelKey] || 0;
                newAwards.push({
                    user_id: userId,
                    video_id: video.videoId,
                    channel_key: video.channelKey,
                    xp_awarded: xpAmount,
                });
                totalXPAwarded += xpAmount;
                console.log(`[${video.channelKey}] Video liked, awarding ${xpAmount} XP`);
            }

            results.push({
                videoId: video.videoId,
                channelKey: video.channelKey,
                liked: isLiked || wasAlreadyAwarded,  // If already awarded, must have been liked
                xpAwarded: xpAmount,
                alreadyAwarded: wasAlreadyAwarded,  // Client needs this to know XP was previously awarded
            });
        }

        // Update user's XP and record awards
        if (totalXPAwarded > 0) {
            // Record awards in tracking table (DB-level uniqueness prevents double-award)
            const { error: insertError } = await supabase
                .from('user_video_like_awards')
                .insert(newAwards);

            if (insertError) {
                // If insert fails due to duplicate, it's a race condition - another request already awarded
                console.warn('[verify-video-likes] Some awards may already exist:', insertError);
            }

            // Update users.xp_points
            await supabase
                .from('users')
                .update({ xp_points: currentXP + totalXPAwarded })
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
                const fallbackErrors: Array<{ periodType: string; error: Error }> = [];
                for (const periodType of ['monthly', 'weekly']) {
                    const { data: existing, error: existingError } = await supabase
                        .from('leaderboard_entries')
                        .select('video_like_xp, game_xp, subscription_xp')
                        .eq('user_id', userId)
                        .eq('period_type', periodType)
                        .maybeSingle();

                    if (existingError) {
                        console.error('[verify-video-likes] Failed to load leaderboard entry for fallback', {
                            userId,
                            periodType,
                            error: existingError,
                        });
                        fallbackErrors.push({ periodType, error: existingError });
                        continue;
                    }

                    const existingVideoXP = existing?.video_like_xp || 0;
                    const existingGameXP = existing?.game_xp || 0;
                    const existingSubscriptionXP = existing?.subscription_xp || 0;

                    const { error: upsertError } = await supabase
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

                    if (upsertError) {
                        console.error('[verify-video-likes] Failed to upsert leaderboard entry for fallback', {
                            userId,
                            periodType,
                            totalXPAwarded,
                            error: upsertError,
                        });
                        fallbackErrors.push({ periodType, error: upsertError });
                    }
                }
                if (fallbackErrors.length > 0) {
                    const summary = fallbackErrors
                        .map(entry => `${entry.periodType}: ${entry.error.message}`)
                        .join('; ');
                    throw new Error(`[verify-video-likes] Fallback upsert failures: ${summary}`);
                }
                console.log(`[verify-video-likes] Awarded ${totalXPAwarded} via fallback upsert`, {
                    userId,
                    totalXPAwarded,
                });
            } else {
                console.log(`[verify-video-likes] Awarded ${totalXPAwarded} video_like XP via RPC`, {
                    userId,
                    totalXPAwarded,
                });
            }
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
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

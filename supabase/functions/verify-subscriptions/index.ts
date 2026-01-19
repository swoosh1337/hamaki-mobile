/**
 * verify-subscriptions Edge Function
 *
 * Verifies YouTube channel subscriptions for a user.
 *
 * CRITICAL RULES:
 * ✅ DB short-circuit: If already verified, return immediately (0 API calls)
 * ✅ Early-exit pagination: Stop as soon as all channels found
 * ✅ XP awarded once, never revoked
 * ✅ AUTH REQUIRED: User must be authenticated and can only verify their own subscriptions
 * ❌ No auto-scheduling
 * ❌ No background rechecks
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// XP rewards per channel
const CHANNEL_XP: Record<string, number> = {
    'hamaki': 1000,
    'miro': 700,
    'bastos': 700,
    'koro': 700,
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChannelToVerify {
    channelId: string;
    channelKey: string;
}

interface VerificationResult {
    channelId: string;
    channelKey: string;
    subscribed: boolean;
    xpAwarded: number;
    alreadyVerified: boolean;
}

// Type for existing verification records from database
interface ExistingVerification {
    channel_id: string;
    subscribed: boolean;
    xp_awarded: boolean;
    alreadyVerified: boolean;
}

interface YouTubeSubscription {
    snippet?: {
        resourceId?: {
            channelId?: string;
        };
    };
}

/**
 * Result from checking subscriptions including quota usage
 */
interface CheckSubscriptionsResult {
    foundChannels: Set<string>;
    pagesChecked: number;  // Each page = 1 quota unit
}

/**
 * Fetch user's subscriptions with early-exit pagination
 * Stops as soon as all required channels are found
 * Returns found channels AND pages checked (for quota tracking)
 */
async function checkSubscriptions(
    accessToken: string,
    requiredChannels: Set<string>
): Promise<CheckSubscriptionsResult> {
    const foundChannels = new Set<string>();
    let nextPageToken: string | undefined;
    let pagesChecked = 0;

    // Copy to track remaining (for early exit)
    const remaining = new Set(requiredChannels);

    while (true) {
        const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('mine', 'true');
        url.searchParams.set('maxResults', '50');
        if (nextPageToken) {
            url.searchParams.set('pageToken', nextPageToken);
        }

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('[verify-subscriptions] YouTube API error:', error);

            // Check for quota exhaustion (403 with specific reason)
            const errorReason = error?.error?.errors?.[0]?.reason;
            const isQuotaError = response.status === 403 && (
                errorReason === 'quotaExceeded' ||
                errorReason === 'dailyLimitExceeded' ||
                errorReason === 'rateLimitExceeded' ||
                error?.error?.message?.toLowerCase()?.includes('quota')
            );

            if (isQuotaError) {
                console.error('[verify-subscriptions] YouTube quota exhausted!');
                throw new Error('YOUTUBE_QUOTA_EXHAUSTED');
            }

            throw new Error(`YouTube API error: ${response.status}`);
        }

        // Count this page (1 quota unit per subscriptions.list call)
        pagesChecked++;

        const data = await response.json();

        // Check each subscription
        for (const sub of (data.items || []) as YouTubeSubscription[]) {
            const channelId = sub.snippet?.resourceId?.channelId;
            if (channelId && remaining.has(channelId)) {
                foundChannels.add(channelId);
                remaining.delete(channelId);
                console.log(`[verify-subscriptions] Found: ${channelId}`);
            }
        }

        // Early exit: All channels found!
        if (remaining.size === 0) {
            console.log('[verify-subscriptions] Early exit: all channels found');
            break;
        }

        // Check for more pages
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) {
            break;
        }
    }

    return { foundChannels, pagesChecked };
}

Deno.serve(async (req: Request) => {
    console.log('[verify-subscriptions] Request received:', {
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
        let body: { channels?: ChannelToVerify[]; accessToken?: string };
        try {
            body = await req.json();
            console.log('[verify-subscriptions] Request body received:', {
                channelCount: body?.channels?.length,
                hasAccessToken: !!body?.accessToken,
                accessTokenLength: body?.accessToken?.length || 0,
            });
        } catch (parseError) {
            console.error('[verify-subscriptions] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { channels, accessToken } = body;

        // Validate required fields
        if (!channels?.length) {
            console.error('[verify-subscriptions] Missing channels');
            return new Response(
                JSON.stringify({ success: false, error: 'Missing channels' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate YouTube access token (required for YouTube API calls)
        if (!accessToken?.trim()) {
            console.error('[verify-subscriptions] Missing or empty YouTube access token');
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
                console.log('[verify-subscriptions] Auth via Supabase JWT:', userId);
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
                console.error('[verify-subscriptions] Failed to verify Google identity');
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid YouTube access token' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const googleUser = await googleResponse.json();
            if (!googleUser.id) {
                console.error('[verify-subscriptions] No Google ID in response');
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
                console.error('[verify-subscriptions] User not found for Google ID:', googleUser.id);
                return new Response(
                    JSON.stringify({ success: false, error: 'User not found' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            userId = dbUser.id;
            console.log('[verify-subscriptions] Auth via YouTube token, Google ID:', googleUser.id, '-> User:', userId);
        }

        console.log('[verify-subscriptions] User verified:', { userId, authMethod });
        console.log('[verify-subscriptions] YouTube access token validated:', {
            length: accessToken.trim().length,
            prefix: accessToken.trim().substring(0, 10),
        });

        // Fetch user details for logging
        const { data: userData } = await supabase
            .from('users')
            .select('id, full_name, email')
            .eq('id', userId)
            .single();

        console.log('[verify-subscriptions] ========================================');
        console.log('[verify-subscriptions] User:', {
            id: userId,
            name: userData?.full_name || 'Unknown',
            email: userData?.email || 'Unknown',
        });
        console.log('[verify-subscriptions] Channels to verify:', channels.length);
        console.log('[verify-subscriptions] ========================================');

        const results: VerificationResult[] = [];
        let totalXPAwarded = 0;

        // Build map for quick lookup
        const channelMap = new Map(channels.map(c => [c.channelId, c.channelKey]));

        // Step 1: Check DB for already verified channels
        const { data: existingVerifications } = await supabase
            .from('youtube_subscription_verifications')
            .select('*')
            .eq('user_id', userId)
            .in('channel_id', channels.map(c => c.channelId));

        const verifiedChannels = new Map<string, ExistingVerification>(
            (existingVerifications || []).map((v: ExistingVerification) => [v.channel_id, v])
        );

        // Separate already-verified from needs-check
        const needsCheck: ChannelToVerify[] = [];

        for (const channel of channels) {
            const existing = verifiedChannels.get(channel.channelId);

            if (existing?.subscribed && existing?.xp_awarded) {
                // Already verified and awarded - return cached result (0 API calls)
                results.push({
                    channelId: channel.channelId,
                    channelKey: channel.channelKey,
                    subscribed: true,
                    xpAwarded: 0,
                    alreadyVerified: true,
                });
                console.log(`[${channel.channelKey}] Already verified, skipping`);
            } else {
                needsCheck.push(channel);
            }
        }

        // Step 2: If any channels need checking, call YouTube API
        if (needsCheck.length > 0) {
            console.log(`[verify-subscriptions] Checking ${needsCheck.length} channels`);

            const requiredIds = new Set(needsCheck.map(c => c.channelId));
            const { foundChannels: foundIds, pagesChecked } = await checkSubscriptions(accessToken, requiredIds);

            // Log quota usage (1 unit per page of subscriptions.list)
            if (pagesChecked > 0) {
                const { error: quotaError } = await supabase.rpc('log_youtube_quota_usage', {
                    p_operation: 'subscriptions.list',
                    p_units: pagesChecked,
                });
                if (quotaError) {
                    console.error('[verify-subscriptions] Failed to log quota usage:', quotaError);
                } else {
                    console.log(`[verify-subscriptions] Logged ${pagesChecked} quota units for subscriptions.list`);
                }
            }

            // Step 3: Process results - build batched operations
            const verificationRecords: Array<{
                user_id: string;
                channel_id: string;
                channel_key: string;
                subscribed: boolean;
                xp_awarded: boolean;
                verified_at: string;
                updated_at: string;
            }> = [];

            for (const channel of needsCheck) {
                const isSubscribed = foundIds.has(channel.channelId);
                const xpAmount = isSubscribed ? CHANNEL_XP[channel.channelKey] || 0 : 0;

                // Collect verification record for batch upsert
                verificationRecords.push({
                    user_id: userId,
                    channel_id: channel.channelId,
                    channel_key: channel.channelKey,
                    subscribed: isSubscribed,
                    xp_awarded: isSubscribed,
                    verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });

                // Track XP to award
                if (isSubscribed && xpAmount > 0) {
                    totalXPAwarded += xpAmount;
                    console.log(`[${channel.channelKey}] Subscribed, will award ${xpAmount} XP`);
                }

                results.push({
                    channelId: channel.channelId,
                    channelKey: channel.channelKey,
                    subscribed: isSubscribed,
                    xpAwarded: isSubscribed ? xpAmount : 0,
                    alreadyVerified: false,
                });
            }

            // BATCH OPERATION 1: Upsert all verification records at once
            if (verificationRecords.length > 0) {
                const { error: batchUpsertError } = await supabase
                    .from('youtube_subscription_verifications')
                    .upsert(verificationRecords, { onConflict: 'user_id,channel_id' });

                if (batchUpsertError) {
                    console.error('[verify-subscriptions] Batch upsert error:', batchUpsertError);
                } else {
                    console.log(`[verify-subscriptions] Batch upserted ${verificationRecords.length} verification records`);
                }
            }

            // BATCH OPERATION 2: Award total XP in one call
            if (totalXPAwarded > 0) {
                // Get current user XP once
                const { data: user } = await supabase
                    .from('users')
                    .select('xp_points')
                    .eq('id', userId)
                    .single();

                // Update user XP once with total
                await supabase
                    .from('users')
                    .update({ xp_points: (user?.xp_points || 0) + totalXPAwarded })
                    .eq('id', userId);

                // Call award_xp RPC once with total XP
                const { error: awardError } = await supabase.rpc('award_xp', {
                    p_user_id: userId,
                    p_xp_type: 'subscription',
                    p_amount: totalXPAwarded,
                });

                if (awardError) {
                    console.error('[verify-subscriptions] Failed to award XP via RPC:', awardError);
                    // Fallback: direct upsert for both periods (still batched - one per period)
                    for (const periodType of ['monthly', 'weekly']) {
                        const { data: existing } = await supabase
                            .from('leaderboard_entries')
                            .select('subscription_xp, game_xp, video_like_xp')
                            .eq('user_id', userId)
                            .eq('period_type', periodType)
                            .maybeSingle();

                        const { error: fallbackError } = await supabase
                            .from('leaderboard_entries')
                            .upsert({
                                user_id: userId,
                                period_type: periodType,
                                subscription_xp: (existing?.subscription_xp || 0) + totalXPAwarded,
                                game_xp: existing?.game_xp || 0,
                                video_like_xp: existing?.video_like_xp || 0,
                            }, { onConflict: 'user_id,period_type' });

                        if (fallbackError) {
                            console.error(`[verify-subscriptions] Fallback upsert failed for ${periodType}:`, fallbackError);
                        }
                    }
                    console.log(`[verify-subscriptions] Awarded ${totalXPAwarded} subscription XP via fallback`);
                } else {
                    console.log(`[verify-subscriptions] Awarded ${totalXPAwarded} subscription XP via RPC`);
                }
            }
        }

        console.log(`[verify-subscriptions] Complete. Total XP: ${totalXPAwarded}`);

        return new Response(
            JSON.stringify({
                success: true,
                results,
                totalXPAwarded,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[verify-subscriptions] Error:', errorMessage);
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

/**
 * verify-subscriptions Edge Function
 *
 * Verifies YouTube channel subscriptions for a user.
 * 
 * CRITICAL RULES:
 * ✅ DB short-circuit: If already verified, return immediately (0 API calls)
 * ✅ Early-exit pagination: Stop as soon as all channels found
 * ✅ XP awarded once, never revoked
 * ❌ No auto-scheduling
 * ❌ No background rechecks
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
 * Fetch user's subscriptions with early-exit pagination
 * Stops as soon as all required channels are found
 */
async function checkSubscriptions(
    accessToken: string,
    requiredChannels: Set<string>
): Promise<Set<string>> {
    const foundChannels = new Set<string>();
    let nextPageToken: string | undefined;

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
            throw new Error(`YouTube API error: ${response.status}`);
        }

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

    return foundChannels;
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
        // Parse request body first to get access token
        let body: { channels?: ChannelToVerify[]; userId?: string; accessToken?: string };
        try {
            body = await req.json();
            console.log('[verify-subscriptions] Request body received:', {
                channelCount: body?.channels?.length,
                userId: body?.userId ? 'present' : 'missing',
                hasAccessToken: !!body?.accessToken,
                accessTokenLength: body?.accessToken?.length || 0,
            });
        } catch (parseError) {
            console.error('[verify-subscriptions] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { channels, userId, accessToken } = body;

        // Validate required fields
        if (!channels?.length || !userId) {
            console.error('[verify-subscriptions] Missing required fields:', { channels: !!channels?.length, userId: !!userId });
            return new Response(
                JSON.stringify({ error: 'Missing channels or userId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate access token
        if (!accessToken?.trim()) {
            console.error('[verify-subscriptions] Missing or empty access token');
            return new Response(
                JSON.stringify({ error: 'Missing access token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[verify-subscriptions] Access token validated:', {
            length: accessToken.trim().length,
            prefix: accessToken.trim().substring(0, 10),
        });

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
            const foundIds = await checkSubscriptions(accessToken, requiredIds);

            // Step 3: Process results and award XP
            for (const channel of needsCheck) {
                const isSubscribed = foundIds.has(channel.channelId);
                const xpAmount = isSubscribed ? CHANNEL_XP[channel.channelKey] || 0 : 0;

                // Upsert verification result - specify conflict resolution
                const { error: upsertError } = await supabase
                    .from('youtube_subscription_verifications')
                    .upsert(
                        {
                            user_id: userId,
                            channel_id: channel.channelId,
                            channel_key: channel.channelKey,
                            subscribed: isSubscribed,
                            xp_awarded: isSubscribed,
                            verified_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'user_id,channel_id' }
                    );

                if (upsertError) {
                    console.error(`[${channel.channelKey}] Upsert error:`, upsertError);
                } else {
                    console.log(`[${channel.channelKey}] Saved to DB: subscribed=${isSubscribed}, xpAwarded=${isSubscribed}`);
                }

                // Award XP if subscribed
                if (isSubscribed && xpAmount > 0) {
                    // Update users.xp_points
                    const { data: user } = await supabase
                        .from('users')
                        .select('xp_points')
                        .eq('id', userId)
                        .single();

                    await supabase
                        .from('users')
                        .update({ xp_points: (user?.xp_points || 0) + xpAmount })
                        .eq('id', userId);

                    // Update leaderboard_entries.subscription_xp for BOTH monthly and weekly
                    // Using the award_xp RPC function which handles both periods correctly
                    const { error: awardError } = await supabase.rpc('award_xp', {
                        p_user_id: userId,
                        p_xp_type: 'subscription',
                        p_amount: xpAmount,
                    });

                    if (awardError) {
                        console.error(`[${channel.channelKey}] Failed to award XP via RPC:`, awardError);
                        // Fallback: try direct upsert for both periods
                        for (const periodType of ['monthly', 'weekly']) {
                            const { data: existing } = await supabase
                                .from('leaderboard_entries')
                                .select('subscription_xp')
                                .eq('user_id', userId)
                                .eq('period_type', periodType)
                                .maybeSingle();

                            const currentXP = existing?.subscription_xp || 0;

                            await supabase
                                .from('leaderboard_entries')
                                .upsert({
                                    user_id: userId,
                                    period_type: periodType,
                                    subscription_xp: currentXP + xpAmount,
                                    game_xp: 0,
                                    video_like_xp: 0,
                                }, {
                                    onConflict: 'user_id,period_type'
                                });
                        }
                    }

                    totalXPAwarded += xpAmount;
                    console.log(`[${channel.channelKey}] Awarded ${xpAmount} subscription XP via RPC`);
                }

                results.push({
                    channelId: channel.channelId,
                    channelKey: channel.channelKey,
                    subscribed: isSubscribed,
                    xpAwarded: xpAmount,
                    alreadyVerified: false,
                });
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
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

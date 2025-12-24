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

Deno.serve(async (req) => {
    console.log('[verify-subscriptions] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Get user's access token from Authorization header
        const authHeader = req.headers.get('Authorization');
        console.log('[verify-subscriptions] Auth header present:', !!authHeader);

        if (!authHeader?.startsWith('Bearer ')) {
            console.error('[verify-subscriptions] Missing or invalid access token');
            return new Response(
                JSON.stringify({ error: 'Missing access token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
        const accessToken = authHeader.replace('Bearer ', '');
        console.log('[verify-subscriptions] Access token extracted (length):', accessToken.length);

        // Parse request body
        let body: { channels?: ChannelToVerify[]; userId?: string };
        try {
            body = await req.json();
            console.log('[verify-subscriptions] Request body:', {
                channelCount: body?.channels?.length,
                userId: body?.userId ? 'present' : 'missing',
            });
        } catch (parseError) {
            console.error('[verify-subscriptions] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { channels, userId } = body;

        if (!channels?.length || !userId) {
            console.error('[verify-subscriptions] Missing required fields:', { channels: !!channels?.length, userId: !!userId });
            return new Response(
                JSON.stringify({ error: 'Missing channels or userId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

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

        const verifiedChannels = new Map(
            (existingVerifications || []).map(v => [v.channel_id, v])
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

                // Upsert verification result
                await supabase
                    .from('youtube_subscription_verifications')
                    .upsert({
                        user_id: userId,
                        channel_id: channel.channelId,
                        channel_key: channel.channelKey,
                        subscribed: isSubscribed,
                        xp_awarded: isSubscribed,
                        verified_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });

                // Award XP if subscribed
                if (isSubscribed && xpAmount > 0) {
                    const { data: user } = await supabase
                        .from('users')
                        .select('xp_points')
                        .eq('id', userId)
                        .single();

                    await supabase
                        .from('users')
                        .update({ xp_points: (user?.xp_points || 0) + xpAmount })
                        .eq('id', userId);

                    totalXPAwarded += xpAmount;
                    console.log(`[${channel.channelKey}] Awarded ${xpAmount} XP`);
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

    } catch (error) {
        console.error('[verify-subscriptions] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

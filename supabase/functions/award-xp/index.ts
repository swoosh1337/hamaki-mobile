/**
 * award-xp Edge Function
 *
 * Single secure entry point for all XP mutations with instant rank feedback.
 *
 * RULES:
 * - Only service role can call award_xp() SQL function
 * - Returns personal_rank calculated server-side (instant feedback)
 * - No client-side rank calculation needed
 * - Single API call provides both XP update and rank
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type XPType = 'game' | 'subscription' | 'video_like';

interface AwardXPRequest {
    userId: string;
    xpType: XPType;
    amount: number;
}

interface XPBreakdown {
    game: number;
    subscription: number;
    video_like: number;
}

interface AwardXPResponse {
    success: boolean;
    new_total_xp: number;
    personal_rank: number;
    xp_breakdown: XPBreakdown;
    error?: string;
}

/**
 * Calculate user's current rank based on total_xp
 * Returns count of users with higher total_xp + 1
 */
async function calculatePersonalRank(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    userTotalXP: number
): Promise<number> {
    // Count users with higher total_xp
    const { count, error } = await supabase
        .from('leaderboard_entries')
        .select('*', { count: 'exact', head: true })
        .gt('total_xp', userTotalXP);

    if (error) {
        console.error('[award-xp] Error calculating rank:', error);
        // Fallback: return a high rank if calculation fails
        return 999;
    }

    // Rank = number of users with higher XP + 1
    return (count || 0) + 1;
}

/**
 * Get user's XP breakdown from leaderboard_entries
 */
async function getXPBreakdown(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<XPBreakdown> {
    const { data, error } = await supabase
        .from('leaderboard_entries')
        .select('game_xp, subscription_xp, video_like_xp')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        console.warn('[award-xp] Could not get XP breakdown:', error);
        return { game: 0, subscription: 0, video_like: 0 };
    }

    return {
        game: data.game_xp || 0,
        subscription: data.subscription_xp || 0,
        video_like: data.video_like_xp || 0,
    };
}

Deno.serve(async (req: Request) => {
    console.log('[award-xp] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Parse request body
        let body: AwardXPRequest;
        try {
            body = await req.json();
            console.log('[award-xp] Request body:', {
                userId: body.userId ? 'present' : 'missing',
                xpType: body.xpType,
                amount: body.amount,
            });
        } catch (parseError) {
            console.error('[award-xp] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, xpType, amount } = body;

        // Validate required fields
        if (!userId) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing userId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate xpType
        const validXPTypes: XPType[] = ['game', 'subscription', 'video_like'];
        if (!xpType || !validXPTypes.includes(xpType)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `Invalid xpType. Must be one of: ${validXPTypes.join(', ')}`
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate amount
        if (typeof amount !== 'number' || amount <= 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Amount must be a positive number' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client with service role
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        console.log('[award-xp] Calling award_xp SQL function:', { userId, xpType, amount });

        // Call the award_xp SQL function
        const { data: awardResult, error: awardError } = await supabase
            .rpc('award_xp', {
                p_user_id: userId,
                p_xp_type: xpType,
                p_amount: amount,
            });

        if (awardError) {
            console.error('[award-xp] SQL function error:', awardError);
            return new Response(
                JSON.stringify({ success: false, error: awardError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // award_xp returns: { success: boolean, new_total: number, message: string }
        const result = awardResult?.[0];
        if (!result?.success) {
            console.error('[award-xp] Award failed:', result?.message);
            return new Response(
                JSON.stringify({ success: false, error: result?.message || 'Award failed' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const newTotalXP = result.new_total;
        console.log('[award-xp] XP awarded successfully, new total:', newTotalXP);

        // Calculate personal rank (instant feedback)
        const personalRank = await calculatePersonalRank(supabase, userId, newTotalXP);
        console.log('[award-xp] Personal rank calculated:', personalRank);

        // Get XP breakdown
        const xpBreakdown = await getXPBreakdown(supabase, userId);
        console.log('[award-xp] XP breakdown:', xpBreakdown);

        const response: AwardXPResponse = {
            success: true,
            new_total_xp: newTotalXP,
            personal_rank: personalRank,
            xp_breakdown: xpBreakdown,
        };

        console.log('[award-xp] Success response:', response);

        return new Response(
            JSON.stringify(response),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[award-xp] Unexpected error:', errorMessage);
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

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
 *
 * IDEMPOTENCY:
 * - Requires idempotencyKey in request body
 * - Uses database-backed idempotency (edge_idempotency_keys table)
 * - Duplicate requests return current state with duplicate: true
 * - In-memory idempotency is invalid in production (multiple instances)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================
// Maximum XP that can be awarded in a single request per type
// This prevents malicious clients from inflating their XP
const MAX_XP_PER_AWARD: Record<string, number> = {
    game: 500,           // Max ~25,000 score in Hammock Jump (score/50) or 5000 in No Pogodi (score/10)
    subscription: 100,   // Fixed XP per channel subscription
    video_like: 50,      // Fixed XP per video like
};

// Minimum XP per award (catches invalid/negative values that bypass basic validation)
const MIN_XP_PER_AWARD = 1;

// =============================================================================
// RANK CACHING CONFIGURATION
// =============================================================================
// Cache rank calculations to reduce database load
// TTL is short (5 seconds) to ensure ranks stay reasonably fresh
// Note: Each Edge Function instance has its own cache (not shared across instances)
// This still provides significant benefit by reducing redundant calculations
const RANK_CACHE_TTL_MS = 5000;

interface RankCacheEntry {
    rank: number;
    expiresAt: number;
}

// Simple in-memory cache for rank calculations
// Key: `${userId}:${totalXP}` - rank only changes when XP changes
const rankCache = new Map<string, RankCacheEntry>();

/**
 * Get cached rank or null if not found/expired
 */
function getCachedRank(userId: string, totalXP: number): number | null {
    const key = `${userId}:${totalXP}`;
    const entry = rankCache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        rankCache.delete(key);
        return null;
    }

    return entry.rank;
}

/**
 * Cache a rank calculation result
 */
function setCachedRank(userId: string, totalXP: number, rank: number): void {
    const key = `${userId}:${totalXP}`;
    rankCache.set(key, {
        rank,
        expiresAt: Date.now() + RANK_CACHE_TTL_MS,
    });

    // Cleanup when cache exceeds limit
    if (rankCache.size > 1000) {
        const now = Date.now();
        // First: remove expired entries
        for (const [k, v] of rankCache.entries()) {
            if (now > v.expiresAt) {
                rankCache.delete(k);
            }
        }
        // Second: evict oldest entries until under limit (FIFO order via Map insertion)
        const iterator = rankCache.keys();
        while (rankCache.size > 1000) {
            const oldestKey = iterator.next().value;
            if (oldestKey) rankCache.delete(oldestKey);
            else break;
        }
    }
}

type XPType = 'game' | 'subscription' | 'video_like';

interface AwardXPRequest {
    userId: string;
    xpType: XPType;
    amount: number;
    /** Idempotency key to prevent duplicate awards */
    idempotencyKey?: string;
}

interface XPBreakdown {
    game: number;
    subscription: number;
    video_like: number;
}

interface AwardXPResponse {
    success: boolean;
    /** True if this was a duplicate request (XP already awarded) */
    duplicate?: boolean;
    new_total_xp: number;
    personal_rank: number;
    xp_breakdown: XPBreakdown;
    error?: string;
}

/**
 * Calculate user's current rank based on total_xp
 * Returns count of users with higher total_xp + 1
 *
 * Uses in-memory cache to reduce database load:
 * - Cache key: `${userId}:${totalXP}` (rank only changes when XP changes)
 * - TTL: 5 seconds (short to keep ranks fresh)
 * - Note: Uses new composite index idx_leaderboard_period_total_xp for O(log n) lookup
 */
async function calculatePersonalRank(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    userTotalXP: number
): Promise<number> {
    // Check cache first
    const cachedRank = getCachedRank(userId, userTotalXP);
    if (cachedRank !== null) {
        console.log('[award-xp] Rank cache hit', { userId: userId.slice(0, 8), rank: cachedRank });
        return cachedRank;
    }

    // Count users with higher total_xp (only monthly entries for ranking)
    // Uses idx_leaderboard_period_total_xp index for O(log n) performance
    const { count, error } = await supabase
        .from('leaderboard_entries')
        .select('*', { count: 'exact', head: true })
        .eq('period_type', 'monthly')
        .gt('total_xp', userTotalXP);

    if (error) {
        console.error('[award-xp] Error calculating rank:', error);
        // Fallback: return a high rank if calculation fails
        return 999;
    }

    // Rank = number of users with higher XP + 1
    const rank = (count || 0) + 1;

    // Cache the result
    setCachedRank(userId, userTotalXP, rank);
    console.log('[award-xp] Rank calculated and cached', { userId: userId.slice(0, 8), rank });

    return rank;
}

/**
 * Get user's XP breakdown from leaderboard_entries
 */
async function getXPBreakdown(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<XPBreakdown> {
    // Get monthly entry for XP breakdown (there are 2 entries per user: weekly + monthly)
    const { data, error } = await supabase
        .from('leaderboard_entries')
        .select('game_xp, subscription_xp, video_like_xp')
        .eq('user_id', userId)
        .eq('period_type', 'monthly')
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

/**
 * Get current user state (for duplicate responses)
 * Returns XP and rank even if no XP was awarded this time.
 *
 * IMPORTANT: This function MUST return authoritative data.
 * If it can't fetch state, it throws - we don't return fake data.
 */
async function getCurrentUserState(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<{ totalXP: number; rank: number; breakdown: XPBreakdown }> {
    // Get monthly leaderboard entry (there are 2 entries per user: weekly + monthly)
    const { data, error } = await supabase
        .from('leaderboard_entries')
        .select('total_xp, game_xp, subscription_xp, video_like_xp')
        .eq('user_id', userId)
        .eq('period_type', 'monthly')
        .single();

    if (error || !data) {
        // FAIL HARD - duplicate handling requires authoritative state
        console.error('[award-xp] Failed to fetch current user state:', error);
        throw new Error(`Failed to fetch current user state: ${error?.message || 'No data'}`);
    }

    const totalXP = data.total_xp || 0;
    const breakdown: XPBreakdown = {
        game: data.game_xp || 0,
        subscription: data.subscription_xp || 0,
        video_like: data.video_like_xp || 0,
    };

    // Calculate rank
    const rank = await calculatePersonalRank(supabase, userId, totalXP);

    return { totalXP, rank, breakdown };
}

/**
 * Check idempotency key and insert if not exists
 *
 * IMPORTANT: If insert fails for any reason other than duplicate,
 * we throw an error. We do NOT proceed without idempotency protection.
 * This ensures exactly-once semantics.
 */
async function checkIdempotency(
    supabase: ReturnType<typeof createClient>,
    idempotencyKey: string,
    userId: string
): Promise<{ isDuplicate: boolean }> {
    // Try to insert the idempotency key
    const { error } = await supabase
        .from('edge_idempotency_keys')
        .insert({
            key: idempotencyKey,
            user_id: userId,
            function_name: 'award-xp',
        });

    if (error) {
        // Check if it's a duplicate key error (23505 = unique_violation)
        if (error.code === '23505') {
            console.log('[award-xp] Duplicate idempotency key detected:', idempotencyKey);
            return { isDuplicate: true };
        }

        // FAIL HARD - do NOT proceed without idempotency protection
        // This ensures exactly-once semantics are never violated
        console.error('[award-xp] Idempotency check failed:', error);
        throw new Error(`Idempotency check failed: ${error.message}`);
    }

    return { isDuplicate: false };
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
                hasIdempotencyKey: !!body.idempotencyKey,
            });
        } catch (parseError) {
            console.error('[award-xp] Failed to parse request body:', parseError);
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, xpType, amount, idempotencyKey } = body;

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

        // Validate amount - basic check
        if (typeof amount !== 'number' || amount <= 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Amount must be a positive number' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate amount - rate limiting (prevents malicious XP inflation)
        const maxAllowed = MAX_XP_PER_AWARD[xpType] || 100;
        if (amount > maxAllowed) {
            console.warn('[award-xp] XP amount exceeds limit:', {
                userId,
                xpType,
                amount,
                maxAllowed,
                rejected: true
            });
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `XP amount ${amount} exceeds maximum allowed (${maxAllowed}) for ${xpType}`
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (amount < MIN_XP_PER_AWARD) {
            return new Response(
                JSON.stringify({ success: false, error: `XP amount must be at least ${MIN_XP_PER_AWARD}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate idempotencyKey (REQUIRED for exactly-once semantics)
        if (!idempotencyKey || typeof idempotencyKey !== 'string') {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'idempotencyKey is required. Format: award-xp:{userId}:{gameId}:{sessionId}:{amount}'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client with service role
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Check idempotency - this MUST succeed before we proceed
        console.log('[award-xp] Checking idempotency:', idempotencyKey);
        const { isDuplicate } = await checkIdempotency(supabase, idempotencyKey, userId);

        if (isDuplicate) {
            // This is a duplicate request - return current state without awarding XP
            console.log('[award-xp] Duplicate request, returning current state');
            const currentState = await getCurrentUserState(supabase, userId);

            const response: AwardXPResponse = {
                success: true,
                duplicate: true,
                new_total_xp: currentState.totalXP,
                personal_rank: currentState.rank,
                xp_breakdown: currentState.breakdown,
            };

            console.log('[award-xp] Duplicate response:', response);
            return new Response(
                JSON.stringify(response),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

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

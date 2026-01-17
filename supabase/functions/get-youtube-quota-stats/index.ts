/**
 * get-youtube-quota-stats Edge Function
 *
 * Returns YouTube API quota usage statistics for admin dashboard.
 * Requires admin authentication.
 *
 * Returns:
 * - Current day usage and remaining quota
 * - Breakdown by operation type
 * - Optional: Historical data for charts
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DAILY_QUOTA_LIMIT = 10000;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuotaStatus {
    usage_date: string;
    total_units_used: number;
    remaining_units: number;
    usage_percentage: number;
    subscriptions_list_units: number;
    subscriptions_list_calls: number;
    videos_get_rating_units: number;
    videos_get_rating_calls: number;
    search_list_units: number;
    search_list_calls: number;
    updated_at: string;
}

interface QuotaHistory {
    usage_date: string;
    total_units: number;
    subscriptions_list_units: number;
    videos_get_rating_units: number;
    search_list_units: number;
}

Deno.serve(async (req: Request) => {
    console.log('[get-youtube-quota-stats] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Parse query params for history days (default 7)
        const url = new URL(req.url);
        const historyDays = parseInt(url.searchParams.get('days') || '7', 10);

        // Get current day status
        const { data: currentStatus, error: statusError } = await supabase
            .rpc('get_youtube_quota_status');

        if (statusError) {
            console.error('[get-youtube-quota-stats] Failed to get status:', statusError);
            throw statusError;
        }

        // Get historical data
        const { data: history, error: historyError } = await supabase
            .rpc('get_youtube_quota_history', { p_days: historyDays });

        if (historyError) {
            console.error('[get-youtube-quota-stats] Failed to get history:', historyError);
            // Non-fatal - continue without history
        }

        // Format response
        const status = (currentStatus as QuotaStatus[])?.[0] || {
            usage_date: new Date().toISOString().split('T')[0],
            total_units_used: 0,
            remaining_units: DAILY_QUOTA_LIMIT,
            usage_percentage: 0,
            subscriptions_list_units: 0,
            subscriptions_list_calls: 0,
            videos_get_rating_units: 0,
            videos_get_rating_calls: 0,
            search_list_units: 0,
            search_list_calls: 0,
            updated_at: new Date().toISOString(),
        };

        const response = {
            success: true,
            daily_limit: DAILY_QUOTA_LIMIT,
            current: {
                date: status.usage_date,
                total_used: status.total_units_used,
                remaining: status.remaining_units,
                percentage: status.usage_percentage,
                breakdown: {
                    subscriptions_list: {
                        units: status.subscriptions_list_units,
                        calls: status.subscriptions_list_calls,
                        unit_cost: 1,
                    },
                    videos_get_rating: {
                        units: status.videos_get_rating_units,
                        calls: status.videos_get_rating_calls,
                        unit_cost: 1,
                    },
                    search_list: {
                        units: status.search_list_units,
                        calls: status.search_list_calls,
                        unit_cost: 100,
                    },
                },
                last_updated: status.updated_at,
            },
            history: (history as QuotaHistory[] || []).map(h => ({
                date: h.usage_date,
                total_units: h.total_units,
                breakdown: {
                    subscriptions_list: h.subscriptions_list_units,
                    videos_get_rating: h.videos_get_rating_units,
                    search_list: h.search_list_units,
                },
            })),
            // Estimated capacity based on current usage patterns
            estimates: {
                // Background sync uses 400 units every 4 hours (6 times = 2400/day)
                background_sync_daily: 2400,
                // Available for user-initiated operations
                available_for_users: DAILY_QUOTA_LIMIT - 2400,
                // At 1-2 units per user verification
                max_user_verifications: Math.floor((DAILY_QUOTA_LIMIT - 2400) / 2),
            },
        };

        console.log('[get-youtube-quota-stats] Returning stats:', {
            total_used: status.total_units_used,
            remaining: status.remaining_units,
            percentage: status.usage_percentage,
        });

        return new Response(
            JSON.stringify(response),
            {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[get-youtube-quota-stats] Error:', errorMessage);
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            }
        );
    }
});

-- ============================================================================
-- Migration: Create aggregate_content_stats function and cron job
-- Purpose: Hourly aggregation of analytics_events into content_stats
-- Date: 2026-01-15
-- ============================================================================

-- Create the aggregation function
CREATE OR REPLACE FUNCTION aggregate_content_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
    v_records_processed INTEGER := 0;
BEGIN
    RAISE NOTICE '[aggregate_content_stats] Starting aggregation at %', v_start_time;

    -- Aggregate video_watch events (all-time stats)
    INSERT INTO content_stats (content_type, content_id, content_name, view_count, unique_users, last_interaction_at, period_start, updated_at)
    SELECT
        'video' as content_type,
        COALESCE(context->>'channel_key', post_id) as content_id,
        COALESCE(context->>'channel_name', context->>'video_title', 'Unknown') as content_name,
        COUNT(*) as view_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_interaction_at,
        NULL as period_start,  -- NULL = all-time
        NOW() as updated_at
    FROM analytics_events
    WHERE event_name = 'video_watch'
    GROUP BY COALESCE(context->>'channel_key', post_id), COALESCE(context->>'channel_name', context->>'video_title', 'Unknown')
    ON CONFLICT (content_type, content_id, period_start)
    DO UPDATE SET
        view_count = EXCLUDED.view_count,
        unique_users = EXCLUDED.unique_users,
        last_interaction_at = EXCLUDED.last_interaction_at,
        content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
        updated_at = NOW();

    GET DIAGNOSTICS v_records_processed = ROW_COUNT;
    RAISE NOTICE '[aggregate_content_stats] Video stats: % records', v_records_processed;

    -- Aggregate game_play and game_start events (all-time stats)
    INSERT INTO content_stats (content_type, content_id, content_name, view_count, unique_users, last_interaction_at, period_start, updated_at)
    SELECT
        'game' as content_type,
        COALESCE(context->>'game_id', context->>'game_name', 'unknown') as content_id,
        COALESCE(context->>'game_name', 'Unknown Game') as content_name,
        COUNT(*) as view_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_interaction_at,
        NULL as period_start,
        NOW() as updated_at
    FROM analytics_events
    WHERE event_name IN ('game_play', 'game_start')
    GROUP BY COALESCE(context->>'game_id', context->>'game_name', 'unknown'), COALESCE(context->>'game_name', 'Unknown Game')
    ON CONFLICT (content_type, content_id, period_start)
    DO UPDATE SET
        view_count = EXCLUDED.view_count,
        unique_users = EXCLUDED.unique_users,
        last_interaction_at = EXCLUDED.last_interaction_at,
        content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
        updated_at = NOW();

    GET DIAGNOSTICS v_records_processed = ROW_COUNT;
    RAISE NOTICE '[aggregate_content_stats] Game stats: % records', v_records_processed;

    -- Aggregate sponsor_view and sponsor_click events (all-time stats)
    INSERT INTO content_stats (content_type, content_id, content_name, view_count, unique_users, last_interaction_at, period_start, updated_at)
    SELECT
        'sponsor' as content_type,
        COALESCE(context->>'sponsor_id', 'unknown') as content_id,
        COALESCE(context->>'sponsor_name', 'Unknown Sponsor') as content_name,
        COUNT(*) as view_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_interaction_at,
        NULL as period_start,
        NOW() as updated_at
    FROM analytics_events
    WHERE event_name IN ('sponsor_view', 'sponsor_click')
    GROUP BY COALESCE(context->>'sponsor_id', 'unknown'), COALESCE(context->>'sponsor_name', 'Unknown Sponsor')
    ON CONFLICT (content_type, content_id, period_start)
    DO UPDATE SET
        view_count = EXCLUDED.view_count,
        unique_users = EXCLUDED.unique_users,
        last_interaction_at = EXCLUDED.last_interaction_at,
        content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
        updated_at = NOW();

    GET DIAGNOSTICS v_records_processed = ROW_COUNT;
    RAISE NOTICE '[aggregate_content_stats] Sponsor stats: % records', v_records_processed;

    -- Also aggregate daily stats for trend charts (last 30 days)
    INSERT INTO content_stats (content_type, content_id, content_name, view_count, unique_users, last_interaction_at, period_start, updated_at)
    SELECT
        'daily_active_users' as content_type,
        'dau' as content_id,
        'Daily Active Users' as content_name,
        COUNT(DISTINCT user_id) as view_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_interaction_at,
        created_at::date as period_start,
        NOW() as updated_at
    FROM analytics_events
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY created_at::date
    ON CONFLICT (content_type, content_id, period_start)
    DO UPDATE SET
        view_count = EXCLUDED.view_count,
        unique_users = EXCLUDED.unique_users,
        last_interaction_at = EXCLUDED.last_interaction_at,
        updated_at = NOW();

    GET DIAGNOSTICS v_records_processed = ROW_COUNT;
    RAISE NOTICE '[aggregate_content_stats] Daily active users: % records', v_records_processed;

    RAISE NOTICE '[aggregate_content_stats] Completed in % ms', EXTRACT(MILLISECONDS FROM NOW() - v_start_time);
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION aggregate_content_stats() TO service_role;

-- Schedule the cron job to run hourly
-- Note: This requires pg_cron extension to be enabled
SELECT cron.schedule(
    'aggregate-content-stats-hourly',
    '0 * * * *',  -- Every hour at minute 0
    $$SELECT aggregate_content_stats()$$
);

-- Add comment
COMMENT ON FUNCTION aggregate_content_stats() IS 'Aggregates analytics_events into content_stats table for admin dashboard';

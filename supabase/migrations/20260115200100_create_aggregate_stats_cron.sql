-- ============================================================================
-- Migration: Create aggregate_content_stats function and cron job
-- Purpose: Hourly aggregation of analytics_events into content_stats
-- Date: 2026-01-15
-- ============================================================================

-- Indexes to speed up incremental aggregation
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
    ON public.analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name_created_at
    ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_video_key
    ON public.analytics_events ((COALESCE(context->>'channel_key', post_id)));
CREATE INDEX IF NOT EXISTS idx_analytics_events_video_name
    ON public.analytics_events ((COALESCE(context->>'channel_name', context->>'video_title')));

-- Watermark table for incremental aggregation
CREATE TABLE IF NOT EXISTS public.content_stats_aggregation_state (
    job_name TEXT PRIMARY KEY,
    last_run_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz
);

-- Create the aggregation function
CREATE OR REPLACE FUNCTION aggregate_content_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
    v_failures INTEGER := 0;
    v_last_run TIMESTAMPTZ := '1970-01-01'::timestamptz;
BEGIN
    RAISE NOTICE '[aggregate_content_stats] Starting aggregation at %', v_start_time;

    SELECT last_run_at INTO v_last_run
    FROM public.content_stats_aggregation_state
    WHERE job_name = 'aggregate_content_stats';

    IF v_last_run IS NULL THEN
        v_last_run := '1970-01-01'::timestamptz;
    END IF;

    -- Aggregate video_watch events (all-time stats)
    DECLARE
        v_records_processed INTEGER := 0;
    BEGIN
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
          AND created_at > v_last_run
          AND created_at <= v_start_time
        GROUP BY COALESCE(context->>'channel_key', post_id), COALESCE(context->>'channel_name', context->>'video_title', 'Unknown')
        ON CONFLICT (content_type, content_id, COALESCE(period_start, '1970-01-01'::DATE))
        DO UPDATE SET
            view_count = EXCLUDED.view_count,
            unique_users = EXCLUDED.unique_users,
            last_interaction_at = EXCLUDED.last_interaction_at,
            content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
            updated_at = NOW();

        GET DIAGNOSTICS v_records_processed = ROW_COUNT;
        RAISE NOTICE '[aggregate_content_stats] Video stats: % records', v_records_processed;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[aggregate_content_stats - video] % (%), started at %', SQLERRM, SQLSTATE, v_start_time;
        v_failures := v_failures + 1;
    END;

    -- Aggregate game_play and game_start events (all-time stats)
    DECLARE
        v_records_processed INTEGER := 0;
    BEGIN
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
        ON CONFLICT (content_type, content_id, COALESCE(period_start, '1970-01-01'::DATE))
        DO UPDATE SET
            view_count = EXCLUDED.view_count,
            unique_users = EXCLUDED.unique_users,
            last_interaction_at = EXCLUDED.last_interaction_at,
            content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
            updated_at = NOW();

        GET DIAGNOSTICS v_records_processed = ROW_COUNT;
        RAISE NOTICE '[aggregate_content_stats] Game stats: % records', v_records_processed;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[aggregate_content_stats - game] % (%), started at %', SQLERRM, SQLSTATE, v_start_time;
        v_failures := v_failures + 1;
    END;

    -- Aggregate sponsor_view and sponsor_click events (all-time stats)
    DECLARE
        v_records_processed INTEGER := 0;
    BEGIN
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
        ON CONFLICT (content_type, content_id, COALESCE(period_start, '1970-01-01'::DATE))
        DO UPDATE SET
            view_count = EXCLUDED.view_count,
            unique_users = EXCLUDED.unique_users,
            last_interaction_at = EXCLUDED.last_interaction_at,
            content_name = COALESCE(EXCLUDED.content_name, content_stats.content_name),
            updated_at = NOW();

        GET DIAGNOSTICS v_records_processed = ROW_COUNT;
        RAISE NOTICE '[aggregate_content_stats] Sponsor stats: % records', v_records_processed;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[aggregate_content_stats - sponsor] % (%), started at %', SQLERRM, SQLSTATE, v_start_time;
        v_failures := v_failures + 1;
    END;

    -- Also aggregate daily stats for trend charts (last 30 days)
    DECLARE
        v_records_processed INTEGER := 0;
    BEGIN
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
        ON CONFLICT (content_type, content_id, COALESCE(period_start, '1970-01-01'::DATE))
        DO UPDATE SET
            view_count = EXCLUDED.view_count,
            unique_users = EXCLUDED.unique_users,
            last_interaction_at = EXCLUDED.last_interaction_at,
            updated_at = NOW();

        GET DIAGNOSTICS v_records_processed = ROW_COUNT;
        RAISE NOTICE '[aggregate_content_stats] Daily active users: % records', v_records_processed;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[aggregate_content_stats - daily_active_users] % (%), started at %', SQLERRM, SQLSTATE, v_start_time;
        v_failures := v_failures + 1;
    END;

    IF v_failures > 0 THEN
        RAISE WARNING '[aggregate_content_stats] Completed with % failures', v_failures;
        RAISE EXCEPTION 'aggregate_content_stats failed with % errors', v_failures;
    END IF;

    INSERT INTO public.content_stats_aggregation_state (job_name, last_run_at)
    VALUES ('aggregate_content_stats', v_start_time)
    ON CONFLICT (job_name) DO UPDATE
    SET last_run_at = EXCLUDED.last_run_at;

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

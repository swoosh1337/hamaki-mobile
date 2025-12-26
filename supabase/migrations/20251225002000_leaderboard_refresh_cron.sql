-- ============================================================================
-- Migration: Create pg_cron jobs for leaderboard refresh signals
-- Purpose: Emit refresh events every 5 minutes for clients to refetch leaderboard
-- Architecture: Hybrid Event-Driven Leaderboard
-- Date: 2025-12-25
--
-- SAFE BEHAVIOR:
-- - Works on Supabase Pro
-- - Gracefully skips on Supabase Free
-- - Idempotent (safe to re-run)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Check if pg_cron is available
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_available_extensions
        WHERE name = 'pg_cron'
    ) THEN
        RAISE NOTICE 'pg_cron not available in this environment. Skipping cron setup.';
        RAISE NOTICE 'Leaderboard refresh will rely on client-side interval + realtime.';
        RETURN;
    END IF;

    -- Enable pg_cron if available
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    RAISE NOTICE 'pg_cron extension enabled';
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: Weekly leaderboard refresh signal (every 5 minutes)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'leaderboard-weekly-refresh-signal'
    ) THEN
        PERFORM cron.schedule(
            'leaderboard-weekly-refresh-signal',
            '*/5 * * * *',
            'SELECT emit_leaderboard_refresh(''weekly'')'
        );

        RAISE NOTICE 'Created cron job: leaderboard-weekly-refresh-signal';
    ELSE
        RAISE NOTICE 'Cron job already exists: leaderboard-weekly-refresh-signal';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 3: All-time leaderboard refresh signal (every 5 minutes)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'leaderboard-alltime-refresh-signal'
    ) THEN
        PERFORM cron.schedule(
            'leaderboard-alltime-refresh-signal',
            '*/5 * * * *',
            'SELECT emit_leaderboard_refresh(''all_time'')'
        );

        RAISE NOTICE 'Created cron job: leaderboard-alltime-refresh-signal';
    ELSE
        RAISE NOTICE 'Cron job already exists: leaderboard-alltime-refresh-signal';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Cleanup old refresh events (once per hour)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'leaderboard-refresh-events-cleanup'
    ) THEN
        PERFORM cron.schedule(
            'leaderboard-refresh-events-cleanup',
            '0 * * * *',
            'SELECT cleanup_old_refresh_events()'
        );

        RAISE NOTICE 'Created cron job: leaderboard-refresh-events-cleanup';
    ELSE
        RAISE NOTICE 'Cron job already exists: leaderboard-refresh-events-cleanup';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 5: Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_has_pgcron BOOLEAN;
    v_job_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) INTO v_has_pgcron;

    IF NOT v_has_pgcron THEN
        RAISE NOTICE '✓ Migration completed (pg_cron not available)';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_job_count
    FROM cron.job
    WHERE jobname IN (
        'leaderboard-weekly-refresh-signal',
        'leaderboard-alltime-refresh-signal',
        'leaderboard-refresh-events-cleanup'
    );

    IF v_job_count = 3 THEN
        RAISE NOTICE '✓ All leaderboard refresh cron jobs created successfully';
    ELSE
        RAISE NOTICE '⚠ Found %/3 cron jobs - check logs', v_job_count;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Usage:
--   SELECT jobname, schedule, active FROM cron.job;
--   SELECT cron.unschedule('leaderboard-weekly-refresh-signal');
-- ---------------------------------------------------------------------------

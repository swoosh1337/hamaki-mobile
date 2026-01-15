-- ============================================================================
-- Cron Job Setup for YouTube Video Sync
-- ============================================================================
-- This script sets up pg_cron to automatically sync YouTube videos
-- from all configured channels every 4 hours
-- ============================================================================

-- Extensions should already be enabled from previous migrations
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job if it exists (for idempotent re-runs)
SELECT cron.unschedule('sync-youtube-videos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-youtube-videos');

-- Schedule the YouTube sync job
-- Runs every 4 hours at minute 0
-- NOTE: Replace YOUR_SERVICE_ROLE_KEY with your actual service role key from:
--       Supabase Dashboard → Settings → API → service_role (secret)
SELECT cron.schedule(
    'sync-youtube-videos',                              -- Job name
    '0 */4 * * *',                                      -- Cron expression: Every 4 hours
    $$
    SELECT net.http_post(
        url := 'https://hspaxdszcnrznqehblky.supabase.co/functions/v1/sync-youtube-videos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000  -- 1 minute timeout
    ) as request_id;
    $$
);

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- View the scheduled job
SELECT
    jobid,
    jobname,
    schedule,
    active
FROM cron.job
WHERE jobname = 'sync-youtube-videos';

-- View recent job runs
SELECT
    jobid,
    runid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-youtube-videos')
ORDER BY start_time DESC
LIMIT 10;

-- ============================================================================
-- Maintenance Commands
-- ============================================================================

-- Unschedule if needed:
-- SELECT cron.unschedule('sync-youtube-videos');

-- Change to every 2 hours:
-- SELECT cron.unschedule('sync-youtube-videos');
-- SELECT cron.schedule('sync-youtube-videos', '0 */2 * * *', $$ ... $$);

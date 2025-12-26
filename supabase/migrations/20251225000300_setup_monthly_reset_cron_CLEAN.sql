-- ============================================================================
-- Cron Job Setup for Monthly Leaderboard Reset
-- ============================================================================
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Grant permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Step 3: Schedule the monthly leaderboard reset job
-- Runs on the 1st of every month at 00:00 UTC
SELECT cron.schedule(
    'monthly-leaderboard-reset',
    '0 0 1 * *',
    $$
    SELECT net.http_post(
        url := 'https://hspaxdszcnrznqehblky.supabase.co/functions/v1/monthly-leaderboard-reset',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
        ),
        body := jsonb_build_object(
            'period_key', TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM'),
            'dry_run', false
        ),
        timeout_milliseconds := 300000
    ) as request_id;
    $$
);

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- View the scheduled job
SELECT 
    jobid,
    schedule,
    command,
    active,
    database
FROM cron.job
ORDER BY jobid DESC
LIMIT 5;

-- View job run history (most recent)
SELECT 
    jobid,
    runid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- ============================================================================
-- Cron Job Setup for Monthly Leaderboard Reset
-- ============================================================================
-- This script sets up pg_cron to automatically run the monthly reset
-- on the 1st day of each month at 00:00 UTC
-- ============================================================================

-- Step 1: Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Enable pg_net extension for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Step 3: Schedule the monthly leaderboard reset job
-- This runs on the 1st of every month at 00:00 UTC
SELECT cron.schedule(
    'monthly-leaderboard-reset',                    -- Job name
    '0 0 1 * *',                                     -- Cron expression: At 00:00 on day 1 of every month
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
        timeout_milliseconds := 300000  -- 5 minute timeout
    ) as request_id;
    $$
);

-- ============================================================================
-- View and Manage Cron Jobs
-- ============================================================================

-- View all scheduled jobs
SELECT 
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    jobname
FROM cron.job
ORDER BY jobid;

-- View job run history (most recent first)
SELECT 
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobname = 'monthly-leaderboard-reset'
ORDER BY start_time DESC
LIMIT 20;

-- ============================================================================
-- Manual Testing Commands
-- ============================================================================

-- Test the cron job manually (runs immediately)
SELECT cron.schedule(
    'test-monthly-reset',
    '* * * * *',  -- Runs every minute (will auto-delete after first run)
    $$
    SELECT net.http_post(
        url := 'https://hspaxdszcnrznqehblky.supabase.co/functions/v1/monthly-leaderboard-reset',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
        ),
        body := jsonb_build_object(
            'period_key', '2025-12',  -- Test with December 2025
            'dry_run', true           -- Set to true for testing
        ),
        timeout_milliseconds := 300000
    );
    $$
);

-- Delete the test job after testing
SELECT cron.unschedule('test-monthly-reset');

-- ============================================================================
-- Maintenance Commands
-- ============================================================================

-- Unschedule the monthly reset (if needed)
SELECT cron.unschedule('monthly-leaderboard-reset');

-- Update the schedule (unschedule first, then reschedule)
-- Example: Change to 2nd of month at 01:00
SELECT cron.schedule(
    'monthly-leaderboard-reset',
    '0 1 2 * *',  -- At 01:00 on day 2 of every month
    $$ /* same command as above */ $$
);

-- ============================================================================
-- Setup Instructions
-- ============================================================================

/*
1. Replace YOUR_PROJECT_REF with your actual Supabase project reference
   Example: abcdefghijklmnop

2. Replace YOUR_SERVICE_ROLE_KEY with your service role key from:
   Supabase Dashboard → Settings → API → service_role (secret)

3. Run this script in Supabase SQL Editor (as postgres user)

4. Verify the job was created:
   SELECT * FROM cron.job WHERE jobname = 'monthly-leaderboard-reset';

5. Monitor job runs:
   SELECT * FROM cron.job_run_details 
   WHERE jobname = 'monthly-leaderboard-reset' 
   ORDER BY start_time DESC;

6. Test with dry_run first before enabling production mode
*/

-- ============================================================================
-- Cron Expression Examples
-- ============================================================================

/*
'0 0 1 * *'         -- 00:00 on the 1st of every month
'0 1 1 * *'         -- 01:00 on the 1st of every month
'30 23 * * 6'       -- 23:30 every Saturday (for weekly resets)
'0 0 15 * *'        -- 00:00 on the 15th of every month (mid-month)
'0 0 L * *'         -- 00:00 on the last day of every month
'*/5 * * * *'       -- Every 5 minutes (for testing)
*/

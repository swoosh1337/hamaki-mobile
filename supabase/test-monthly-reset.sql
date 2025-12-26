-- ============================================================================
-- MANUAL TEST: Run Monthly Reset with Dry Run
-- ============================================================================
-- This is for testing ONLY - copy and paste this into SQL Editor to test
-- ============================================================================

-- Test the edge function manually (one-time test)
SELECT cron.schedule(
    'test-monthly-reset-once',
    '* * * * *',  -- Runs every minute, will execute once then can be deleted
    $$
    SELECT net.http_post(
        url := 'https://hspaxdszcnrznqehblky.supabase.co/functions/v1/monthly-leaderboard-reset',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
        ),
        body := jsonb_build_object(
            'period_key', '2025-12',
            'dry_run', true  -- DRY RUN = no actual changes
        ),
        timeout_milliseconds := 300000
    );
    $$
);

-- Wait 1-2 minutes, then check the results
SELECT 
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobname = 'test-monthly-reset-once'
ORDER BY start_time DESC
LIMIT 1;

-- Delete the test job after testing
SELECT cron.unschedule('test-monthly-reset-once');

-- ============================================================================
-- HYBRID LEADERBOARD VERIFICATION QUERIES
-- Run these in the Supabase SQL Editor to verify database implementation
-- Date: 2025-12-25
-- ============================================================================

-- ============================================================================
-- 1. VERIFY TABLES EXIST
-- ============================================================================
SELECT 
    '✓ Table exists: ' || table_name AS result
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'leaderboard_entries',
    'leaderboard_refresh_events',
    'users'
)
ORDER BY table_name;

-- ============================================================================
-- 2. VERIFY leaderboard_entries STRUCTURE
-- ============================================================================
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'leaderboard_entries'
ORDER BY ordinal_position;

-- Expected columns:
-- user_id, game_xp, subscription_xp, video_like_xp, total_xp, created_at, updated_at

-- ============================================================================
-- 3. VERIFY leaderboard_refresh_events STRUCTURE
-- ============================================================================
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'leaderboard_refresh_events'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid), period_type (text), created_at (timestamptz)

-- ============================================================================
-- 4. VERIFY SQL FUNCTIONS EXIST
-- ============================================================================
SELECT 
    '✓ Function exists: ' || routine_name AS result,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'award_xp',
    'emit_leaderboard_refresh',
    'cleanup_old_refresh_events',
    'get_leaderboard_snapshot'
)
ORDER BY routine_name;

-- ============================================================================
-- 5. VERIFY award_xp FUNCTION
-- ============================================================================
-- Test if award_xp accepts correct parameters
SELECT 
    parameter_name,
    data_type,
    parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
AND specific_name LIKE 'award_xp%'
ORDER BY ordinal_position;

-- ============================================================================
-- 6. VERIFY CRON JOBS (if pg_cron is available)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron is available';
        
        -- This will work only if pg_cron is installed
        PERFORM 1 FROM cron.job WHERE jobname LIKE 'leaderboard%';
    ELSE
        RAISE NOTICE 'pg_cron is NOT available (Supabase Free tier). Cron jobs not checked.';
    END IF;
END $$;

-- If pg_cron is available, run this separately:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'leaderboard%';

-- ============================================================================
-- 7. VERIFY ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('leaderboard_entries', 'leaderboard_refresh_events')
ORDER BY tablename, policyname;

-- ============================================================================
-- 8. VERIFY REALTIME IS ENABLED
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    'realtime_enabled' AS status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('leaderboard_refresh_events', 'leaderboard_entries');

-- ============================================================================
-- 9. VERIFY INDEXES
-- ============================================================================
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('leaderboard_entries', 'leaderboard_refresh_events')
ORDER BY tablename, indexname;

-- ============================================================================
-- 10. SAMPLE DATA CHECK
-- ============================================================================
-- Check if leaderboard_entries has data
SELECT 
    COUNT(*) AS entry_count,
    SUM(total_xp) AS total_xp_sum,
    MAX(total_xp) AS max_xp,
    MIN(total_xp) AS min_xp
FROM leaderboard_entries;

-- Check recent refresh events
SELECT 
    id,
    period_type,
    created_at
FROM leaderboard_refresh_events
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- 11. TEST award_xp FUNCTION (DRY RUN)
-- ============================================================================
-- Note: Replace 'your-user-id' with an actual user_id to test
-- This is a read-only check - uncomment to run actual test

/*
-- First, get a valid user_id
SELECT id FROM users LIMIT 1;

-- Then test the award_xp function
SELECT * FROM award_xp(
    'your-user-id'::uuid,
    'game',
    10
);
*/

-- ============================================================================
-- 12. LEADERBOARD SNAPSHOT QUERY (what the service uses)
-- ============================================================================
SELECT 
    le.user_id,
    u.full_name,
    u.avatar_url,
    le.total_xp,
    le.game_xp,
    le.subscription_xp,
    le.video_like_xp,
    ROW_NUMBER() OVER (ORDER BY le.total_xp DESC) AS rank
FROM leaderboard_entries le
JOIN users u ON le.user_id = u.id
ORDER BY le.total_xp DESC
LIMIT 10;

-- ============================================================================
-- SUMMARY: Expected Results
-- ============================================================================
/*
If all is implemented correctly, you should see:

1. Tables: leaderboard_entries, leaderboard_refresh_events, users
2. leaderboard_entries columns: user_id, game_xp, subscription_xp, video_like_xp, total_xp
3. leaderboard_refresh_events columns: id, period_type, created_at
4. Functions: award_xp, emit_leaderboard_refresh, cleanup_old_refresh_events
5. award_xp parameters: p_user_id, p_xp_type, p_amount
6. Cron jobs (if Pro tier): leaderboard-weekly-refresh-signal, leaderboard-alltime-refresh-signal
7. RLS policies for both tables
8. Realtime enabled on leaderboard_refresh_events
9. Indexes on created_at and period_type

If any of these are missing, check the corresponding migration files.
*/

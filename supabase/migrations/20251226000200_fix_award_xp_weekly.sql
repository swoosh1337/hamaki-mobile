-- Migration: Fix award_xp for weekly/monthly leaderboard support
-- Purpose: Award XP to BOTH monthly and weekly entries
-- Date: 2025-12-26
--
-- Changes:
-- 1. Rename 'all_time' to 'monthly' (with deduplication for safety)
-- 2. Fix award_xp to upsert both period types using clean approach
-- 3. Weekly/Monthly reset only resets game_xp (subscription/video_like XP stays)
--
-- IMPORTANT: Late XP retries
-- If XP is queued and retried after a reset, it will be applied to the current
-- period. This is intentional - we accept this trade-off for simplicity.
--
-- WEEKLY RESET TIMING: Sunday 00:00 UTC (Saturday evening US time)
-- Adjust cron schedule if your product requires Monday start.

-- ============================================================================
-- Step 1: Deduplicate BEFORE renaming (safety for constraint)
-- If a user has both 'all_time' AND 'monthly' rows, merge them
-- ============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find users who have BOTH all_time and monthly entries
    FOR r IN 
        SELECT a.user_id, a.id as alltime_id, m.id as monthly_id,
               a.game_xp as a_game, a.subscription_xp as a_sub, a.video_like_xp as a_video,
               m.game_xp as m_game, m.subscription_xp as m_sub, m.video_like_xp as m_video
        FROM public.leaderboard_entries a
        JOIN public.leaderboard_entries m ON a.user_id = m.user_id
        WHERE a.period_type = 'all_time' AND m.period_type = 'monthly'
    LOOP
        -- Merge: add all_time values to monthly
        UPDATE public.leaderboard_entries
        SET game_xp = r.m_game + r.a_game,
            subscription_xp = r.m_sub + r.a_sub,
            video_like_xp = r.m_video + r.a_video,
            updated_at = NOW()
        WHERE id = r.monthly_id;
        
        -- Delete the all_time row (now merged)
        DELETE FROM public.leaderboard_entries WHERE id = r.alltime_id;
        
        RAISE NOTICE 'Merged all_time into monthly for user %', r.user_id;
    END LOOP;
END $$;

-- Step 1b: Rename remaining all_time entries (no conflict now)
UPDATE public.leaderboard_entries 
SET period_type = 'monthly' 
WHERE period_type = 'all_time';

-- ============================================================================
-- Step 2: Fix the unique constraint
-- ============================================================================
ALTER TABLE public.leaderboard_entries 
DROP CONSTRAINT IF EXISTS leaderboard_entries_user_id_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leaderboard_entries_user_period_unique'
    ) THEN
        ALTER TABLE public.leaderboard_entries 
        ADD CONSTRAINT leaderboard_entries_user_period_unique 
        UNIQUE (user_id, period_type);
    END IF;
END $$;

-- ============================================================================
-- Step 3: Update award_xp function - CLEAN with RETURNING
-- ============================================================================
CREATE OR REPLACE FUNCTION award_xp(
    p_user_id UUID,
    p_xp_type TEXT,  -- 'game' | 'subscription' | 'video_like'
    p_amount INTEGER
)
RETURNS TABLE(success BOOLEAN, new_total INTEGER, message TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_new_total INTEGER;
    v_game_delta INTEGER := 0;
    v_sub_delta INTEGER := 0;
    v_video_delta INTEGER := 0;
BEGIN
    -- Validate XP type
    IF p_xp_type NOT IN ('game', 'subscription', 'video_like') THEN
        RETURN QUERY SELECT FALSE, 0, 'Invalid XP type'::TEXT;
        RETURN;
    END IF;

    -- Validate amount
    IF p_amount < 0 THEN
        RETURN QUERY SELECT FALSE, 0, 'XP amount cannot be negative'::TEXT;
        RETURN;
    END IF;

    -- Set delta based on XP type (single source of truth)
    CASE p_xp_type
        WHEN 'game' THEN v_game_delta := p_amount;
        WHEN 'subscription' THEN v_sub_delta := p_amount;
        WHEN 'video_like' THEN v_video_delta := p_amount;
    END CASE;

    -- Upsert MONTHLY entry (with RETURNING for result)
    INSERT INTO public.leaderboard_entries (
        user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at
    )
    VALUES (
        p_user_id, 'monthly', v_game_delta, v_sub_delta, v_video_delta, NOW()
    )
    ON CONFLICT (user_id, period_type) DO UPDATE SET
        game_xp = leaderboard_entries.game_xp + v_game_delta,
        subscription_xp = leaderboard_entries.subscription_xp + v_sub_delta,
        video_like_xp = leaderboard_entries.video_like_xp + v_video_delta,
        updated_at = NOW()
    RETURNING total_xp INTO v_new_total;

    -- Upsert WEEKLY entry (no need to capture return)
    INSERT INTO public.leaderboard_entries (
        user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at
    )
    VALUES (
        p_user_id, 'weekly', v_game_delta, v_sub_delta, v_video_delta, NOW()
    )
    ON CONFLICT (user_id, period_type) DO UPDATE SET
        game_xp = leaderboard_entries.game_xp + v_game_delta,
        subscription_xp = leaderboard_entries.subscription_xp + v_sub_delta,
        video_like_xp = leaderboard_entries.video_like_xp + v_video_delta,
        updated_at = NOW();

    RETURN QUERY SELECT TRUE, v_new_total, 'XP awarded to both monthly and weekly'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION award_xp(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_xp(UUID, TEXT, INTEGER) TO service_role;

-- ============================================================================
-- Step 4: Create weekly reset function
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_weekly_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Reset ONLY game_xp for weekly entries
    -- subscription_xp and video_like_xp are permanent (never reset)
    UPDATE public.leaderboard_entries
    SET 
        game_xp = 0,
        updated_at = NOW()
    WHERE period_type = 'weekly';
    
    RAISE NOTICE 'Weekly leaderboard reset completed (game_xp only)';
END;
$$;

REVOKE ALL ON FUNCTION reset_weekly_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_weekly_leaderboard() TO service_role;

-- ============================================================================
-- Step 5: Create monthly reset function
-- Called BY the monthly-leaderboard-reset Edge Function AFTER exporting CSV
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_monthly_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Reset ONLY game_xp for monthly entries
    -- subscription_xp and video_like_xp are permanent (never reset)
    -- 
    -- ORDER: 1) Export CSV (Edge Function) -> 2) Call this -> 3) New XP for next month
    UPDATE public.leaderboard_entries
    SET 
        game_xp = 0,
        updated_at = NOW()
    WHERE period_type = 'monthly';
    
    RAISE NOTICE 'Monthly leaderboard reset completed (game_xp only)';
END;
$$;

REVOKE ALL ON FUNCTION reset_monthly_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_monthly_leaderboard() TO service_role;

-- ============================================================================
-- Step 6: Schedule weekly reset cron (Sunday 00:00 UTC)
-- Note: This is Saturday evening in US. Change to '0 0 * * 1' for Monday if needed.
-- ============================================================================
DO $$
BEGIN
    -- Check if pg_cron is actually installed (not just available)
    IF to_regclass('cron.job') IS NULL THEN
        RAISE NOTICE 'pg_cron not installed - skipping cron setup';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'weekly-leaderboard-reset'
    ) THEN
        PERFORM cron.schedule(
            'weekly-leaderboard-reset',
            '0 0 * * 0',  -- Sunday 00:00 UTC
            'SELECT reset_weekly_leaderboard()'
        );
        RAISE NOTICE 'Created cron job: weekly-leaderboard-reset';
    ELSE
        RAISE NOTICE 'Cron job already exists: weekly-leaderboard-reset';
    END IF;
END $$;

-- ============================================================================
-- Step 7: Update refresh signal cron: all_time -> monthly
-- ============================================================================
DO $$
BEGIN
    IF to_regclass('cron.job') IS NULL THEN
        RETURN;
    END IF;

    -- Unschedule old job if exists
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'leaderboard-alltime-refresh-signal'
    ) THEN
        PERFORM cron.unschedule('leaderboard-alltime-refresh-signal');
        RAISE NOTICE 'Removed old cron: leaderboard-alltime-refresh-signal';
    END IF;

    -- Create new monthly refresh signal
    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'leaderboard-monthly-refresh-signal'
    ) THEN
        PERFORM cron.schedule(
            'leaderboard-monthly-refresh-signal',
            '*/5 * * * *',
            'SELECT emit_leaderboard_refresh(''monthly'')'
        );
        RAISE NOTICE 'Created cron job: leaderboard-monthly-refresh-signal';
    END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$ 
BEGIN
    -- Check constraint
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leaderboard_entries_user_period_unique'
    ) THEN
        RAISE NOTICE '✓ Constraint leaderboard_entries_user_period_unique exists';
    ELSE
        RAISE EXCEPTION 'Migration failed: constraint not found';
    END IF;
    
    -- Check no more 'all_time' entries
    IF NOT EXISTS (
        SELECT 1 FROM public.leaderboard_entries WHERE period_type = 'all_time'
    ) THEN
        RAISE NOTICE '✓ No more all_time entries (renamed to monthly)';
    ELSE
        RAISE WARNING '⚠ Some all_time entries still exist';
    END IF;
END $$;

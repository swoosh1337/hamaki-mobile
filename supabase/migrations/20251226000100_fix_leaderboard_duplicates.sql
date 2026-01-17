-- Migration: Fix duplicate leaderboard entries and add unique constraint
-- Purpose: Prevent P0003 error in award_xp function caused by duplicate user entries
-- Date: 2025-12-26

-- Step 1: Deduplicate existing entries (keep the one with highest total_xp)
DELETE FROM public.leaderboard_entries a
USING public.leaderboard_entries b
WHERE a.user_id = b.user_id 
  AND a.ctid < b.ctid;

-- Step 2: Add unique constraint on user_id to prevent future duplicates
ALTER TABLE public.leaderboard_entries
DROP CONSTRAINT IF EXISTS leaderboard_entries_user_id_unique;

ALTER TABLE public.leaderboard_entries
ADD CONSTRAINT leaderboard_entries_user_id_unique UNIQUE (user_id);

-- Step 3: Update award_xp function to handle edge cases more safely
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
    v_row_count INTEGER;
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

    -- Update the appropriate XP column (now safe with unique constraint)
    IF p_xp_type = 'game' THEN
        UPDATE public.leaderboard_entries
        SET game_xp = game_xp + p_amount
        WHERE user_id = p_user_id
        RETURNING total_xp INTO v_new_total;
    ELSIF p_xp_type = 'subscription' THEN
        UPDATE public.leaderboard_entries
        SET subscription_xp = subscription_xp + p_amount
        WHERE user_id = p_user_id
        RETURNING total_xp INTO v_new_total;
    ELSIF p_xp_type = 'video_like' THEN
        UPDATE public.leaderboard_entries
        SET video_like_xp = video_like_xp + p_amount
        WHERE user_id = p_user_id
        RETURNING total_xp INTO v_new_total;
    END IF;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    -- Check if update was successful
    IF v_row_count = 0 THEN
        -- Entry doesn't exist, create it using ON CONFLICT for safety
        INSERT INTO public.leaderboard_entries (user_id, game_xp, subscription_xp, video_like_xp)
        VALUES (
            p_user_id,
            CASE WHEN p_xp_type = 'game' THEN p_amount ELSE 0 END,
            CASE WHEN p_xp_type = 'subscription' THEN p_amount ELSE 0 END,
            CASE WHEN p_xp_type = 'video_like' THEN p_amount ELSE 0 END
        )
        ON CONFLICT (user_id) DO UPDATE SET
            game_xp = leaderboard_entries.game_xp + CASE WHEN p_xp_type = 'game' THEN p_amount ELSE 0 END,
            subscription_xp = leaderboard_entries.subscription_xp + CASE WHEN p_xp_type = 'subscription' THEN p_amount ELSE 0 END,
            video_like_xp = leaderboard_entries.video_like_xp + CASE WHEN p_xp_type = 'video_like' THEN p_amount ELSE 0 END
        RETURNING total_xp INTO v_new_total;
    END IF;

    RETURN QUERY SELECT TRUE, v_new_total, 'XP awarded successfully'::TEXT;
END;
$$;

-- Re-grant permissions
REVOKE ALL ON FUNCTION award_xp(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_xp(UUID, TEXT, INTEGER) TO service_role;

-- Verify
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leaderboard_entries_user_id_unique'
    ) THEN
        RAISE NOTICE 'Migration completed: unique constraint added successfully';
    ELSE
        RAISE EXCEPTION 'Migration failed: unique constraint not found';
    END IF;
END $$;

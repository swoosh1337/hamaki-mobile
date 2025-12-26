-- Migration: Restructure leaderboard with separate XP sources
-- Purpose: Separate game XP (resets monthly) from permanent XP (subscriptions, video likes)
-- Date: 2025-12-25

-- Step 1: Add new XP source columns
ALTER TABLE public.leaderboard_entries
ADD COLUMN IF NOT EXISTS game_xp INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS subscription_xp INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS video_like_xp INTEGER DEFAULT 0 NOT NULL;

-- Step 2: Migrate existing points data
-- Assume all existing XP is game XP for migration purposes
-- Admins can manually adjust if needed
UPDATE public.leaderboard_entries
SET game_xp = COALESCE(points, 0)
WHERE game_xp = 0;

-- Step 3: Drop the old computed column if it exists and recreate as generated
ALTER TABLE public.leaderboard_entries
DROP COLUMN IF EXISTS total_xp;

-- Add total_xp as a GENERATED column (computed automatically)
ALTER TABLE public.leaderboard_entries
ADD COLUMN total_xp INTEGER GENERATED ALWAYS AS (game_xp + subscription_xp + video_like_xp) STORED;

-- Step 4: Update indexes
-- Drop old index on points if it exists
DROP INDEX IF EXISTS idx_leaderboard_points;

-- Create index on total_xp for efficient leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_xp 
ON public.leaderboard_entries(total_xp DESC);

-- Create partial index for game XP (for monthly reset queries)
CREATE INDEX IF NOT EXISTS idx_leaderboard_game_xp 
ON public.leaderboard_entries(game_xp) WHERE game_xp > 0;

-- Step 5: Add column comments
COMMENT ON COLUMN public.leaderboard_entries.game_xp IS 
'XP earned from playing games. Resets monthly.';

COMMENT ON COLUMN public.leaderboard_entries.subscription_xp IS  
'XP earned from channel subscriptions. Permanent, never resets.';

COMMENT ON COLUMN public.leaderboard_entries.video_like_xp IS
'XP earned from liking videos. Permanent, never resets.';

COMMENT ON COLUMN public.leaderboard_entries.total_xp IS
'Total XP (game + subscription + video_like). Auto-computed, do not update directly.';

-- Step 6: Create helper function to safely award XP
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

    -- Update the appropriate XP column
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

    -- Check if update was successful
    IF v_new_total IS NULL THEN
        -- Entry doesn't exist, create it
        INSERT INTO public.leaderboard_entries (user_id, game_xp, subscription_xp, video_like_xp)
        VALUES (
            p_user_id,
            CASE WHEN p_xp_type = 'game' THEN p_amount ELSE 0 END,
            CASE WHEN p_xp_type = 'subscription' THEN p_amount ELSE 0 END,
            CASE WHEN p_xp_type = 'video_like' THEN p_amount ELSE 0 END
        )
        RETURNING total_xp INTO v_new_total;
    END IF;

    RETURN QUERY SELECT TRUE, v_new_total, 'XP awarded successfully'::TEXT;
END;
$$;

-- Grant execute permission to service role ONLY (not authenticated users)
-- ✅ FIX: Clients should never call XP mutation functions directly
REVOKE ALL ON FUNCTION award_xp(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_xp(UUID, TEXT, INTEGER) TO service_role;

-- ✅ FIX: Add RLS policies for leaderboard_entries to prevent cheating
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Users can view leaderboard (SELECT only)
CREATE POLICY "Users can view leaderboard" ON public.leaderboard_entries
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Only service role can modify XP columns
CREATE POLICY "Service role can manage leaderboard" ON public.leaderboard_entries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ✅ REFINEMENT: Remove old 'points' column to avoid dual source of truth
ALTER TABLE public.leaderboard_entries
DROP COLUMN IF EXISTS points;

-- Verify migration
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leaderboard_entries' 
        AND column_name = 'total_xp'
    ) THEN
        RAISE NOTICE 'Leaderboard XP sources migration completed successfully';
    ELSE
        RAISE EXCEPTION 'Migration failed: total_xp column not found';
    END IF;
END $$;

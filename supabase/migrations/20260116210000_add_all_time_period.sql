-- Add all_time period tracking for lifetime XP

-- Step 1: Create all_time entries from current monthly entries (initial state)
INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at)
SELECT
    user_id,
    'all_time',
    game_xp,
    subscription_xp,
    video_like_xp,
    NOW()
FROM leaderboard_entries
WHERE period_type = 'monthly'
ON CONFLICT (user_id, period_type) DO NOTHING;

-- Step 2: Update award_xp to also award to all_time
CREATE OR REPLACE FUNCTION award_xp(
    p_user_id UUID,
    p_xp_type TEXT,
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
    IF p_xp_type NOT IN ('game', 'subscription', 'video_like') THEN
        RETURN QUERY SELECT FALSE, 0, 'Invalid XP type'::TEXT;
        RETURN;
    END IF;

    IF p_amount < 0 THEN
        RETURN QUERY SELECT FALSE, 0, 'XP amount cannot be negative'::TEXT;
        RETURN;
    END IF;

    CASE p_xp_type
        WHEN 'game' THEN v_game_delta := p_amount;
        WHEN 'subscription' THEN v_sub_delta := p_amount;
        WHEN 'video_like' THEN v_video_delta := p_amount;
    END CASE;

    -- Upsert MONTHLY entry
    INSERT INTO public.leaderboard_entries (
        user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at
    )
    VALUES (p_user_id, 'monthly', v_game_delta, v_sub_delta, v_video_delta, NOW())
    ON CONFLICT (user_id, period_type) DO UPDATE SET
        game_xp = leaderboard_entries.game_xp + v_game_delta,
        subscription_xp = leaderboard_entries.subscription_xp + v_sub_delta,
        video_like_xp = leaderboard_entries.video_like_xp + v_video_delta,
        updated_at = NOW()
    RETURNING total_xp INTO v_new_total;

    -- Upsert WEEKLY entry
    INSERT INTO public.leaderboard_entries (
        user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at
    )
    VALUES (p_user_id, 'weekly', v_game_delta, v_sub_delta, v_video_delta, NOW())
    ON CONFLICT (user_id, period_type) DO UPDATE SET
        game_xp = leaderboard_entries.game_xp + v_game_delta,
        subscription_xp = leaderboard_entries.subscription_xp + v_sub_delta,
        video_like_xp = leaderboard_entries.video_like_xp + v_video_delta,
        updated_at = NOW();

    -- Upsert ALL_TIME entry (never resets)
    INSERT INTO public.leaderboard_entries (
        user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at
    )
    VALUES (p_user_id, 'all_time', v_game_delta, v_sub_delta, v_video_delta, NOW())
    ON CONFLICT (user_id, period_type) DO UPDATE SET
        game_xp = leaderboard_entries.game_xp + v_game_delta,
        subscription_xp = leaderboard_entries.subscription_xp + v_sub_delta,
        video_like_xp = leaderboard_entries.video_like_xp + v_video_delta,
        updated_at = NOW();

    RETURN QUERY SELECT TRUE, v_new_total, 'XP awarded to monthly, weekly, and all_time'::TEXT;
END;
$$;

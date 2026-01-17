-- ============================================================================
-- Migration: Fix leaderboard_entries XP sync
-- Purpose: Sync subscription_xp and video_like_xp from users table to leaderboard
-- Date: 2026-01-15
--
-- ROOT CAUSE: Edge Functions were using onConflict: 'user_id' but constraint
-- is now (user_id, period_type), causing upserts to fail silently.
-- ============================================================================

-- Step 1: Calculate correct XP values from users table and update leaderboard

-- XP values per channel
-- Subscriptions: hamaki=1000, miro=700, bastos=700, koro=700
-- Video likes: hamaki=200, miro=100, bastos=100, koro=100

DO $$
DECLARE
    r RECORD;
    v_sub_xp INTEGER;
    v_video_xp INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting XP sync from users to leaderboard_entries...';

    FOR r IN
        SELECT
            id as user_id,
            subscription_xp_awarded,
            video_like_xp_awarded
        FROM users
        WHERE subscription_xp_awarded IS NOT NULL
           OR video_like_xp_awarded IS NOT NULL
    LOOP
        -- Calculate subscription XP
        v_sub_xp := 0;
        IF r.subscription_xp_awarded IS NOT NULL THEN
            IF (r.subscription_xp_awarded->>'hamaki')::boolean = true THEN
                v_sub_xp := v_sub_xp + 1000;
            END IF;
            IF (r.subscription_xp_awarded->>'miro')::boolean = true THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
            IF (r.subscription_xp_awarded->>'bastos')::boolean = true THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
            IF (r.subscription_xp_awarded->>'koro')::boolean = true THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
        END IF;

        -- Calculate video like XP (count videos, 4 current videos = 500 XP total)
        -- hamaki=200, others=100 each
        v_video_xp := 0;
        IF r.video_like_xp_awarded IS NOT NULL THEN
            -- Count the number of videos with true value
            -- We'll use a simplified approach: each liked video = 100 XP average
            -- For exact calculation, we'd need to map video IDs to channels
            SELECT COUNT(*) * 100 INTO v_video_xp
            FROM jsonb_each_text(r.video_like_xp_awarded)
            WHERE value = 'true';

            -- Cap at current max (4 videos: hamaki=200 + miro=100 + bastos=100 + koro=100 = 500)
            -- This handles cases where old video entries might inflate the count
            v_video_xp := LEAST(v_video_xp, 500);
        END IF;

        -- Update MONTHLY entry
        UPDATE leaderboard_entries
        SET
            subscription_xp = v_sub_xp,
            video_like_xp = v_video_xp,
            updated_at = NOW()
        WHERE user_id = r.user_id AND period_type = 'monthly';

        -- Update WEEKLY entry
        UPDATE leaderboard_entries
        SET
            subscription_xp = v_sub_xp,
            video_like_xp = v_video_xp,
            updated_at = NOW()
        WHERE user_id = r.user_id AND period_type = 'weekly';

        -- Insert if doesn't exist (monthly)
        INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp)
        SELECT r.user_id, 'monthly', 0, v_sub_xp, v_video_xp
        WHERE NOT EXISTS (
            SELECT 1 FROM leaderboard_entries
            WHERE user_id = r.user_id AND period_type = 'monthly'
        );

        -- Insert if doesn't exist (weekly)
        INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp)
        SELECT r.user_id, 'weekly', 0, v_sub_xp, v_video_xp
        WHERE NOT EXISTS (
            SELECT 1 FROM leaderboard_entries
            WHERE user_id = r.user_id AND period_type = 'weekly'
        );

        IF v_sub_xp > 0 OR v_video_xp > 0 THEN
            v_updated_count := v_updated_count + 1;
            RAISE NOTICE 'User %: sub_xp=%, video_xp=%', r.user_id, v_sub_xp, v_video_xp;
        END IF;
    END LOOP;

    RAISE NOTICE 'XP sync completed. Updated % users.', v_updated_count;
END $$;

-- Step 2: Verify the fix
SELECT
    u.email,
    le.period_type,
    le.game_xp,
    le.subscription_xp,
    le.video_like_xp,
    le.total_xp
FROM leaderboard_entries le
JOIN users u ON le.user_id = u.id
WHERE le.subscription_xp > 0 OR le.video_like_xp > 0
ORDER BY le.total_xp DESC
LIMIT 20;

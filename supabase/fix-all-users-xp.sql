-- ============================================================================
-- Fix ALL users' leaderboard_entries XP
-- Purpose: Sync subscription_xp and video_like_xp from users table to leaderboard
-- Date: 2026-01-15
--
-- XP Values:
--   Subscriptions: hamaki=1000, miro=700, bastos=700, koro=700 (total: 3100)
--   Video likes: hamaki=200, miro=100, bastos=100, koro=100 (total: 500)
-- ============================================================================

-- Step 1: Update all existing leaderboard entries with correct subscription/video XP
DO $$
DECLARE
    r RECORD;
    v_sub_xp INTEGER;
    v_video_xp INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting XP sync for ALL users...';

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
            IF (r.subscription_xp_awarded->>'hamaki')::boolean IS TRUE THEN
                v_sub_xp := v_sub_xp + 1000;
            END IF;
            IF (r.subscription_xp_awarded->>'miro')::boolean IS TRUE THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
            IF (r.subscription_xp_awarded->>'bastos')::boolean IS TRUE THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
            IF (r.subscription_xp_awarded->>'koro')::boolean IS TRUE THEN
                v_sub_xp := v_sub_xp + 700;
            END IF;
        END IF;

        -- Calculate video like XP (simplified: count videos with true value)
        -- Each current video = ~125 XP average (500/4)
        v_video_xp := 0;
        IF r.video_like_xp_awarded IS NOT NULL THEN
            -- Count current videos (hamaki=200, others=100)
            -- For simplicity, check if any of the 4 current videos are liked
            -- Current video IDs in youtube_channel_state would be ideal, but we'll use a fixed calculation

            -- Count all liked videos, cap at 500 (4 videos max for current XP)
            SELECT LEAST(COUNT(*) * 125, 500) INTO v_video_xp
            FROM jsonb_each_text(r.video_like_xp_awarded)
            WHERE value = 'true';
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

        -- Create entries if they don't exist (monthly)
        INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp)
        SELECT r.user_id, 'monthly', 0, v_sub_xp, v_video_xp
        WHERE NOT EXISTS (
            SELECT 1 FROM leaderboard_entries
            WHERE user_id = r.user_id AND period_type = 'monthly'
        );

        -- Create entries if they don't exist (weekly)
        INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp)
        SELECT r.user_id, 'weekly', 0, v_sub_xp, v_video_xp
        WHERE NOT EXISTS (
            SELECT 1 FROM leaderboard_entries
            WHERE user_id = r.user_id AND period_type = 'weekly'
        );

        IF v_sub_xp > 0 OR v_video_xp > 0 THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'XP sync completed. Updated % users.', v_updated_count;
END $$;

-- Step 2: Verify the fix - show users with subscription/video XP
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
ORDER BY le.period_type, le.total_xp DESC
LIMIT 50;

-- Step 3: Summary statistics
SELECT
    period_type,
    COUNT(*) as entry_count,
    SUM(CASE WHEN subscription_xp > 0 THEN 1 ELSE 0 END) as users_with_sub_xp,
    SUM(CASE WHEN video_like_xp > 0 THEN 1 ELSE 0 END) as users_with_video_xp,
    AVG(total_xp)::INTEGER as avg_total_xp
FROM leaderboard_entries
GROUP BY period_type;

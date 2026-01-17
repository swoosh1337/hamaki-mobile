-- ============================================================================
-- Migration: Fix video_like_xp calculation with proper channel-specific XP
-- Purpose: Correctly calculate video XP using channel mapping
-- Date: 2026-01-15
--
-- Fixes issue from previous migration where:
-- 1. Used uniform 100 XP per video (should be hamaki=200, others=100)
-- 2. Used incorrect cap logic (reset instead of LEAST)
--
-- XP values per channel:
--   hamaki: 200 XP per video
--   miro: 100 XP per video
--   bastos: 100 XP per video
--   koro: 100 XP per video
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_video_xp INTEGER;
    v_updated_count INTEGER := 0;
    v_video_id TEXT;
    v_channel_key TEXT;
BEGIN
    RAISE NOTICE 'Starting video XP recalculation with channel-specific values...';

    FOR r IN
        SELECT
            id as user_id,
            video_like_xp_awarded
        FROM users
        WHERE video_like_xp_awarded IS NOT NULL
          AND jsonb_typeof(video_like_xp_awarded) = 'object'
    LOOP
        v_video_xp := 0;

        -- Iterate through each video ID in the user's awarded videos
        FOR v_video_id IN
            SELECT key FROM jsonb_each_text(r.video_like_xp_awarded)
            WHERE value = 'true'
        LOOP
            -- Look up the channel for this video ID
            SELECT channel_key INTO v_channel_key
            FROM youtube_channel_state
            WHERE latest_video_id = v_video_id;

            -- Award XP based on channel (hamaki=200, others=100)
            IF v_channel_key = 'hamaki' THEN
                v_video_xp := v_video_xp + 200;
            ELSIF v_channel_key IS NOT NULL THEN
                v_video_xp := v_video_xp + 100;
            ELSE
                -- Video not found in current state (old video), use default 100 XP
                v_video_xp := v_video_xp + 100;
            END IF;
        END LOOP;

        -- No cap - users earn XP for every video they like over time

        -- Only update if there's a difference
        IF v_video_xp > 0 THEN
            -- Update MONTHLY entry
            UPDATE leaderboard_entries
            SET
                video_like_xp = v_video_xp,
                updated_at = NOW()
            WHERE user_id = r.user_id
              AND period_type = 'monthly'
              AND video_like_xp != v_video_xp;

            -- Update WEEKLY entry
            UPDATE leaderboard_entries
            SET
                video_like_xp = v_video_xp,
                updated_at = NOW()
            WHERE user_id = r.user_id
              AND period_type = 'weekly'
              AND video_like_xp != v_video_xp;

            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Video XP recalculation completed. Processed % users.', v_updated_count;
END $$;

-- Verify results
SELECT
    u.email,
    le.period_type,
    le.video_like_xp,
    le.total_xp
FROM leaderboard_entries le
JOIN users u ON le.user_id = u.id
WHERE le.video_like_xp > 0
ORDER BY le.video_like_xp DESC
LIMIT 10;

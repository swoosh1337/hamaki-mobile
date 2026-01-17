-- ============================================================================
-- Migration: Sync weekly leaderboard entries from monthly
-- Purpose: Fix mismatched subscription_xp and video_like_xp between periods
-- Date: 2026-01-16
--
-- ROOT CAUSE: Historical migrations deleted weekly entries; sync migration
-- didn't fully restore subscription_xp and video_like_xp for all users.
-- ============================================================================

-- Step 1: Create missing weekly entries for users who only have monthly
INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp, updated_at)
SELECT
    m.user_id,
    'weekly',
    0,  -- game_xp starts at 0 for weekly (resets each week)
    m.subscription_xp,
    m.video_like_xp,
    NOW()
FROM leaderboard_entries m
WHERE m.period_type = 'monthly'
  AND NOT EXISTS (
    SELECT 1 FROM leaderboard_entries w
    WHERE w.user_id = m.user_id AND w.period_type = 'weekly'
  );

-- Step 2: Update existing weekly entries to match monthly's subscription_xp and video_like_xp
-- These values should always be the same (permanent XP, never resets)
UPDATE leaderboard_entries w
SET
    subscription_xp = m.subscription_xp,
    video_like_xp = m.video_like_xp,
    updated_at = NOW()
FROM leaderboard_entries m
WHERE w.user_id = m.user_id
  AND w.period_type = 'weekly'
  AND m.period_type = 'monthly'
  AND (w.subscription_xp != m.subscription_xp OR w.video_like_xp != m.video_like_xp);

-- Step 3: Verify the fix - should return 0 rows
SELECT
    u.email,
    m.subscription_xp as monthly_sub,
    w.subscription_xp as weekly_sub,
    m.video_like_xp as monthly_video,
    w.video_like_xp as weekly_video
FROM leaderboard_entries m
JOIN leaderboard_entries w ON m.user_id = w.user_id AND w.period_type = 'weekly'
JOIN users u ON u.id = m.user_id
WHERE m.period_type = 'monthly'
  AND (m.subscription_xp != w.subscription_xp OR m.video_like_xp != w.video_like_xp)
LIMIT 10;

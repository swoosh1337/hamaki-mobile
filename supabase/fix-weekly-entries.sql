-- ============================================================================
-- Fix weekly leaderboard entries
-- Purpose: Ensure ALL users have weekly entries with correct subscription/video XP
-- Date: 2026-01-15
-- ============================================================================

-- Step 1: Check current state
SELECT 'Current weekly entries count:' as info, COUNT(*) as count
FROM leaderboard_entries WHERE period_type = 'weekly';

SELECT 'Current monthly entries count:' as info, COUNT(*) as count
FROM leaderboard_entries WHERE period_type = 'monthly';

-- Step 2: For each monthly entry, ensure a weekly entry exists with same subscription/video XP
-- This uses an UPSERT to either create or update the weekly entry
INSERT INTO leaderboard_entries (user_id, period_type, game_xp, subscription_xp, video_like_xp)
SELECT
    user_id,
    'weekly' as period_type,
    game_xp,  -- Copy game_xp from monthly (they should be the same for current period)
    subscription_xp,  -- These are permanent, copy from monthly
    video_like_xp     -- These are permanent, copy from monthly
FROM leaderboard_entries
WHERE period_type = 'monthly'
ON CONFLICT (user_id, period_type)
DO UPDATE SET
    subscription_xp = EXCLUDED.subscription_xp,
    video_like_xp = EXCLUDED.video_like_xp,
    updated_at = NOW();

-- Step 3: Verify specific user (Tazi)
SELECT
    'After fix - Tazi entries:' as info,
    period_type,
    game_xp,
    subscription_xp,
    video_like_xp,
    total_xp
FROM leaderboard_entries
WHERE user_id = '2cb4a6f2-e501-4a04-a399-ffc804dee7f0'
ORDER BY period_type;

-- Step 4: Verify all entries have matching subscription/video XP
SELECT
    'Mismatched entries:' as info,
    m.user_id,
    m.subscription_xp as monthly_sub,
    w.subscription_xp as weekly_sub,
    m.video_like_xp as monthly_video,
    w.video_like_xp as weekly_video
FROM leaderboard_entries m
LEFT JOIN leaderboard_entries w ON m.user_id = w.user_id AND w.period_type = 'weekly'
WHERE m.period_type = 'monthly'
  AND (w.subscription_xp IS NULL
       OR w.video_like_xp IS NULL
       OR m.subscription_xp != w.subscription_xp
       OR m.video_like_xp != w.video_like_xp)
LIMIT 20;

-- Step 5: Summary
SELECT
    period_type,
    COUNT(*) as entry_count,
    SUM(subscription_xp) as total_sub_xp,
    SUM(video_like_xp) as total_video_xp,
    AVG(total_xp)::INTEGER as avg_total_xp
FROM leaderboard_entries
GROUP BY period_type
ORDER BY period_type;

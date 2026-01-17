-- Quick fix for user Tazi Grigolia's missing subscription and video XP
-- Run this in Supabase SQL Editor

-- User ID: 2cb4a6f2-e501-4a04-a399-ffc804dee7f0
-- Expected XP:
--   subscription_xp: 3100 (hamaki=1000, miro=700, bastos=700, koro=700)
--   video_like_xp: 500 (hamaki=200, miro=100, bastos=100, koro=100)

-- Update MONTHLY entry
UPDATE leaderboard_entries
SET
    subscription_xp = 3100,
    video_like_xp = 500,
    updated_at = NOW()
WHERE user_id = '2cb4a6f2-e501-4a04-a399-ffc804dee7f0'
  AND period_type = 'monthly';

-- Update WEEKLY entry
UPDATE leaderboard_entries
SET
    subscription_xp = 3100,
    video_like_xp = 500,
    updated_at = NOW()
WHERE user_id = '2cb4a6f2-e501-4a04-a399-ffc804dee7f0'
  AND period_type = 'weekly';

-- Verify the fix
SELECT
    period_type,
    game_xp,
    subscription_xp,
    video_like_xp,
    total_xp
FROM leaderboard_entries
WHERE user_id = '2cb4a6f2-e501-4a04-a399-ffc804dee7f0';

-- Expected result:
-- period_type | game_xp | subscription_xp | video_like_xp | total_xp
-- monthly     | 146     | 3100            | 500           | 3746
-- weekly      | 146     | 3100            | 500           | 3746

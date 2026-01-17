-- Clean up duplicate leaderboard entries
-- Keep only the entry with highest total_xp for each user_id + period_type combo

-- Step 1: View the duplicates first
SELECT user_id, period_type, COUNT(*), MAX(total_xp) as max_xp
FROM leaderboard_entries
GROUP BY user_id, period_type
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicates using ROW_NUMBER (keeps row with highest total_xp)
DELETE FROM leaderboard_entries
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY user_id, period_type 
                   ORDER BY total_xp DESC, created_at DESC
               ) as rn
        FROM leaderboard_entries
    ) ranked
    WHERE rn > 1
);

-- Step 3: Verify - should return 0 duplicates now
SELECT user_id, period_type, COUNT(*)
FROM leaderboard_entries
GROUP BY user_id, period_type
HAVING COUNT(*) > 1;

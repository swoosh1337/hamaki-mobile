-- Migration: Add indexes for leaderboard scaling (5-10K users)
--
-- Problem:
-- 1. Rank calculation runs COUNT(*) with WHERE total_xp > X - needs index
-- 2. User lookups filter by (user_id, period_type) - needs composite index
-- 3. Leaderboard queries ORDER BY total_xp DESC with WHERE period_type - needs composite index
--
-- These indexes reduce O(n) table scans to O(log n) index lookups

-- =============================================================================
-- INDEX 1: Composite index for leaderboard ordering queries
-- =============================================================================
-- Used by: getLeaderboard(), getLeaderboardSnapshot(), calculatePersonalRank()
-- Query pattern: WHERE period_type = 'monthly' ORDER BY total_xp DESC
-- Without this: Full table scan on 10K+ rows
-- With this: Index scan, ~10ms -> ~1ms

CREATE INDEX IF NOT EXISTS idx_leaderboard_period_total_xp
ON leaderboard_entries(period_type, total_xp DESC);

-- =============================================================================
-- INDEX 2: Composite index for user lookups
-- =============================================================================
-- Used by: getMyLeaderboardStatus(), getCurrentUserState(), getXPBreakdown()
-- Query pattern: WHERE user_id = X AND period_type = 'monthly'
-- Without this: Sequential scan filtering by user_id
-- With this: Direct index lookup

CREATE INDEX IF NOT EXISTS idx_leaderboard_user_period
ON leaderboard_entries(user_id, period_type);

-- =============================================================================
-- INDEX 3: Partial index for active users (optional optimization)
-- =============================================================================
-- Only index users who have earned XP (excludes zeroes)
-- Reduces index size and improves cache hit rate

CREATE INDEX IF NOT EXISTS idx_leaderboard_active_monthly
ON leaderboard_entries(total_xp DESC)
WHERE period_type = 'monthly' AND total_xp > 0;

-- =============================================================================
-- Analyze tables to update query planner statistics
-- =============================================================================
ANALYZE leaderboard_entries;

-- =============================================================================
-- Verify indexes were created
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Leaderboard scaling indexes created successfully';
    RAISE NOTICE 'Indexes: idx_leaderboard_period_total_xp, idx_leaderboard_user_period, idx_leaderboard_active_monthly';
END $$;

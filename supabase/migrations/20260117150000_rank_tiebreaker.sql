-- ============================================================================
-- Rank Tie-Breaking for Leaderboard
-- ============================================================================
-- FIX: Users with the same XP can have non-deterministic rankings
--
-- Problem: When two users have the same total_xp, their ranks can flip
-- between queries because ORDER BY total_xp DESC has no secondary sort key.
--
-- Solution: Add created_at column and composite index for deterministic ordering:
-- ORDER BY total_xp DESC, created_at ASC, user_id ASC
--
-- This means: Higher XP first, then earlier entries first, then by UUID as final tiebreaker
-- ============================================================================

-- Step 1: Add created_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'leaderboard_entries'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.leaderboard_entries
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

        COMMENT ON COLUMN public.leaderboard_entries.created_at IS
            'When this leaderboard entry was created. Used for tie-breaking.';
    END IF;
END $$;

-- Step 2: Drop old index that doesn't support tie-breaking
DROP INDEX IF EXISTS idx_leaderboard_period_total_xp;

-- Step 3: Create new composite index for deterministic ranking
-- Supports: WHERE period_type = X ORDER BY total_xp DESC, created_at ASC, user_id ASC
CREATE INDEX idx_leaderboard_ranking
ON public.leaderboard_entries(period_type, total_xp DESC, created_at ASC, user_id ASC);

-- Step 4: Create partial index for active users (same optimization as before)
DROP INDEX IF EXISTS idx_leaderboard_active_monthly;
CREATE INDEX idx_leaderboard_active_ranking
ON public.leaderboard_entries(total_xp DESC, created_at ASC, user_id ASC)
WHERE period_type = 'monthly' AND total_xp > 0;

-- Step 5: Update statistics for query planner
ANALYZE public.leaderboard_entries;

-- ============================================================================
-- IMPORTANT: Code changes needed in leaderboardService.ts
-- ============================================================================
-- Update all leaderboard queries to use deterministic ordering:
--
-- BEFORE: .order('total_xp', { ascending: false })
-- AFTER:  .order('total_xp', { ascending: false })
--         .order('created_at', { ascending: true })
--         .order('user_id', { ascending: true })
--
-- This ensures ranks are stable and don't flip between requests.
-- ============================================================================

COMMENT ON INDEX idx_leaderboard_ranking IS
    'Composite index for deterministic leaderboard ranking with tie-breaking';

DO $$
BEGIN
    RAISE NOTICE 'Rank tiebreaker migration complete';
    RAISE NOTICE 'New index: idx_leaderboard_ranking (period_type, total_xp DESC, created_at ASC, user_id ASC)';
END $$;

-- ============================================================================
-- Migration: Create content_stats table for aggregated analytics
-- Purpose: Store aggregated view/play/click counts for admin dashboard
-- Date: 2026-01-15
-- ============================================================================

-- Create content_stats table
CREATE TABLE IF NOT EXISTS public.content_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,        -- 'video', 'game', 'sponsor'
    content_id TEXT NOT NULL,          -- video_id, game_id, sponsor_id
    content_name TEXT,                 -- Display name for admin
    view_count INTEGER DEFAULT 0,      -- Total views/plays/clicks
    unique_users INTEGER DEFAULT 0,    -- Unique user count
    last_interaction_at TIMESTAMPTZ,
    period_start DATE,                 -- For period-based stats (NULL = all-time)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    -- NOTE: Unique constraint moved to functional index below to handle NULL period_start
);

-- Deduplicate existing rows before creating unique index
-- Keep the row with the highest view_count (or most recent if tied)
DELETE FROM public.content_stats a
USING public.content_stats b
WHERE a.id < b.id
  AND a.content_type = b.content_type
  AND a.content_id = b.content_id
  AND COALESCE(a.period_start, '1970-01-01'::DATE) = COALESCE(b.period_start, '1970-01-01'::DATE)
  AND (a.view_count < b.view_count OR (a.view_count = b.view_count AND a.updated_at < b.updated_at));

-- Also remove any remaining duplicates (keep the one with larger id)
DELETE FROM public.content_stats a
USING public.content_stats b
WHERE a.id < b.id
  AND a.content_type = b.content_type
  AND a.content_id = b.content_id
  AND COALESCE(a.period_start, '1970-01-01'::DATE) = COALESCE(b.period_start, '1970-01-01'::DATE);

-- Create unique index that handles NULL period_start correctly
-- In SQL, NULL != NULL, so a regular UNIQUE constraint allows duplicate rows where period_start IS NULL
-- Using COALESCE with a sentinel date ('1970-01-01') treats NULL as a consistent value for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_stats_unique
    ON public.content_stats (content_type, content_id, COALESCE(period_start, '1970-01-01'::DATE));

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_content_stats_type ON public.content_stats(content_type);
CREATE INDEX IF NOT EXISTS idx_content_stats_content_id ON public.content_stats(content_id);
CREATE INDEX IF NOT EXISTS idx_content_stats_period ON public.content_stats(period_start);
CREATE INDEX IF NOT EXISTS idx_content_stats_type_period ON public.content_stats(content_type, period_start);

-- Enable Row Level Security
ALTER TABLE public.content_stats ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read stats
CREATE POLICY "Allow authenticated read access to content_stats"
    ON public.content_stats
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow service role to manage stats (for cron job)
CREATE POLICY "Allow service role full access to content_stats"
    ON public.content_stats
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.content_stats TO authenticated;
GRANT ALL ON public.content_stats TO service_role;

-- Add comment
COMMENT ON TABLE public.content_stats IS 'Aggregated analytics stats for admin dashboard - populated by hourly cron job';

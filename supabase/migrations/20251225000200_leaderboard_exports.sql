-- Migration: Create leaderboard_exports table
-- Purpose: Track monthly/weekly export metadata for auditing and idempotency
-- Date: 2025-12-25

-- Create exports table
CREATE TABLE IF NOT EXISTS public.leaderboard_exports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'weekly', 'custom')),
    period_key TEXT NOT NULL,  -- e.g., '2025-12' for December 2025
    file_path TEXT NOT NULL,   -- Storage path: leaderboard-exports/monthly/2025-12.csv
    row_count INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,              -- SHA-256 of CSV content for audit verification
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'succeeded', 'failed')),
    error TEXT,                 -- Error message if status = 'failed'
    reset_completed_at TIMESTAMPTZ,  -- When game_xp was reset (NULL if not yet reset)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- ✅ FIX: One row per period, status is a state of that row
    CONSTRAINT unique_period UNIQUE (period_type, period_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_exports_period 
ON public.leaderboard_exports(period_type, period_key);

CREATE INDEX IF NOT EXISTS idx_exports_status 
ON public.leaderboard_exports(status);

CREATE INDEX IF NOT EXISTS idx_exports_created 
ON public.leaderboard_exports(created_at DESC);

-- Add comments
COMMENT ON TABLE public.leaderboard_exports IS
'Tracks leaderboard export metadata for monthly/weekly snapshots. Used for auditing and preventing duplicate exports.';

COMMENT ON COLUMN public.leaderboard_exports.period_key IS
'Identifier for the period being exported. Format: YYYY-MM for monthly, YYYY-WW for weekly.';

COMMENT ON COLUMN public.leaderboard_exports.reset_completed_at IS
'Timestamp when game_xp was reset to 0. NULL means export succeeded but reset not yet performed.';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_leaderboard_exports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_leaderboard_exports_updated_at ON public.leaderboard_exports;
CREATE TRIGGER trigger_update_leaderboard_exports_updated_at
    BEFORE UPDATE ON public.leaderboard_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_leaderboard_exports_updated_at();

-- Enable Row Level Security
ALTER TABLE public.leaderboard_exports ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Only service role can insert/update exports
CREATE POLICY "Service role can manage exports" ON public.leaderboard_exports
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can view exports (for admin dashboard)
CREATE POLICY "Users can view exports" ON public.leaderboard_exports
    FOR SELECT
    TO authenticated
    USING (true);

-- Grant permissions
GRANT SELECT ON public.leaderboard_exports TO authenticated;
GRANT ALL ON public.leaderboard_exports TO service_role;

-- Create helper function to get current period key
CREATE OR REPLACE FUNCTION get_current_period_key(p_period_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_period_type = 'monthly' THEN
        -- Return YYYY-MM format
        RETURN TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    ELSIF p_period_type = 'weekly' THEN
        -- Return YYYY-WW format (ISO week)
        RETURN TO_CHAR(CURRENT_DATE, 'IYYY-IW');
    ELSE
        RETURN TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    END IF;
END;
$$;

-- Create helper function to check if period needs export
CREATE OR REPLACE FUNCTION needs_period_export(
    p_period_type TEXT,
    p_period_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_export_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.leaderboard_exports
        WHERE period_type = p_period_type
        AND period_key = p_period_key
        AND status = 'succeeded'
    ) INTO v_export_exists;
    
    RETURN NOT v_export_exists;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_current_period_key(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION needs_period_export(TEXT, TEXT) TO authenticated, service_role;

-- Verify migration
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' 
        AND table_name = 'leaderboard_exports'
    ) THEN
        RAISE NOTICE 'Leaderboard exports table created successfully';
    ELSE
        RAISE EXCEPTION 'Migration failed: leaderboard_exports table not created';
    END IF;
END $$;

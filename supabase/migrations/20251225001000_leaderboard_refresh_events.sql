-- Migration: Create leaderboard_refresh_events table
-- Purpose: Low-frequency signal for clients to refresh global leaderboard
-- Part of Hybrid Leaderboard implementation (see documentation/hybrid-leaderboard-plan.md)
-- Date: 2025-12-25

-- Create refresh events table
-- Cron job INSERTs one row every 5 minutes
-- Clients subscribe to INSERTs only (low frequency, no per-XP spam)
CREATE TABLE IF NOT EXISTS public.leaderboard_refresh_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'all_time')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for efficient subscription queries
CREATE INDEX IF NOT EXISTS idx_refresh_events_created
ON public.leaderboard_refresh_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refresh_events_period
ON public.leaderboard_refresh_events(period_type, created_at DESC);

-- Add table comment
COMMENT ON TABLE public.leaderboard_refresh_events IS
'Low-frequency refresh signals for hybrid leaderboard. Cron emits one row every 5 minutes. Clients subscribe to INSERTs to trigger global leaderboard refresh.';

COMMENT ON COLUMN public.leaderboard_refresh_events.period_type IS
'The leaderboard period being refreshed: weekly, monthly, or all_time';

-- Enable Row Level Security
ALTER TABLE public.leaderboard_refresh_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can subscribe to refresh events (SELECT only)
CREATE POLICY "Users can view refresh events" ON public.leaderboard_refresh_events
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Only service role can emit refresh events (INSERT)
CREATE POLICY "Service role can emit refresh events" ON public.leaderboard_refresh_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.leaderboard_refresh_events TO authenticated, anon;
GRANT INSERT ON public.leaderboard_refresh_events TO service_role;

-- Enable realtime for this table
-- Note: Realtime must be enabled in Supabase dashboard or via alter publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_refresh_events;

-- Create helper function to emit a refresh event
CREATE OR REPLACE FUNCTION emit_leaderboard_refresh(p_period_type TEXT DEFAULT 'all_time')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Validate period type
    IF p_period_type NOT IN ('weekly', 'monthly', 'all_time') THEN
        RAISE EXCEPTION 'Invalid period_type: %', p_period_type;
    END IF;

    -- Insert refresh event
    INSERT INTO public.leaderboard_refresh_events (period_type)
    VALUES (p_period_type)
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION emit_leaderboard_refresh(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION emit_leaderboard_refresh(TEXT) TO service_role;

-- Create cleanup function to remove old events (keep last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_refresh_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.leaderboard_refresh_events
    WHERE created_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION cleanup_old_refresh_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_refresh_events() TO service_role;

-- Verify migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'leaderboard_refresh_events'
    ) THEN
        RAISE NOTICE 'leaderboard_refresh_events table created successfully';
    ELSE
        RAISE EXCEPTION 'Migration failed: leaderboard_refresh_events table not created';
    END IF;
END $$;

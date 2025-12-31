-- ============================================================================
-- Migration: Create edge_idempotency_keys table for database-backed idempotency
-- Purpose: Prevent duplicate XP awards during retries across multiple Edge Function instances
-- Architecture: Edge Function Retry Queue System
-- Date: 2025-12-26
--
-- CRITICAL: In-memory idempotency is invalid in production because:
-- 1. Multiple Edge Function instances don't share memory
-- 2. Cold starts lose in-memory state
-- 3. Retries from different devices hit different instances
--
-- This table provides:
-- - PRIMARY KEY enforces idempotency (duplicate inserts fail with 23505)
-- - TTL-based cleanup keeps table small
-- - Works across all Edge Function instances
-- ============================================================================

-- Create idempotency keys table
CREATE TABLE IF NOT EXISTS public.edge_idempotency_keys (
    -- PRIMARY KEY enforces idempotency: duplicate inserts fail with error code 23505
    -- Format: {function}:{userId}:{gameId}:{sessionId}:{amount}
    key TEXT PRIMARY KEY,

    -- User who initiated the request (for debugging and cleanup)
    -- Using public.users to match existing codebase pattern
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Which Edge Function this key is for
    function_name TEXT NOT NULL,

    -- When the key was created
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When the key expires (for cleanup)
    -- Default 5 minutes - enough to cover retry windows
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),

    -- Ensure expires_at is always after created_at
    CONSTRAINT expires_after_created CHECK (expires_at > created_at)
);

-- Index for efficient TTL cleanup
CREATE INDEX IF NOT EXISTS idx_edge_idempotency_expires
ON public.edge_idempotency_keys(expires_at);

-- Index for querying by user (debugging)
CREATE INDEX IF NOT EXISTS idx_edge_idempotency_user
ON public.edge_idempotency_keys(user_id, created_at DESC);

-- Index for querying by function (monitoring)
CREATE INDEX IF NOT EXISTS idx_edge_idempotency_function
ON public.edge_idempotency_keys(function_name, created_at DESC);

-- Add table comment
COMMENT ON TABLE public.edge_idempotency_keys IS
'Database-backed idempotency for Edge Functions. PRIMARY KEY on "key" prevents duplicate processing (error 23505). Keys expire after 5 minutes.';

COMMENT ON COLUMN public.edge_idempotency_keys.key IS
'Unique idempotency key. Format: {function}:{userId}:{gameId}:{sessionId}:{amount}. Duplicate inserts fail with 23505.';

COMMENT ON COLUMN public.edge_idempotency_keys.expires_at IS
'When this key expires and can be cleaned up. Default 5 minutes from creation.';

-- Enable Row Level Security
ALTER TABLE public.edge_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Note: service_role bypasses RLS entirely in Supabase.
-- This policy exists for documentation and in case RLS enforcement changes.
CREATE POLICY "Service role manages idempotency keys"
ON public.edge_idempotency_keys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant permissions to service role only
GRANT ALL ON public.edge_idempotency_keys TO service_role;

-- ---------------------------------------------------------------------------
-- Cleanup function: Remove expired idempotency keys
-- Should be called by cron job every hour
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.edge_idempotency_keys
    WHERE expires_at < NOW();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION cleanup_expired_idempotency_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_idempotency_keys() TO service_role;

COMMENT ON FUNCTION cleanup_expired_idempotency_keys() IS
'Removes expired idempotency keys. Should be called by hourly cron job.';

-- ---------------------------------------------------------------------------
-- Cron job for cleanup (if pg_cron available)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        RAISE NOTICE 'pg_cron not available. Manual cleanup required or use external cron.';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'cleanup-idempotency-keys'
    ) THEN
        PERFORM cron.schedule(
            'cleanup-idempotency-keys',
            '0 * * * *',  -- Every hour at minute 0
            'SELECT cleanup_expired_idempotency_keys()'
        );
        RAISE NOTICE 'Created cron job: cleanup-idempotency-keys';
    ELSE
        RAISE NOTICE 'Cron job already exists: cleanup-idempotency-keys';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'edge_idempotency_keys'
    ) THEN
        RAISE NOTICE '✓ edge_idempotency_keys table created successfully';
    ELSE
        RAISE EXCEPTION 'Migration failed: edge_idempotency_keys table not created';
    END IF;
END $$;

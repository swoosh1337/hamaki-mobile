-- ============================================================================
-- Cron Job Monitoring
-- ============================================================================
-- Purpose: Track cron job executions for monitoring and alerting
--
-- This allows us to:
-- 1. See when jobs ran and if they succeeded
-- 2. Track execution times for performance monitoring
-- 3. Store error details for debugging
-- 4. Set up alerts for failed jobs
-- ============================================================================

-- Create cron_job_logs table
CREATE TABLE IF NOT EXISTS public.cron_job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
    result JSONB,
    error_message TEXT,
    duration_ms INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN completed_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
            ELSE NULL
        END
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by job name and time
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name_started
ON public.cron_job_logs (job_name, started_at DESC);

-- Index for finding recent failures
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_status
ON public.cron_job_logs (status) WHERE status = 'error';

-- Enable RLS
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can access cron logs
CREATE POLICY "Service role has full access to cron_job_logs"
ON public.cron_job_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Admins can read cron logs
CREATE POLICY "Admins can read cron_job_logs"
ON public.cron_job_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- ============================================================================
-- Helper Functions for Cron Job Logging
-- ============================================================================

-- Start a cron job run (returns log_id to be used for completion)
CREATE OR REPLACE FUNCTION public.start_cron_job(
    p_job_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.cron_job_logs (job_name, status)
    VALUES (p_job_name, 'running')
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Complete a cron job run (success)
CREATE OR REPLACE FUNCTION public.complete_cron_job(
    p_log_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_affected_row_count INTEGER := 0;
BEGIN
    UPDATE public.cron_job_logs
    SET
        completed_at = now(),
        status = 'success',
        result = p_result
    WHERE id = p_log_id;

    GET DIAGNOSTICS v_affected_row_count = ROW_COUNT;
    IF v_affected_row_count = 0 THEN
        RAISE EXCEPTION 'complete_cron_job: no cron_job_logs row found for id %', p_log_id;
    END IF;
END;
$$;

-- Fail a cron job run (error)
CREATE OR REPLACE FUNCTION public.fail_cron_job(
    p_log_id UUID,
    p_error_message TEXT,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cron_job_logs
    SET
        completed_at = now(),
        status = 'error',
        error_message = p_error_message,
        result = p_result
    WHERE id = p_log_id;
END;
$$;

-- Get recent cron job runs (for admin dashboard)
CREATE OR REPLACE FUNCTION public.get_cron_job_stats(
    p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    job_name TEXT,
    total_runs BIGINT,
    successful_runs BIGINT,
    failed_runs BIGINT,
    avg_duration_ms NUMERIC,
    last_run_at TIMESTAMPTZ,
    last_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH recent_runs AS (
        SELECT *
        FROM public.cron_job_logs
        WHERE started_at > now() - (p_hours || ' hours')::INTERVAL
    ),
    stats AS (
        SELECT
            r.job_name,
            COUNT(*) as total_runs,
            COUNT(*) FILTER (WHERE r.status = 'success') as successful_runs,
            COUNT(*) FILTER (WHERE r.status = 'error') as failed_runs,
            AVG(r.duration_ms) as avg_duration_ms
        FROM recent_runs r
        GROUP BY r.job_name
    ),
    latest AS (
        SELECT DISTINCT ON (job_name)
            job_name,
            started_at as last_run_at,
            status as last_status
        FROM public.cron_job_logs
        ORDER BY job_name, started_at DESC
    )
    SELECT
        s.job_name,
        s.total_runs,
        s.successful_runs,
        s.failed_runs,
        s.avg_duration_ms,
        l.last_run_at,
        l.last_status
    FROM stats s
    JOIN latest l ON s.job_name = l.job_name
    ORDER BY s.job_name;
END;
$$;

-- Clean up old cron job logs (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_cron_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM public.cron_job_logs
        WHERE created_at < now() - INTERVAL '30 days'
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN v_deleted;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE public.cron_job_logs IS 'Tracks cron job executions for monitoring and alerting';
COMMENT ON FUNCTION public.start_cron_job(TEXT) IS 'Start tracking a cron job execution';
COMMENT ON FUNCTION public.complete_cron_job(UUID, JSONB) IS 'Mark a cron job as successfully completed';
COMMENT ON FUNCTION public.fail_cron_job(UUID, TEXT, JSONB) IS 'Mark a cron job as failed with error';
COMMENT ON FUNCTION public.get_cron_job_stats(INTEGER) IS 'Get cron job statistics for the last N hours';
COMMENT ON FUNCTION public.cleanup_old_cron_logs() IS 'Remove old cron job logs older than given number of days (or hours)';

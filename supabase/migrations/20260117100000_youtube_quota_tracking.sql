-- YouTube API Quota Usage Tracking
-- Tracks daily quota usage by operation type for monitoring and admin display
-- YouTube Data API v3 has 10,000 units/day limit

-- Daily aggregated quota usage table
CREATE TABLE IF NOT EXISTS youtube_quota_daily (
    id SERIAL PRIMARY KEY,
    usage_date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,

    -- Per-operation tracking (units used)
    subscriptions_list_units INTEGER DEFAULT 0,  -- 1 unit per page
    videos_get_rating_units INTEGER DEFAULT 0,   -- 1 unit per batch
    search_list_units INTEGER DEFAULT 0,         -- 100 units per call

    -- Totals
    total_units INTEGER DEFAULT 0,

    -- Call counts (for average calculations)
    subscriptions_list_calls INTEGER DEFAULT 0,
    videos_get_rating_calls INTEGER DEFAULT 0,
    search_list_calls INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups by date
CREATE INDEX IF NOT EXISTS idx_youtube_quota_date ON youtube_quota_daily(usage_date DESC);

-- Function to log quota usage (called by Edge Functions)
CREATE OR REPLACE FUNCTION log_youtube_quota_usage(
    p_operation TEXT,
    p_units INTEGER
)
RETURNS void AS $$
BEGIN
    -- Upsert today's record
    INSERT INTO youtube_quota_daily (usage_date)
    VALUES (CURRENT_DATE)
    ON CONFLICT (usage_date) DO NOTHING;

    -- Update the appropriate column based on operation
    IF p_operation = 'subscriptions.list' THEN
        UPDATE youtube_quota_daily
        SET subscriptions_list_units = subscriptions_list_units + p_units,
            subscriptions_list_calls = subscriptions_list_calls + 1,
            total_units = total_units + p_units,
            updated_at = NOW()
        WHERE usage_date = CURRENT_DATE;
    ELSIF p_operation = 'videos.getRating' THEN
        UPDATE youtube_quota_daily
        SET videos_get_rating_units = videos_get_rating_units + p_units,
            videos_get_rating_calls = videos_get_rating_calls + 1,
            total_units = total_units + p_units,
            updated_at = NOW()
        WHERE usage_date = CURRENT_DATE;
    ELSIF p_operation = 'search.list' THEN
        UPDATE youtube_quota_daily
        SET search_list_units = search_list_units + p_units,
            search_list_calls = search_list_calls + 1,
            total_units = total_units + p_units,
            updated_at = NOW()
        WHERE usage_date = CURRENT_DATE;
    ELSE
        -- Generic fallback - just add to total
        UPDATE youtube_quota_daily
        SET total_units = total_units + p_units,
            updated_at = NOW()
        WHERE usage_date = CURRENT_DATE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get current quota status (for admin)
CREATE OR REPLACE FUNCTION get_youtube_quota_status()
RETURNS TABLE(
    usage_date DATE,
    total_units_used INTEGER,
    remaining_units INTEGER,
    usage_percentage NUMERIC,
    subscriptions_list_units INTEGER,
    subscriptions_list_calls INTEGER,
    videos_get_rating_units INTEGER,
    videos_get_rating_calls INTEGER,
    search_list_units INTEGER,
    search_list_calls INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_daily_limit INTEGER := 10000;
BEGIN
    -- Ensure today's record exists
    INSERT INTO youtube_quota_daily (usage_date)
    VALUES (CURRENT_DATE)
    ON CONFLICT (usage_date) DO NOTHING;

    RETURN QUERY
    SELECT
        q.usage_date,
        q.total_units,
        GREATEST(0, v_daily_limit - q.total_units),
        ROUND((q.total_units::NUMERIC / v_daily_limit) * 100, 2),
        q.subscriptions_list_units,
        q.subscriptions_list_calls,
        q.videos_get_rating_units,
        q.videos_get_rating_calls,
        q.search_list_units,
        q.search_list_calls,
        q.updated_at
    FROM youtube_quota_daily q
    WHERE q.usage_date = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to get quota history (for admin charts)
CREATE OR REPLACE FUNCTION get_youtube_quota_history(p_days INTEGER DEFAULT 7)
RETURNS TABLE(
    usage_date DATE,
    total_units INTEGER,
    subscriptions_list_units INTEGER,
    videos_get_rating_units INTEGER,
    search_list_units INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.usage_date,
        q.total_units,
        q.subscriptions_list_units,
        q.videos_get_rating_units,
        q.search_list_units
    FROM youtube_quota_daily q
    WHERE q.usage_date >= CURRENT_DATE - p_days
    ORDER BY q.usage_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION log_youtube_quota_usage(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_youtube_quota_status() TO service_role;
GRANT EXECUTE ON FUNCTION get_youtube_quota_history(INTEGER) TO service_role;

-- RLS policies - only service role can access
ALTER TABLE youtube_quota_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to quota tracking"
    ON youtube_quota_daily
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

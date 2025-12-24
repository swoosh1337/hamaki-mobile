-- Create youtube_subscription_verifications table
-- Stores per-user, per-channel subscription verification state
-- Once verified with subscribed=true, XP is awarded and never re-checked automatically

CREATE TABLE IF NOT EXISTS youtube_subscription_verifications (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    channel_key TEXT NOT NULL,  -- 'hamaki', 'miro', 'bastos', 'koro'
    subscribed BOOLEAN NOT NULL DEFAULT FALSE,
    xp_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, channel_id),
    
    -- Constraint: Cannot award XP if not subscribed
    CONSTRAINT valid_xp_state CHECK (
        (subscribed = false AND xp_awarded = false)
        OR
        (subscribed = true)
    )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_verifications_user 
    ON youtube_subscription_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_verifications_channel_key 
    ON youtube_subscription_verifications(channel_key);

-- Enable Row Level Security
ALTER TABLE youtube_subscription_verifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own verifications
CREATE POLICY "Users can read own subscription verifications"
    ON youtube_subscription_verifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access"
    ON youtube_subscription_verifications FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON youtube_subscription_verifications TO authenticated;
GRANT ALL ON youtube_subscription_verifications TO service_role;

-- Drop existing table and recreate youtube_channel_state
-- This table stores the latest video per channel (server-side sync)

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.youtube_channel_state CASCADE;

-- Create youtube_channel_state table (1 row per channel, stores latest video only)
CREATE TABLE public.youtube_channel_state (
    channel_id TEXT PRIMARY KEY,
    channel_key TEXT NOT NULL UNIQUE,  -- 'hamaki', 'miro', 'bastos', 'koro'
    channel_name TEXT NOT NULL,
    latest_video_id TEXT,
    latest_video_title TEXT,
    latest_video_thumbnail TEXT,
    latest_video_published_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial channels with their YouTube channel IDs
INSERT INTO public.youtube_channel_state (channel_id, channel_key, channel_name) VALUES
    ('UCSI5XbaxsX1USijrfFVuJqA', 'hamaki', 'HamaKi'),
    ('UChJnB_7-JUYXEr-Fv3Y_rGA', 'miro', 'Miro'),
    ('UCjSZIjLKfQHkdZbZMvYQhAw', 'bastos', 'Basto'),
    ('UCPCQmO5MrP3S1oVu6p9bxRw', 'koro', 'Koro');

-- Create index for ordering by latest video
CREATE INDEX idx_youtube_channel_state_published ON public.youtube_channel_state(latest_video_published_at DESC);

-- Enable Row Level Security
ALTER TABLE public.youtube_channel_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow read access to channel state" ON public.youtube_channel_state;
DROP POLICY IF EXISTS "Allow service role to update channel state" ON public.youtube_channel_state;

-- Allow authenticated users to read channel state
CREATE POLICY "Allow read access to channel state" ON public.youtube_channel_state
    FOR SELECT USING (true);

-- Allow service role to update (for Edge Function)
CREATE POLICY "Allow service role to update channel state" ON public.youtube_channel_state
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.youtube_channel_state TO authenticated;
GRANT SELECT ON public.youtube_channel_state TO anon;
GRANT ALL ON public.youtube_channel_state TO service_role;

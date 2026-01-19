-- ============================================================================
-- Video Like XP Award Tracking
-- ============================================================================
-- CRITICAL SECURITY FIX: Prevent double-awarding XP for video likes
--
-- Problem: Users could unlike and re-like videos to get XP multiple times
-- Solution: Track all video like awards in a dedicated table with DB-level uniqueness
--
-- This replaces the JSON column approach (video_like_xp_awarded) with a proper
-- relational table that enforces uniqueness at the database level.
-- ============================================================================

-- Step 1: Create the tracking table (idempotent)
-- References public.users instead of auth.users to handle all existing users
CREATE TABLE IF NOT EXISTS public.user_video_like_awards (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite primary key ensures one award per user per video
    PRIMARY KEY (user_id, video_id)
);

-- Step 2: Ensure columns and constraints exist without destructive changes
ALTER TABLE public.user_video_like_awards
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS video_id TEXT,
    ADD COLUMN IF NOT EXISTS channel_key TEXT,
    ADD COLUMN IF NOT EXISTS xp_awarded INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.user_video_like_awards
    ALTER COLUMN xp_awarded SET DEFAULT 0,
    ALTER COLUMN awarded_at SET DEFAULT NOW();

ALTER TABLE public.user_video_like_awards
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN video_id SET NOT NULL,
    ALTER COLUMN channel_key SET NOT NULL,
    ALTER COLUMN xp_awarded SET NOT NULL,
    ALTER COLUMN awarded_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_video_like_awards_pkey'
          AND conrelid = 'public.user_video_like_awards'::regclass
    ) THEN
        ALTER TABLE public.user_video_like_awards
            ADD CONSTRAINT user_video_like_awards_pkey PRIMARY KEY (user_id, video_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_video_like_awards_user_id_fkey'
          AND conrelid = 'public.user_video_like_awards'::regclass
    ) THEN
        ALTER TABLE public.user_video_like_awards
            ADD CONSTRAINT user_video_like_awards_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 3: Add comments
COMMENT ON TABLE public.user_video_like_awards IS 'Tracks video like XP awards. Primary key prevents double-awarding.';
COMMENT ON COLUMN public.user_video_like_awards.user_id IS 'User who received the award';
COMMENT ON COLUMN public.user_video_like_awards.video_id IS 'YouTube video ID that was liked';
COMMENT ON COLUMN public.user_video_like_awards.channel_key IS 'Channel key (hamaki, miro, bastos, koro)';
COMMENT ON COLUMN public.user_video_like_awards.xp_awarded IS 'Amount of XP awarded';
COMMENT ON COLUMN public.user_video_like_awards.awarded_at IS 'When the XP was awarded';

-- Step 4: Enable RLS
ALTER TABLE public.user_video_like_awards ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies

-- Users can read their own awards (for UI display)
DROP POLICY IF EXISTS "Users can read own video like awards" ON public.user_video_like_awards;
CREATE POLICY "Users can read own video like awards"
    ON public.user_video_like_awards FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access (for Edge Functions)
DROP POLICY IF EXISTS "Service role full access to video like awards" ON public.user_video_like_awards;
CREATE POLICY "Service role full access to video like awards"
    ON public.user_video_like_awards FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Step 6: Grant permissions
GRANT SELECT ON public.user_video_like_awards TO authenticated;
GRANT ALL ON public.user_video_like_awards TO service_role;

-- Step 7: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_video_like_awards_awarded_at
    ON public.user_video_like_awards(awarded_at DESC);

-- Step 8: Migrate existing data from users.video_like_xp_awarded JSON column
-- This preserves existing awards so users don't get double XP
INSERT INTO public.user_video_like_awards (user_id, video_id, channel_key, xp_awarded)
SELECT
    u.id AS user_id,
    kv.key AS video_id,
    'unknown' AS channel_key,
    0 AS xp_awarded
FROM public.users u
CROSS JOIN LATERAL jsonb_each_text(u.video_like_xp_awarded) AS kv(key, value)
WHERE u.video_like_xp_awarded IS NOT NULL
  AND u.video_like_xp_awarded != '{}'::jsonb
  AND (kv.value)::boolean = true
ON CONFLICT (user_id, video_id) DO NOTHING;

-- ============================================================================
-- NOTE: After migration is complete and verify-video-likes Edge Function is
-- updated, the video_like_xp_awarded column on users table can be deprecated.
-- We keep it for now for backwards compatibility.
-- ============================================================================

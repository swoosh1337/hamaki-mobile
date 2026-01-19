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
DO $$
DECLARE
    user_record RECORD;
    video_key TEXT;
    video_awarded BOOLEAN;
BEGIN
    -- Loop through users with video_like_xp_awarded data
    FOR user_record IN
        SELECT id, video_like_xp_awarded
        FROM public.users
        WHERE video_like_xp_awarded IS NOT NULL
        AND video_like_xp_awarded != '{}'::jsonb
    LOOP
        -- Loop through each video in the JSON object
        FOR video_key, video_awarded IN
            SELECT key, value::boolean
            FROM jsonb_each_text(user_record.video_like_xp_awarded)
        LOOP
            IF video_awarded THEN
                -- Insert into new tracking table (ignore conflicts)
                INSERT INTO public.user_video_like_awards (user_id, video_id, channel_key, xp_awarded)
                VALUES (user_record.id, video_key, 'unknown', 0)
                ON CONFLICT (user_id, video_id) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Migrated existing video like awards to new tracking table';
END $$;

-- ============================================================================
-- NOTE: After migration is complete and verify-video-likes Edge Function is
-- updated, the video_like_xp_awarded column on users table can be deprecated.
-- We keep it for now for backwards compatibility.
-- ============================================================================

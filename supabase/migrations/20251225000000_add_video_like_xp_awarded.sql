-- Migration: Add video_like_xp_awarded column to users table
-- Purpose: Store which video IDs have been awarded XP to prevent duplicate awards
-- Date: 2025-12-25

-- Add JSONB column to track video like XP awards
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS video_like_xp_awarded JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_users_video_like_xp_awarded 
ON public.users USING gin (video_like_xp_awarded);

-- Add column comment for documentation
COMMENT ON COLUMN public.users.video_like_xp_awarded IS 
'JSONB object tracking which video IDs have been awarded XP. Format: {"videoId": true}. Used to prevent duplicate XP awards for the same video.';

-- Verify column was added
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'video_like_xp_awarded'
    ) THEN
        RAISE NOTICE 'Column video_like_xp_awarded successfully added to users table';
    ELSE
        RAISE EXCEPTION 'Failed to add video_like_xp_awarded column';
    END IF;
END $$;

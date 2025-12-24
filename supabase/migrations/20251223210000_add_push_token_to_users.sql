-- Migration: Add push token support to users table
-- Created: 2024-12-23

-- Add expo_push_token column and push_notifications_enabled flag
ALTER TABLE users
ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT true;

-- Create index for efficient querying of users with push tokens
CREATE INDEX IF NOT EXISTS idx_users_push_token 
ON users(expo_push_token) 
WHERE expo_push_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.expo_push_token IS 'Expo push notification token for this user device';
COMMENT ON COLUMN users.push_notifications_enabled IS 'Whether user has enabled push notifications';

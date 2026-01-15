-- DIAGNOSTIC: Why did duplicate videos get inserted?
-- Run this in Supabase SQL Editor to understand the issue

-- 1. First, let's see ALL video posts with their full metadata
SELECT 
    id,
    title,
    created_at,
    published_at,
    metadata->>'videoId' as video_id,
    metadata->>'channelId' as channel_id,  -- THIS IS KEY: if NULL, the bug occurs
    metadata->>'channelName' as channel_name,
    metadata
FROM content_posts
WHERE type = 'video'
ORDER BY created_at DESC;

-- 2. Find duplicates by videoId
SELECT 
    metadata->>'videoId' as video_id,
    COUNT(*) as duplicate_count,
    array_agg(id) as post_ids,
    array_agg(created_at ORDER BY created_at) as created_dates,
    array_agg(metadata->>'channelId') as channel_ids  -- Shows if channelId was missing
FROM content_posts
WHERE type = 'video'
GROUP BY metadata->>'videoId'
HAVING COUNT(*) > 1;

-- 3. THE ROOT CAUSE CHECK: Videos missing channelId in metadata
-- If channelId is NULL, the sync function couldn't match it to delete before inserting new
SELECT 
    id,
    title,
    created_at,
    metadata->>'videoId' as video_id,
    metadata->>'channelId' as channel_id,
    CASE 
        WHEN metadata->>'channelId' IS NULL THEN '⚠️ MISSING channelId - BUG CAUSE!'
        ELSE '✅ Has channelId'
    END as diagnosis
FROM content_posts
WHERE type = 'video'
ORDER BY created_at DESC;

-- 4. Specific diagnosis for Bastos channel duplicates
SELECT 
    id,
    title,
    created_at,
    metadata->>'videoId' as video_id,
    metadata->>'channelId' as channel_id,
    metadata->>'channelName' as channel_name,
    CASE 
        WHEN metadata->>'channelId' = 'UCjSZIjLKfQHkdZbZMvYQhAw' THEN 'Bastos (by ID)'
        WHEN metadata->>'channelName' = 'Bastos' THEN 'Bastos (by name)'
        ELSE 'Other channel'
    END as channel_match
FROM content_posts
WHERE type = 'video'
  AND (
    metadata->>'channelId' = 'UCjSZIjLKfQHkdZbZMvYQhAw'  -- Bastos channel ID
    OR metadata->>'channelName' = 'Bastos'
    OR title LIKE '%საოცარი დამთხვევები%'  -- The duplicate video title
  )
ORDER BY created_at DESC;

-- EXPLANATION:
-- The bug happened because:
-- 1. The sync function checks: metadata?.channelId === channelId
-- 2. If an old video had NO channelId in metadata (only videoId), it wouldn't match
-- 3. So the sync thought this was a "new" video and inserted it again
-- 
-- THE FIX (already applied):
-- Now the sync checks: metadata?.channelId === channelId || metadata?.videoId === newVideoId
-- This means it will find existing videos by EITHER channelId OR videoId

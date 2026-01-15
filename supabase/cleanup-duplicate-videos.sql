-- Fix duplicate videos from Bastos channel
-- This script identifies and removes duplicate video posts, keeping only the most recent one

-- First, let's see the duplicates (run SELECT first to verify)
SELECT 
    id,
    title,
    type,
    metadata->>'channelId' as channel_id,
    metadata->>'channelName' as channel_name,
    metadata->>'videoId' as video_id,
    published_at,
    created_at
FROM content_posts
WHERE type = 'video'
ORDER BY metadata->>'channelId', created_at DESC;

-- Find duplicate video IDs (same videoId appearing multiple times)
SELECT 
    metadata->>'videoId' as video_id,
    metadata->>'channelName' as channel_name,
    COUNT(*) as count
FROM content_posts
WHERE type = 'video'
GROUP BY metadata->>'videoId', metadata->>'channelName'
HAVING COUNT(*) > 1;

-- Delete older duplicates, keeping the newest one for each videoId
-- Run this AFTER verifying the above queries show the duplicates
DELETE FROM content_posts
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            metadata->>'videoId' as video_id,
            ROW_NUMBER() OVER (
                PARTITION BY metadata->>'videoId' 
                ORDER BY created_at DESC
            ) as rn
        FROM content_posts
        WHERE type = 'video'
    ) ranked
    WHERE rn > 1
);

-- Alternative: Delete by specific title if you know the duplicate
-- DELETE FROM content_posts 
-- WHERE title = 'საოცარი დამთხვევები (მილიარდში ერთი)'
-- AND id NOT IN (
--     SELECT id FROM content_posts 
--     WHERE title = 'საოცარი დამთხვევები (მილიარდში ერთი)'
--     ORDER BY created_at DESC
--     LIMIT 1
-- );

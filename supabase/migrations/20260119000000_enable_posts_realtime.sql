-- Enable realtime for posts table (already enabled, skip if exists)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

-- Set replica identity to full so DELETE events include the old row data
ALTER TABLE public.posts REPLICA IDENTITY FULL;

-- Enable realtime for post_upvotes table
-- This allows the mobile app to re-sort posts when upvotes change
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_upvotes;
ALTER TABLE public.post_upvotes REPLICA IDENTITY FULL;

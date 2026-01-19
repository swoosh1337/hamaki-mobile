-- ============================================================================
-- Migration: Create atomic delete function for posts cleanup
-- Purpose: Wrap post deletion in a transaction to prevent orphaned upvotes
-- Date: 2026-01-17
-- ============================================================================

-- Function to atomically delete posts and their upvotes
-- Both deletes happen in a single transaction - if either fails, both roll back
CREATE OR REPLACE FUNCTION delete_posts_with_upvotes(p_post_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete upvotes first (child records)
    DELETE FROM post_upvotes
    WHERE post_id = ANY(p_post_ids);

    -- Delete posts (parent records)
    DELETE FROM posts
    WHERE id = ANY(p_post_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION delete_posts_with_upvotes(UUID[]) TO service_role;

-- Add comment
COMMENT ON FUNCTION delete_posts_with_upvotes(UUID[]) IS 'Atomically deletes posts and their related upvotes in a single transaction';

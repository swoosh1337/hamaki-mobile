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
    v_upvotes_deleted INTEGER;
    v_posts_deleted INTEGER;
BEGIN
    -- Delete upvotes first (child records)
    DELETE FROM post_upvotes
    WHERE post_id = ANY(p_post_ids);

    GET DIAGNOSTICS v_upvotes_deleted = ROW_COUNT;

    -- Delete posts (parent records)
    DELETE FROM posts
    WHERE id = ANY(p_post_ids);

    GET DIAGNOSTICS v_posts_deleted = ROW_COUNT;

    -- Return posts deleted count (primary metric for callers)
    -- Upvotes are automatically cleaned up as part of the transaction
    RETURN v_posts_deleted;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION delete_posts_with_upvotes(UUID[]) TO service_role;

-- Add comment
COMMENT ON FUNCTION delete_posts_with_upvotes(UUID[]) IS 'Atomically deletes posts and their related upvotes in a single transaction';

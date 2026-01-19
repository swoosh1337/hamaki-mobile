/**
 * usePosts Hook
 * 
 * Manages community posts state including fetching, pagination,
 * upvoting, and creating posts.
 */

import { postService } from '@/services/supabase/postService';
import type { PostSortOption, PostWithAuthor } from '@/types';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('Hook:Posts');

interface UsePostsOptions {
    /** User ID for upvote tracking */
    userId?: string;
    /** Sort order: 'upvotes' (default) or 'latest' */
    sortBy?: PostSortOption;
    /** Number of posts per page */
    limit?: number;
    /** Auto-fetch on mount */
    autoFetch?: boolean;
}

interface UsePostsReturn {
    /** List of posts */
    posts: PostWithAuthor[];
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /** Whether more posts are available */
    hasMore: boolean;
    /** Refresh posts from start */
    refetch: () => Promise<void>;
    /** Load next page */
    loadMore: () => Promise<void>;
    /** Upvote a post */
    upvote: (postId: string) => Promise<boolean>;
    /** Remove upvote from a post */
    removeUpvote: (postId: string) => Promise<boolean>;
    /** Check if a post is upvoted */
    isUpvoted: (postId: string) => boolean;
}

export function usePosts(options: UsePostsOptions = {}): UsePostsReturn {
    const {
        userId,
        sortBy = 'upvotes',
        limit = 20,
        autoFetch = true,
    } = options;

    const [posts, setPosts] = useState<PostWithAuthor[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    /**
     * Fetch posts from the server
     */
    const fetchPosts = useCallback(async (reset = false) => {
        if (!userId) {
            log.warn('No userId provided, skipping fetch');
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const newOffset = reset ? 0 : offset;
            log.debug(`Fetching posts: offset=${newOffset}, limit=${limit}, sortBy=${sortBy}`);

            const data = await postService.getApprovedPostsWithUserUpvotes(
                userId,
                limit,
                newOffset,
                sortBy
            );

            if (reset) {
                setPosts(data);
                setOffset(data.length);
            } else {
                setPosts(prev => [...prev, ...data]);
                setOffset(prev => prev + data.length);
            }

            setHasMore(data.length === limit);
            log.debug(`Fetched ${data.length} posts, hasMore=${data.length === limit}`);
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to fetch posts');
            log.error('Error fetching posts', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }, [userId, offset, limit, sortBy]);

    /**
     * Refresh posts from the beginning
     */
    const refetch = useCallback(async () => {
        setOffset(0);
        setHasMore(true);
        await fetchPosts(true);
    }, [fetchPosts]);

    /**
     * Load more posts (pagination)
     */
    const loadMore = useCallback(async () => {
        if (!isLoading && hasMore) {
            await fetchPosts(false);
        }
    }, [isLoading, hasMore, fetchPosts]);

    /**
     * Upvote a post
     */
    const upvote = useCallback(async (postId: string): Promise<boolean> => {
        if (!userId) {
            log.warn('Cannot upvote without userId');
            return false;
        }

        // Get current post state for rollback
        const currentPost = posts.find(p => p.id === postId);
        if (!currentPost) {
            log.warn('Post not found for upvote', { postId });
            return false;
        }

        // Optimistic update - immediately show the upvote
        const optimisticUpvotes = currentPost.upvotes + 1;
        setPosts(prev => {
            const updated = prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: optimisticUpvotes, isUpvoted: true }
                    : post
            );
            // Re-sort if sorting by upvotes
            if (sortBy === 'upvotes') {
                return [...updated].sort((a, b) => {
                    if (b.upvotes !== a.upvotes) {
                        return b.upvotes - a.upvotes;
                    }
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });
            }
            return updated;
        });

        try {
            const updatedPost = await postService.upvotePost(postId, userId);
            if (updatedPost) {
                // Confirm with server value (in case of discrepancy)
                setPosts(prev => {
                    const updated = prev.map(post =>
                        post.id === postId
                            ? { ...post, upvotes: updatedPost.upvotes, isUpvoted: true }
                            : post
                    );
                    if (sortBy === 'upvotes') {
                        return [...updated].sort((a, b) => {
                            if (b.upvotes !== a.upvotes) {
                                return b.upvotes - a.upvotes;
                            }
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        });
                    }
                    return updated;
                });
                log.debug('Upvoted post confirmed', { postId, newUpvotes: updatedPost.upvotes });
                return true;
            }
            // Rollback on failure
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: currentPost.upvotes, isUpvoted: currentPost.isUpvoted }
                    : post
            ));
            return false;
        } catch (err) {
            log.error('Failed to upvote post', err, { postId });
            // Rollback on error
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: currentPost.upvotes, isUpvoted: currentPost.isUpvoted }
                    : post
            ));
            return false;
        }
    }, [userId, sortBy, posts]);

    /**
     * Remove upvote from a post
     */
    const removeUpvote = useCallback(async (postId: string): Promise<boolean> => {
        if (!userId) {
            log.warn('Cannot remove upvote without userId');
            return false;
        }

        // Get current post state for rollback
        const currentPost = posts.find(p => p.id === postId);
        if (!currentPost) {
            log.warn('Post not found for removeUpvote', { postId });
            return false;
        }

        // Optimistic update - immediately show the removal
        const optimisticUpvotes = Math.max(0, currentPost.upvotes - 1);
        setPosts(prev => {
            const updated = prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: optimisticUpvotes, isUpvoted: false }
                    : post
            );
            // Re-sort if sorting by upvotes
            if (sortBy === 'upvotes') {
                return [...updated].sort((a, b) => {
                    if (b.upvotes !== a.upvotes) {
                        return b.upvotes - a.upvotes;
                    }
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });
            }
            return updated;
        });

        try {
            const updatedPost = await postService.removeUpvote(postId, userId);
            if (updatedPost) {
                // Confirm with server value (in case of discrepancy)
                setPosts(prev => {
                    const updated = prev.map(post =>
                        post.id === postId
                            ? { ...post, upvotes: updatedPost.upvotes, isUpvoted: false }
                            : post
                    );
                    if (sortBy === 'upvotes') {
                        return [...updated].sort((a, b) => {
                            if (b.upvotes !== a.upvotes) {
                                return b.upvotes - a.upvotes;
                            }
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        });
                    }
                    return updated;
                });
                log.debug('Removed upvote confirmed', { postId, newUpvotes: updatedPost.upvotes });
                return true;
            }
            // Rollback on failure
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: currentPost.upvotes, isUpvoted: currentPost.isUpvoted }
                    : post
            ));
            return false;
        } catch (err) {
            log.error('Failed to remove upvote from post', err, { postId });
            // Rollback on error
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, upvotes: currentPost.upvotes, isUpvoted: currentPost.isUpvoted }
                    : post
            ));
            return false;
        }
    }, [userId, sortBy, posts]);

    /**
     * Check if a post is upvoted by the current user
     */
    const isUpvoted = useCallback((postId: string): boolean => {
        const post = posts.find(p => p.id === postId);
        return post?.isUpvoted ?? false;
    }, [posts]);

    // Auto-fetch on mount and when sortBy changes
    useEffect(() => {
        if (autoFetch && userId) {
            refetch();
        }
    }, [sortBy, userId]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        posts,
        isLoading,
        error,
        hasMore,
        refetch,
        loadMore,
        upvote,
        removeUpvote,
        isUpvoted,
    };
}

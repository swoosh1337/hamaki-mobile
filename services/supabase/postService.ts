/**
 * Post Service
 * 
 * Handles all post-related database operations.
 * No React dependencies - pure data access layer.
 */

import type { CreatePostInput, Post, PostSortOption, PostWithAuthor } from '@/types';
import { createLogger } from '@/utils/logger';
import { supabase } from './client';

const log = createLogger('Service:Post');

/**
 * Post service for community posts management
 */
export const postService = {
    /**
     * Create a new user post
     */
    async createPost(input: CreatePostInput): Promise<Post | null> {
        const { userId, title, content, category } = input;

        // Validate post content
        if (!title || title.length < 5 || title.length > 100) {
            throw new Error('Title must be between 5 and 100 characters');
        }
        if (!content || content.length < 10 || content.length > 1000) {
            throw new Error('Content must be between 10 and 1000 characters');
        }

        try {
            const postData: Record<string, unknown> = {
                user_id: userId,
                title,
                content,
                status: 'pending', // All new posts start as pending
                upvotes: 0,
            };

            if (category) {
                postData.category = category;
            }

            const { data, error } = await supabase
                .from('posts')
                .insert(postData)
                .select()
                .single();

            if (error) {
                log.error('Error creating user post:', error);
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error creating user post:', error);
            if (error instanceof Error && (
                error.message.includes('Title must be between') ||
                error.message.includes('Content must be between')
            )) {
                throw error;
            }
            return null;
        }
    },

    /**
     * Get user's approved posts with pagination
     */
    async getUserPosts(userId: string, limit = 10, offset = 0): Promise<Post[]> {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'approved')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                log.error('Error fetching user posts:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            log.error('Error fetching user posts:', error);
            return [];
        }
    },

    /**
     * Get approved posts sorted by upvotes
     */
    async getApprovedPosts(limit = 20, offset = 0): Promise<Post[]> {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .eq('status', 'approved')
                .order('upvotes', { ascending: false })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                log.error('Error fetching approved posts:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            log.error('Error fetching approved posts:', error);
            return [];
        }
    },

    /**
     * Get approved posts with user upvote status for Ideas tab
     */
    async getApprovedPostsWithUserUpvotes(
        userId: string,
        limit = 20,
        offset = 0,
        sortBy: PostSortOption = 'upvotes'
    ): Promise<PostWithAuthor[]> {
        try {
            // Build query with user information
            let query = supabase
                .from('posts')
                .select(`
          *,
          users!posts_user_id_fkey(full_name, avatar_url)
        `)
                .eq('status', 'approved');

            // Apply sorting based on sortBy parameter
            if (sortBy === 'latest') {
                query = query.order('created_at', { ascending: false });
            } else {
                query = query
                    .order('upvotes', { ascending: false })
                    .order('created_at', { ascending: false });
            }

            const { data: posts, error: postsError } = await query
                .range(offset, offset + limit - 1);

            if (postsError) {
                log.error('Error fetching approved posts:', postsError);
                return [];
            }

            if (!posts || posts.length === 0) {
                return [];
            }

            // Get user's upvotes for these posts
            const postIds = posts.map(p => p.id);
            const { data: upvotes, error: upvotesError } = await supabase
                .from('post_upvotes')
                .select('post_id')
                .eq('user_id', userId)
                .in('post_id', postIds);

            if (upvotesError) {
                log.error('Error fetching user upvotes:', upvotesError);
                // Continue without upvote status rather than failing completely
            }

            // Combine the data
            const upvotedPostIds = new Set(upvotes?.map(u => u.post_id) || []);

            return posts.map(post => ({
                ...post,
                isUpvoted: upvotedPostIds.has(post.id),
                user: Array.isArray(post.users) ? post.users[0] : post.users,
            }));
        } catch (error) {
            log.error('Error fetching approved posts with upvotes:', error);
            return [];
        }
    },

    /**
     * Upvote a post
     */
    async upvotePost(postId: string, userId: string): Promise<Post | null> {
        try {
            // Check if user has already upvoted this post
            const { data: existingUpvote } = await supabase
                .from('post_upvotes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .single();

            if (existingUpvote) {
                throw new Error('User has already upvoted this post');
            }

            // Insert upvote record
            const { error: upvoteError } = await supabase
                .from('post_upvotes')
                .insert({
                    post_id: postId,
                    user_id: userId,
                });

            if (upvoteError) {
                log.error('Error inserting upvote:', upvoteError);
                return null;
            }

            // Update upvotes count on post
            const newCount = await this.getPostUpvoteCount(postId);
            const { data, error } = await supabase
                .from('posts')
                .update({
                    upvotes: newCount,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', postId)
                .select()
                .single();

            if (error) {
                log.error('Error updating post upvotes:', error);
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error upvoting post:', error);
            if (error instanceof Error && error.message === 'User has already upvoted this post') {
                throw error;
            }
            return null;
        }
    },

    /**
     * Remove upvote from a post
     */
    async removeUpvote(postId: string, userId: string): Promise<Post | null> {
        try {
            // Check if user has upvoted this post
            const { data: existingUpvote } = await supabase
                .from('post_upvotes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .single();

            if (!existingUpvote) {
                throw new Error('User has not upvoted this post');
            }

            // Remove upvote record
            const { error: removeError } = await supabase
                .from('post_upvotes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', userId);

            if (removeError) {
                log.error('Error removing upvote:', removeError);
                return null;
            }

            // Update upvotes count on post
            const newCount = await this.getPostUpvoteCount(postId);
            const { data, error } = await supabase
                .from('posts')
                .update({
                    upvotes: newCount,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', postId)
                .select()
                .single();

            if (error) {
                log.error('Error updating post upvotes:', error);
                return null;
            }

            return data;
        } catch (error) {
            log.error('Error removing upvote:', error);
            if (error instanceof Error && error.message === 'User has not upvoted this post') {
                throw error;
            }
            return null;
        }
    },

    /**
     * Get current upvote count for a post
     */
    async getPostUpvoteCount(postId: string): Promise<number> {
        try {
            const { count, error } = await supabase
                .from('post_upvotes')
                .select('id', { count: 'exact' })
                .eq('post_id', postId);

            if (error) {
                log.error('Error getting upvote count:', error);
                return 0;
            }

            return count || 0;
        } catch (error) {
            log.error('Error getting upvote count:', error);
            return 0;
        }
    },
};

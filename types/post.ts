/**
 * Post-related type definitions
 */

/**
 * Post status enum
 */
export type PostStatus = 'pending' | 'approved' | 'rejected';

/**
 * User post stored in the database
 */
export interface Post {
    id: string;
    user_id: string;
    title: string;
    content: string;
    category?: string;
    status: PostStatus;
    upvotes: number;
    approved_at?: string;
    approved_by?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Post with author information (for display)
 */
export interface PostWithAuthor extends Post {
    isUpvoted?: boolean;
    user?: {
        full_name: string;
        avatar_url?: string;
    };
}

/**
 * Input for creating a new post
 */
export interface CreatePostInput {
    userId: string;
    title: string;
    content: string;
    category?: string;
}

/**
 * Post upvote record
 */
export interface PostUpvote {
    id: string;
    post_id: string;
    user_id: string;
    created_at: string;
}

/**
 * Sort options for posts
 */
export type PostSortOption = 'upvotes' | 'latest';

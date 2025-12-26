/**
 * Content Sorting Utilities
 * 
 * Reusable sorting functions for content posts following the hybrid ranking system:
 * - Admin-pinned posts (featured_order < 100) come first, sorted by order
 * - Auto-ranked posts (featured_order >= 100) sorted by publish date (newest first)
 */

import { ADMIN_FEATURED_ORDER_THRESHOLD, NEW_BADGE_DURATION_MS } from '@/constants/content';

/**
 * Post with featured order and publish date for sorting
 */
interface SortablePost {
    featuredOrder: number;
    publishedAt: string;
}

/**
 * Sort posts using hybrid ranking:
 * 1. Admin-pinned posts (featured_order < threshold) come first, sorted by order
 * 2. Auto-ranked posts (featured_order >= threshold) sorted by publish date (newest first)
 * 
 * @param posts Array of posts to sort
 * @returns New sorted array (does not mutate original)
 */
export function sortPostsHybrid<T extends SortablePost>(posts: T[]): T[] {
    return [...posts].sort((a, b) => {
        const aIsAdminRanked = a.featuredOrder < ADMIN_FEATURED_ORDER_THRESHOLD;
        const bIsAdminRanked = b.featuredOrder < ADMIN_FEATURED_ORDER_THRESHOLD;

        // Admin-ranked posts come before auto-ranked
        if (aIsAdminRanked && !bIsAdminRanked) return -1;
        if (!aIsAdminRanked && bIsAdminRanked) return 1;

        // Both admin-ranked: sort by featured_order (lower first)
        if (aIsAdminRanked && bIsAdminRanked) {
            return a.featuredOrder - b.featuredOrder;
        }

        // Both auto-ranked: sort by publish date (newest first)
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
}

/**
 * Check if a post should show the "NEW" badge
 * 
 * @param publishedAt ISO date string of when post was published
 * @returns true if post was published within the NEW_BADGE_DURATION_MS window
 */
export function isNewPost(publishedAt: string): boolean {
    return new Date(publishedAt).getTime() > Date.now() - NEW_BADGE_DURATION_MS;
}

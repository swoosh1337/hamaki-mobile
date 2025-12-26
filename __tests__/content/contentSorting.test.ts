/**
 * Content Sorting Tests
 *
 * Comprehensive tests for the hybrid ranking system:
 * - Admin-pinned posts (featured_order < 100) come first
 * - Auto-ranked posts (featured_order >= 100) sorted by publish date
 * - NEW badge displayed for videos published within 24 hours
 */

import { describe, expect, it } from '@jest/globals';

// Constants matching the production code
const ADMIN_THRESHOLD = 100;

/**
 * Hybrid sorting function matching ContentContext.tsx logic
 */
function sortPostsHybrid<T extends { featuredOrder: number; publishedAt: string }>(posts: T[]): T[] {
    return [...posts].sort((a, b) => {
        const aIsAdminRanked = a.featuredOrder < ADMIN_THRESHOLD;
        const bIsAdminRanked = b.featuredOrder < ADMIN_THRESHOLD;

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

// Helper to check if post should show NEW badge
function isNewPost(publishedAt: string): boolean {
    return new Date(publishedAt).getTime() > Date.now() - 24 * 60 * 60 * 1000;
}

describe('Hybrid Ranking System', () => {
    describe('Admin-Pinned Posts Priority', () => {
        it('should place admin-ranked posts (order < 100) before auto-ranked posts', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Auto Video 1' },
                { featuredOrder: 1, publishedAt: '2025-12-20T12:00:00Z', title: 'Admin Pinned' },
                { featuredOrder: 100, publishedAt: '2025-12-24T12:00:00Z', title: 'Auto Video 2' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Admin Pinned');
            expect(sorted[0].featuredOrder).toBeLessThan(ADMIN_THRESHOLD);
        });

        it('should sort multiple admin-ranked posts by featured_order', () => {
            const posts = [
                { featuredOrder: 3, publishedAt: '2025-12-20T12:00:00Z', title: 'Third' },
                { featuredOrder: 1, publishedAt: '2025-12-18T12:00:00Z', title: 'First' },
                { featuredOrder: 2, publishedAt: '2025-12-25T12:00:00Z', title: 'Second' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('First');
            expect(sorted[1].title).toBe('Second');
            expect(sorted[2].title).toBe('Third');
        });

        it('should place all admin posts before all auto posts regardless of date', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Auto - Newest' },
                { featuredOrder: 99, publishedAt: '2025-01-01T12:00:00Z', title: 'Admin - Very Old' },
                { featuredOrder: 100, publishedAt: '2025-12-20T12:00:00Z', title: 'Auto - Older' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Admin - Very Old');
            expect(sorted[1].title).toBe('Auto - Newest');
            expect(sorted[2].title).toBe('Auto - Older');
        });
    });

    describe('Auto-Ranked Posts Sorting', () => {
        it('should sort auto-ranked posts by publish date (newest first)', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-20T12:00:00Z', title: 'Oldest' },
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Newest' },
                { featuredOrder: 100, publishedAt: '2025-12-22T12:00:00Z', title: 'Middle' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Newest');
            expect(sorted[1].title).toBe('Middle');
            expect(sorted[2].title).toBe('Oldest');
        });

        it('should handle posts with same featured_order but different dates', () => {
            const posts = [
                { featuredOrder: 150, publishedAt: '2025-12-24T12:00:00Z', title: 'B' },
                { featuredOrder: 150, publishedAt: '2025-12-25T12:00:00Z', title: 'A' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('A'); // Newer
            expect(sorted[1].title).toBe('B'); // Older
        });
    });

    describe('Threshold Boundary Cases', () => {
        it('should treat featured_order 99 as admin-ranked', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Auto' },
                { featuredOrder: 99, publishedAt: '2025-12-20T12:00:00Z', title: 'Admin Edge' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Admin Edge');
        });

        it('should treat featured_order 100 as auto-ranked', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-20T12:00:00Z', title: 'Auto 100' },
                { featuredOrder: 1, publishedAt: '2025-12-25T12:00:00Z', title: 'Admin 1' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Admin 1');
            expect(sorted[1].title).toBe('Auto 100');
        });
    });

    describe('Real-World Carousel Scenarios', () => {
        it('should show HamaKi video first if admin sets featured_order=1', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Basto New Video', channel: 'basto' },
                { featuredOrder: 1, publishedAt: '2025-12-20T12:00:00Z', title: 'HamaKi Video', channel: 'hamaki' },
                { featuredOrder: 100, publishedAt: '2025-12-24T12:00:00Z', title: 'Koro Video', channel: 'koro' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('HamaKi Video');
        });

        it('should order: pinned announcement, then videos by date', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'New Video' },
                { featuredOrder: 5, publishedAt: '2025-12-01T12:00:00Z', title: 'Pinned Announcement' },
                { featuredOrder: 100, publishedAt: '2025-12-24T12:00:00Z', title: 'Older Video' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Pinned Announcement');
            expect(sorted[1].title).toBe('New Video');
            expect(sorted[2].title).toBe('Older Video');
        });

        it('should maintain correct order when new video is published', () => {
            // Simulating: Admin pinned HamaKi at 1, Basto publishes new video
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T14:00:00Z', title: 'Basto Latest' },
                { featuredOrder: 1, publishedAt: '2025-12-20T12:00:00Z', title: 'HamaKi Pinned' },
                { featuredOrder: 100, publishedAt: '2025-12-25T10:00:00Z', title: 'Koro Video' },
                { featuredOrder: 100, publishedAt: '2025-12-24T12:00:00Z', title: 'Miro Video' },
            ];

            const sorted = sortPostsHybrid(posts);

            // Order: HamaKi (pinned), Basto (newest auto), Koro, Miro
            expect(sorted[0].title).toBe('HamaKi Pinned');
            expect(sorted[1].title).toBe('Basto Latest');
            expect(sorted[2].title).toBe('Koro Video');
            expect(sorted[3].title).toBe('Miro Video');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty array', () => {
            const sorted = sortPostsHybrid([]);
            expect(sorted).toEqual([]);
        });

        it('should handle single item', () => {
            const posts = [{ featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Only' }];
            const sorted = sortPostsHybrid(posts);
            expect(sorted[0].title).toBe('Only');
        });

        it('should not modify original array', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'B' },
                { featuredOrder: 1, publishedAt: '2025-12-20T12:00:00Z', title: 'A' },
            ];
            const originalFirstTitle = posts[0].title;

            sortPostsHybrid(posts);

            expect(posts[0].title).toBe(originalFirstTitle);
        });

        it('should handle featured_order of 0', () => {
            const posts = [
                { featuredOrder: 100, publishedAt: '2025-12-25T12:00:00Z', title: 'Auto' },
                { featuredOrder: 0, publishedAt: '2025-12-20T12:00:00Z', title: 'Super High Priority' },
            ];

            const sorted = sortPostsHybrid(posts);

            expect(sorted[0].title).toBe('Super High Priority');
        });
    });

    describe('NEW Badge Logic', () => {
        it('should return true for posts published within 24 hours', () => {
            const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
            expect(isNewPost(recentDate)).toBe(true);
        });

        it('should return true for posts published just now', () => {
            expect(isNewPost(new Date().toISOString())).toBe(true);
        });

        it('should return false for posts older than 24 hours', () => {
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
            expect(isNewPost(oldDate)).toBe(false);
        });

        it('should return false for posts from several days ago', () => {
            const oldDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            expect(isNewPost(oldDate)).toBe(false);
        });
    });
});

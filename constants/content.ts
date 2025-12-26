/**
 * Content Constants
 * 
 * Constants related to content posts, featured items, and carousel behavior.
 */

/**
 * Threshold for admin-set featured_order vs auto-ranked
 * - Values < 100: Admin-pinned content (sorted by featured_order)
 * - Values >= 100: Auto-ranked content (sorted by publish date)
 */
export const ADMIN_FEATURED_ORDER_THRESHOLD = 100;

/**
 * Duration in milliseconds for "NEW" badge visibility
 * Posts published within this time window show the badge
 */
export const NEW_BADGE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

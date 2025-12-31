/**
 * Leaderboard-related type definitions
 */

/**
 * Period types for leaderboard
 * - weekly: Resets every Sunday (no CSV export)
 * - monthly: Resets monthly (CSV export saved to bucket)
 */
export type LeaderboardPeriod = 'weekly' | 'monthly';

/**
 * XP breakdown by source
 */
export interface XPBreakdown {
    game: number;
    subscription: number;
    videoLike: number;
    total: number;
}

/**
 * Result from award-xp Edge Function
 *
 * This is the response format from the server when awarding XP.
 * It includes the new total and personal rank for instant UI updates.
 *
 * IMPORTANT: When `duplicate: true`, the XP was NOT applied again (idempotency).
 * The response still contains the current authoritative state for reconciliation.
 */
export interface AwardXPResult {
    /** Whether the request was processed successfully */
    success: boolean;
    /** True if this was a duplicate request (XP already awarded for this idempotency key) */
    duplicate?: boolean;
    /** Current total XP after this award (authoritative from server) */
    new_total_xp: number;
    /** Current rank (authoritative from server) */
    personal_rank: number;
    /** XP breakdown by source */
    xp_breakdown: {
        game: number;
        subscription: number;
        video_like: number;
    };
}

/**
 * Leaderboard entry in the database
 */
export interface LeaderboardEntry {
    id: string;
    user_id: string;
    points: number;
    period_type: LeaderboardPeriod;
    week_start_date?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Leaderboard entry with user info for display
 */
export interface LeaderboardEntryWithUser extends LeaderboardEntry {
    user: {
        id: string;
        full_name: string;
        avatar_url?: string;
    };
}

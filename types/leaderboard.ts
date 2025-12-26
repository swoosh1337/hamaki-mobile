/**
 * Leaderboard-related type definitions
 */

/**
 * Period types for leaderboard
 */
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

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
 */
export interface AwardXPResult {
    success: boolean;
    new_total_xp: number;
    personal_rank: number;
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

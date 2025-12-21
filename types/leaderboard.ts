/**
 * Leaderboard-related type definitions
 */

/**
 * Period types for leaderboard
 */
export type LeaderboardPeriod = 'weekly' | 'all_time';

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

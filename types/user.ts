/**
 * User-related type definitions
 */

/**
 * User profile stored in the database
 */
export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    avatar_url?: string;
    google_id: string;
    youtube_subscribed: boolean;
    miro_channel_subscribed?: boolean;
    bastos_channel_subscribed?: boolean;
    koro_channel_subscribed?: boolean;
    subscriptions_verified_at?: string;
    subscription_xp_awarded?: {
        hamaki: boolean;
        miro: boolean;
        bastos: boolean;
        koro: boolean;
    };
    xp_points: number;
    created_at: string;
    updated_at: string;
}

/**
 * Input for creating/updating a user profile
 */
export interface UpsertUserInput {
    googleId: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    isSubscribed: boolean;
}

/**
 * XP statistics for a user
 */
export interface XPStats {
    totalXP: number;
    weeklyXP: number;
    weeklyStartDate: string;
    weeklyEndDate: string;
}

/**
 * Valid avatar IDs that can be selected
 */
export const VALID_AVATAR_IDS = [
    'avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-6',
    'avatar-7', 'avatar-8', 'avatar-9', 'avatar-10', 'avatar-11', 'avatar-12',
    'avatar-13', 'avatar-14', 'avatar-15', 'avatar-16', 'avatar-17', 'avatar-18'
] as const;

export type AvatarId = typeof VALID_AVATAR_IDS[number];

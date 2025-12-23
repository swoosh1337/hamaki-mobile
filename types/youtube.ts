/**
 * YouTube Verification Types
 *
 * Types for YouTube subscription and video like verification system.
 * Used by services, hooks, and UI components.
 */

// ============================================================================
// Channel Configuration
// ============================================================================

export type ChannelKey = 'hamaki' | 'miro' | 'bastos' | 'koro';

export interface ChannelInfo {
    id: string;
    name: string;
    xpReward: number;
    dbField: string;
    rewardKey: ChannelKey;
}

export const YOUTUBE_CHANNELS: Record<ChannelKey, ChannelInfo> = {
    hamaki: {
        id: process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID || '',
        name: 'HamaKi',
        xpReward: 1000,
        dbField: 'youtube_subscribed',
        rewardKey: 'hamaki',
    },
    miro: {
        id: 'UChJnB_7-JUYXEr-Fv3Y_rGA',
        name: 'Miro',
        xpReward: 700,
        dbField: 'miro_channel_subscribed',
        rewardKey: 'miro',
    },
    bastos: {
        id: 'UCjSZIjLKfQHkdZbZMvYQhAw',
        name: 'Basto',
        xpReward: 700,
        dbField: 'bastos_channel_subscribed',
        rewardKey: 'bastos',
    },
    koro: {
        id: 'UCPCQmO5MrP3S1oVu6p9bxRw',
        name: 'Koro',
        xpReward: 700,
        dbField: 'koro_channel_subscribed',
        rewardKey: 'koro',
    },
};

// XP rewards for liking latest videos
export const VIDEO_LIKE_XP: Record<ChannelKey, number> = {
    hamaki: 200, // Main channel
    miro: 100,
    bastos: 100,
    koro: 100,
};

// ============================================================================
// Verification Status Types
// ============================================================================

/**
 * Status of a single channel subscription
 */
export interface SubscriptionStatus {
    channelKey: ChannelKey;
    channelId: string;
    channelName: string;
    isSubscribed: boolean;
    xpReward: number;
    xpAwarded: boolean; // true = XP already given, never revoked
    lastChecked: number; // timestamp ms
}

/**
 * Status of a video like for a channel
 */
export interface VideoLikeStatus {
    channelKey: ChannelKey;
    channelName: string;
    latestVideoId: string | null;
    videoTitle: string | null;
    videoThumbnail?: string;
    isLiked: boolean;
    xpReward: number;
    xpAwarded: boolean; // true = XP already given for this video
    lastChecked: number; // timestamp ms
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache for subscription verification (7-day TTL)
 * Uses Partial because cache may not have all channels populated yet
 */
export interface SubscriptionCache {
    statuses: Partial<Record<ChannelKey, SubscriptionStatus>>;
    lastFullCheck: number; // timestamp of last full API check
}

/**
 * Cache for video IDs (24-hour TTL)
 * Uses Partial because cache may not have all channels' videos yet
 */
export interface VideoCache {
    videos: Partial<Record<ChannelKey, {
        videoId: string;
        title: string;
        thumbnail?: string;
        fetchedAt: number;
    }>>;
}

/**
 * Combined verification cache stored in AsyncStorage
 */
export interface VerificationCache {
    subscriptions: SubscriptionCache;
    videos: VideoCache;
    lastUpdated: number;
}

// ============================================================================
// Database Types (stored in Supabase users table)
// ============================================================================

/**
 * XP awarded flags for subscriptions (stored in users.subscription_xp_awarded)
 */
export interface SubscriptionXPAwarded {
    hamaki: boolean;
    miro: boolean;
    bastos: boolean;
    koro: boolean;
}

/**
 * XP awarded flags for video likes (stored in users.video_like_xp_awarded)
 * Keyed by VIDEO ID to track per-video awards
 */
export type VideoLikeXPAwarded = Record<string, boolean>;

// ============================================================================
// API Response Types
// ============================================================================

export interface VerifySubscriptionsResult {
    success: boolean;
    statuses: SubscriptionStatus[];
    totalXPAwarded: number;
    errors: string[];
}

export interface VerifyVideoLikesResult {
    success: boolean;
    statuses: VideoLikeStatus[];
    totalXPAwarded: number;
    errors: string[];
}

// ============================================================================
// Cache TTL Constants
// ============================================================================

export const CACHE_TTL = {
    SUBSCRIPTION: 7 * 24 * 60 * 60 * 1000, // 7 days
    VIDEO_ID: 24 * 60 * 60 * 1000, // 24 hours
} as const;

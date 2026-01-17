/**
 * API Constants
 * 
 * API-related configuration values.
 */

export const API = {
    /** YouTube channel IDs */
    channels: {
        hamaki: 'UCSI5XbaxsX1USijrfFVuJqA',
        miro: '', // Add when available
        bastos: '', // Add when available
        koro: '', // Add when available
    },

    /** Cache durations in milliseconds */
    cache: {
        /** 5 minutes */
        videos: 5 * 60 * 1000,
        /** 1 minute */
        leaderboard: 1 * 60 * 1000,
        /** 24 hours */
        subscriptionVerification: 24 * 60 * 60 * 1000,
        /** 4 hours */
        videoLikeTTL: 4 * 60 * 60 * 1000,
    },

    /** Polling intervals in milliseconds */
    polling: {
        /** 15 minutes */
        newVideos: 15 * 60 * 1000,
        /** 1 minute */
        leaderboard: 1 * 60 * 1000,
    },

    /** Retry configuration */
    retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 5000,
    },

    /** Pagination defaults */
    pagination: {
        defaultLimit: 20,
        maxLimit: 100,
    },
} as const;

/** Video like cache TTL (4 hours) */
/**
 * Game cooldowns in milliseconds
 */
export const GameCooldowns = {
    'no-pogodi': 5 * 60 * 1000, // 5 minutes
    'hammock-jump': 5 * 60 * 1000, // 5 minutes
} as const;

export type GameId = keyof typeof GameCooldowns;

/**
 * Hooks Index
 * 
 * Central export for all custom React hooks.
 * 
 * Usage:
 *   import { usePosts, useLeaderboard, useUserProfile } from '@/hooks';
 */

// Data hooks
export { useGameCooldown } from './useGameCooldown';
export { useLeaderboard } from './useLeaderboard';
export { usePosts } from './usePosts';
export { useSponsors } from './useSponsors';
export { useUserProfile } from './useUserProfile';

// Hybrid Leaderboard hooks (see documentation/hybrid-leaderboard-plan.md)
export { useMyLeaderboardStatus } from './useMyLeaderboardStatus';
export type { AwardXPResult, MyLeaderboardStatus, MyXPBreakdown } from './useMyLeaderboardStatus';
export { useLeaderboardSnapshot } from './useLeaderboardSnapshot';
export type { LeaderboardEntry, LeaderboardSnapshot } from './useLeaderboardSnapshot';

// Navigation hooks
export { useTabNavigation } from './useTabNavigation';

// Utility hooks
export { useColorScheme } from './useColorScheme';
export { useRetry } from './useRetry';
export { useThemeColor } from './useThemeColor';

// Realtime hooks
export {
    useRealtimeSubscription,
    useRealtimeInsert,
    useRealtimeUpdate,
    useRealtimeDelete,
} from './useRealtimeSubscription';
export type { RealtimePayload, UseRealtimeOptions } from './useRealtimeSubscription';


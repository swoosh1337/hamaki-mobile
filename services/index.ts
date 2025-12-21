/**
 * Services Index
 * 
 * Central export for all services.
 * 
 * Usage:
 *   import { userService, postService } from '@/services';
 */

// Supabase services
export {
    getWeekStartDate, leaderboardService, postService, supabase,
    userService
} from './supabase';

// Auth services
export {
    authService,
    tokenManager
} from './auth';

// YouTube services
export {
    youtubeService,
    type YouTubeVideo
} from './youtube';

// Re-export types for convenience
export type {
    CreatePostInput, LeaderboardEntry,
    LeaderboardPeriod, Post, PostSortOption, PostUpvote, PostWithAuthor, UpsertUserInput, UserProfile,
    XPStats
} from './supabase';

export type {
    AuthResult, StoredUserSession, TokenData
} from '@/types/auth';


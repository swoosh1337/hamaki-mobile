/**
 * Supabase Services Index
 * 
 * Central export for all Supabase-related services.
 * 
 * Usage:
 *   import { supabase, userService, postService, leaderboardService } from '@/services/supabase';
 */

export { channelStateService } from './channelStateService';
export { supabase } from './client';
export { leaderboardService } from './leaderboardService';
export { postService } from './postService';
export { getWeekStartDate, userService } from './userService';

// Re-export types for convenience (backwards compatibility)
export type { CreatePostInput, LeaderboardEntry, LeaderboardPeriod, Post, PostSortOption, PostUpvote, PostWithAuthor, UpsertUserInput, UserProfile, XPStats } from '@/types';


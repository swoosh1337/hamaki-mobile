/**
 * @deprecated This file is maintained for backwards compatibility.
 * Please import from the new service modules instead:
 * 
 * - import { supabase } from '@/services/supabase/client';
 * - import { userService } from '@/services/supabase/userService';
 * - import { postService } from '@/services/supabase/postService';
 * - import { leaderboardService } from '@/services/supabase/leaderboardService';
 * - import type { UserProfile, Post, ... } from '@/types';
 * 
 * Or use the barrel import:
 * - import { supabase, userService, postService } from '@/services/supabase';
 */

// Re-export types from new location
export type {
  UpsertUserInput, UserProfile,
  XPStats
} from '@/types/user';

export type {
  CreatePostInput, // Keep old name for compatibility
  PostUpvote,
  PostWithAuthor, Post as UserPost
} from '@/types/post';

// Re-export services and client from new location
export { supabase } from '@/services/supabase/client';
export { getWeekStartDate } from '@/services/supabase/userService';

// Import services for the combined userService export
import { supabase } from '@/services/supabase/client';
import { leaderboardService as _leaderboardService } from '@/services/supabase/leaderboardService';
import { postService as _postService } from '@/services/supabase/postService';
import { userService as _userService } from '@/services/supabase/userService';

/**
 * @deprecated Combined user service for backwards compatibility.
 * 
 * In new code, prefer importing specific services:
 * - userService for user operations
 * - postService for post operations  
 * - leaderboardService for leaderboard operations
 */
export const userService = {
  // Expose supabase client for direct queries (legacy)
  supabase,

  // User methods
  upsertUserProfile: _userService.upsertUserProfile.bind(_userService),
  getUserProfile: _userService.getUserProfile.bind(_userService),
  updateUserXP: _userService.updateUserXP.bind(_userService),
  getGoogleIdByUserId: async (userId: string) => {
    const googleId = await _userService.getGoogleIdByUserId(userId);
    return googleId ? { google_id: googleId } : null;
  },
  updateUserAvatar: _userService.updateUserAvatar.bind(_userService),
  updateUsername: _userService.updateUsername.bind(_userService),
  getUserXPStats: _userService.getUserXPStats.bind(_userService),

  // Leaderboard methods
  getLeaderboard: _leaderboardService.getLeaderboard.bind(_leaderboardService),
  getWeekStartDate: () => {
    const { getWeekStartDate } = require('@/services/supabase/userService');
    return getWeekStartDate();
  },
  updateLeaderboardPoints: _leaderboardService.updateLeaderboardPoints.bind(_leaderboardService),

  // Post methods
  createUserPost: async (userId: string, title: string, content: string, category?: string) => {
    return _postService.createPost({ userId, title, content, category });
  },
  getUserPosts: _postService.getUserPosts.bind(_postService),
  upvotePost: _postService.upvotePost.bind(_postService),
  downvotePost: _postService.removeUpvote.bind(_postService),
  getPostUpvoteCount: _postService.getPostUpvoteCount.bind(_postService),
  getApprovedPosts: _postService.getApprovedPosts.bind(_postService),
  getApprovedPostsWithUserUpvotes: _postService.getApprovedPostsWithUserUpvotes.bind(_postService),
};

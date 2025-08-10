import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // We'll handle auth state changes manually since we're using Google OAuth
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types for user data
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  google_id: string;
  youtube_subscribed: boolean;
  xp_points: number;
  created_at: string;
  updated_at: string;
}

export interface UserPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  upvotes: number;
  created_at: string;
  updated_at: string;
}

export interface XPStats {
  totalXP: number;
  weeklyXP: number;
  weeklyStartDate: string;
  weeklyEndDate: string;
}

export interface PostUpvote {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

// User management functions
export const userService = {
  // Create or update user profile after Google authentication
  async upsertUserProfile(userData: {
    googleId: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    isSubscribed: boolean;
  }): Promise<UserProfile | null> {
    try {
      // First, check if user already exists
      const existingUser = await this.getUserProfile(userData.googleId);
      
      if (existingUser) {
        // User exists, check if we need to update anything
        const needsUpdate = 
          existingUser.email !== userData.email ||
          existingUser.full_name !== userData.fullName ||
          existingUser.avatar_url !== userData.avatarUrl ||
          existingUser.youtube_subscribed !== userData.isSubscribed;

        if (!needsUpdate) {
          console.log('User profile is up to date, no changes needed');
          return existingUser;
        }

        // Update existing user
        console.log('Updating existing user profile');
        const { data, error } = await supabase
          .from('users')
          .update({
            email: userData.email,
            full_name: userData.fullName,
            avatar_url: userData.avatarUrl,
            youtube_subscribed: userData.isSubscribed,
            updated_at: new Date().toISOString(),
          })
          .eq('google_id', userData.googleId)
          .select()
          .single();

        if (error) {
          console.error('Error updating user profile:', error);
          return null;
        }

        return data;
      } else {
        // User doesn't exist, create new one
        console.log('Creating new user profile');
        const { data, error } = await supabase
          .from('users')
          .insert({
            google_id: userData.googleId,
            email: userData.email,
            full_name: userData.fullName,
            avatar_url: userData.avatarUrl,
            youtube_subscribed: userData.isSubscribed,
            xp_points: 0, // Start with 0 XP for new users
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating user profile:', error);
          return null;
        }

        return data;
      }
    } catch (error) {
      console.error('Error upserting user profile:', error);
      return null;
    }
  },

  // Get user profile by Google ID
  async getUserProfile(googleId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('google_id', googleId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  },

  // Update user XP points
  async updateUserXP(googleId: string, xpPoints: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          xp_points: xpPoints,
          updated_at: new Date().toISOString()
        })
        .eq('google_id', googleId);

      if (error) {
        console.error('Error updating user XP:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating user XP:', error);
      return false;
    }
  },

  // Get leaderboard (top users by XP)
  async getLeaderboard(limit: number = 10): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('xp_points', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  },

  // Profile Management Methods

  // Update user avatar — now allows full URL or predefined id
  async updateUserAvatar(googleId: string, avatar: string): Promise<UserProfile | null> {
    try {
      // Accept either a full URL or legacy id; normalize to URL for storage
      let avatarUrl = avatar;
      const idToUrl: Record<string, string> = {
        'avatar-1': 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-1.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0xLnBuZyIsImlhdCI6MTc1NDc4NDY4OSwiZXhwIjoxNzg2MzIwNjg5fQ.SKfVTG5KuGqpDnU3vCvzSUoBShVeCzpKhteFy_Zeh9I',
        'avatar-2': 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-2.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0yLnBuZyIsImlhdCI6MTc1NDc4NDY5NywiZXhwIjoxNzg2MzIwNjk3fQ.hwjcOi7o3-9XRZ0uYYYTYFlcK8IWt2r-CJyo-38j2C8',
        'avatar-3': 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-3.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0zLnBuZyIsImlhdCI6MTc1NDc4NDcwOCwiZXhwIjoxNzg2MzIwNzA4fQ.QRFOWSPKG-lxwYKJKPd4wi-fPcUIKCUDLYGjasuIjdU',
      };
      if (!/^https?:\/\//i.test(avatar)) {
        if (idToUrl[avatar]) {
          avatarUrl = idToUrl[avatar];
        } else {
          throw new Error('Invalid avatar selection');
        }
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('google_id', googleId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user avatar:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error updating user avatar:', error);
      if (error instanceof Error && error.message === 'Invalid avatar selection') {
        throw error;
      }
      return null;
    }
  },

  // Update username
  async updateUsername(googleId: string, username: string): Promise<UserProfile | null> {
    try {
      // Validate username
      if (!username || username.length < 2 || username.length > 30) {
        throw new Error('Username must be between 2 and 30 characters');
      }
      if (!/^[a-zA-Z0-9\s]+$/.test(username)) {
        throw new Error('Username can only contain letters, numbers, and spaces');
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          full_name: username,
          updated_at: new Date().toISOString(),
        })
        .eq('google_id', googleId)
        .select()
        .single();

      if (error) {
        console.error('Error updating username:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error updating username:', error);
      if (error instanceof Error && (
        error.message.includes('Username must be between') ||
        error.message.includes('Username can only contain')
      )) {
        throw error;
      }
      return null;
    }
  },

  // Get user XP statistics (weekly and total)
  async getUserXPStats(googleId: string): Promise<XPStats | null> {
    try {
      // Get user's total XP
      const userProfile = await this.getUserProfile(googleId);
      if (!userProfile) {
        return null;
      }

      // Calculate week start and end dates (Monday to Sunday)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
      
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get weekly XP from XP transactions (would need xp_transactions table)
      // For now, we'll use a simplified approach and calculate based on user activity this week
      // This would be replaced with actual XP transaction queries in a real implementation
      let weeklyXP = 0;

      // In a real implementation, you would query an xp_transactions table like:
      // const { data: weeklyTransactions } = await supabase
      //   .from('xp_transactions')
      //   .select('xp_amount')
      //   .eq('user_id', userProfile.id)
      //   .gte('created_at', weekStart.toISOString())
      //   .lt('created_at', weekEnd.toISOString());
      // weeklyXP = weeklyTransactions?.reduce((sum, t) => sum + t.xp_amount, 0) || 0;

      // For now, return mock data based on user's total XP
      // This would be replaced with actual database queries
      weeklyXP = Math.floor(userProfile.xp_points * 0.1); // Mock: 10% of total as this week's XP

      return {
        totalXP: userProfile.xp_points,
        weeklyXP,
        weeklyStartDate: weekStart.toISOString(),
        weeklyEndDate: weekEnd.toISOString(),
      };
    } catch (error) {
      console.error('Error getting user XP stats:', error);
      return null;
    }
  },

  // Post Management Methods

  // Create a new user post
  async createUserPost(userId: string, title: string, content: string): Promise<UserPost | null> {
    try {
      // Validate post content
      if (!title || title.length < 5 || title.length > 100) {
        throw new Error('Title must be between 5 and 100 characters');
      }
      if (!content || content.length < 10 || content.length > 1000) {
        throw new Error('Content must be between 10 and 1000 characters');
      }

      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: userId,
          title,
          content,
          upvotes: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating user post:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating user post:', error);
      if (error instanceof Error && (
        error.message.includes('Title must be between') ||
        error.message.includes('Content must be between')
      )) {
        throw error;
      }
      return null;
    }
  },

  // Get user posts with pagination
  async getUserPosts(userId: string, limit: number = 10, offset: number = 0): Promise<UserPost[]> {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching user posts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user posts:', error);
      return [];
    }
  },

  // Upvote a post
  async upvotePost(postId: string, userId: string): Promise<UserPost | null> {
    try {
      // Check if user has already upvoted this post
      const { data: existingUpvote } = await supabase
        .from('post_upvotes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();

      if (existingUpvote) {
        throw new Error('User has already upvoted this post');
      }

      // Start transaction-like operation
      // 1. Insert upvote record
      const { error: upvoteError } = await supabase
        .from('post_upvotes')
        .insert({
          post_id: postId,
          user_id: userId,
        });

      if (upvoteError) {
        console.error('Error inserting upvote:', upvoteError);
        return null;
      }

      // 2. Increment upvotes count on post
      const { data, error } = await supabase
        .from('posts')
        .update({
          upvotes: await this.getPostUpvoteCount(postId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .select()
        .single();

      if (error) {
        console.error('Error updating post upvotes:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error upvoting post:', error);
      if (error instanceof Error && error.message === 'User has already upvoted this post') {
        throw error;
      }
      return null;
    }
  },

  // Remove upvote from a post
  async downvotePost(postId: string, userId: string): Promise<UserPost | null> {
    try {
      // Check if user has upvoted this post
      const { data: existingUpvote } = await supabase
        .from('post_upvotes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();

      if (!existingUpvote) {
        throw new Error('User has not upvoted this post');
      }

      // Start transaction-like operation
      // 1. Remove upvote record
      const { error: removeError } = await supabase
        .from('post_upvotes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (removeError) {
        console.error('Error removing upvote:', removeError);
        return null;
      }

      // 2. Decrement upvotes count on post
      const { data, error } = await supabase
        .from('posts')
        .update({
          upvotes: await this.getPostUpvoteCount(postId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .select()
        .single();

      if (error) {
        console.error('Error updating post upvotes:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error downvoting post:', error);
      if (error instanceof Error && error.message === 'User has not upvoted this post') {
        throw error;
      }
      return null;
    }
  },

  // Helper method to get current upvote count for a post
  async getPostUpvoteCount(postId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('post_upvotes')
        .select('id', { count: 'exact' })
        .eq('post_id', postId);

      if (error) {
        console.error('Error getting upvote count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error getting upvote count:', error);
      return 0;
    }
  },
};
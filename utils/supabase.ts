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
};
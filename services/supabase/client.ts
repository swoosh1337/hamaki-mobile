/**
 * Supabase Client Configuration
 * 
 * This is the single source of truth for the Supabase client.
 * All services should import the client from here.
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

/**
 * Supabase client instance
 * 
 * Usage:
 *   import { supabase } from '@/services/supabase/client';
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // We'll handle auth state changes manually since we're using Google OAuth
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

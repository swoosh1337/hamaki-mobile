import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { authenticateWithGoogle, loadPersistedUser, clearUserSession, backgroundVerifySubscription, AuthResult } from '../utils/auth';
import { userService, UserProfile } from '../utils/supabase';
import { initializeNotifications, backgroundVideoCheck } from '../utils/notifications';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubscribed: boolean;
  userProfile: UserProfile | null;
  signIn: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  isSubscribed: false,
  userProfile: null,
  signIn: async () => ({ success: false }),
  signOut: async () => {},
  error: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        console.log('Checking for persisted authentication...');
        
        // Try to load persisted user session
        const persistedResult = await loadPersistedUser();
        
        if (persistedResult.success && persistedResult.userData) {
          // Load user from Supabase to get latest profile data
          const supabaseUser = await userService.getUserProfile(persistedResult.userData.id);
          
          if (supabaseUser) {
            setUserProfile(supabaseUser);
            setIsAuthenticated(true);
            setIsSubscribed(persistedResult.isSubscribed || false);
            console.log('Successfully loaded persisted session for:', persistedResult.userData.email);
            
            // Initialize notifications for authenticated users
            await initializeNotifications();
          } else {
            console.log('User not found in Supabase, clearing session');
            await clearUserSession();
          }
        } else {
          console.log('No valid persisted session found');
        }
      } catch (err) {
        console.error('Auth check error:', err);
        await clearUserSession();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Listen for app state changes to perform background verification and video checking
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active' && isAuthenticated) {
        console.log('App became active, performing background checks...');
        
        // Check subscription status
        const subscriptionStatus = await backgroundVerifySubscription();
        if (subscriptionStatus !== null && subscriptionStatus !== isSubscribed) {
          setIsSubscribed(subscriptionStatus);
          console.log('Subscription status updated:', subscriptionStatus);
        }
        
        // Check for new videos and send notifications
        if (isSubscribed) {
          await backgroundVideoCheck();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAuthenticated, isSubscribed]);

  // Sign in with Google
  const signIn = async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await authenticateWithGoogle();
      
      if (result.success && result.userData) {
        // Save/update user data in Supabase
        const supabaseUser = await userService.upsertUserProfile({
          googleId: result.userData.id,
          email: result.userData.email,
          fullName: result.userData.name || result.userData.email,
          avatarUrl: result.userData.picture,
          isSubscribed: result.isSubscribed || false,
        });

        if (supabaseUser) {
          setUserProfile(supabaseUser);
          setIsAuthenticated(true);
          setIsSubscribed(result.isSubscribed || false);
          console.log('User saved to Supabase:', supabaseUser);
          
          // Initialize notifications for newly authenticated users
          await initializeNotifications();
        } else {
          console.error('Failed to save user to Supabase');
        }
      } else {
        setError(result.error || 'Authentication failed');
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during sign in';
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      await clearUserSession();
      setIsAuthenticated(false);
      setIsSubscribed(false);
      setUserProfile(null);
      console.log('User signed out successfully');
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        isSubscribed,
        userProfile,
        signIn,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

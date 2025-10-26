import { analytics } from '@/utils/analytics';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { RememberMeModal } from '../components/ui/RememberMeModal';
import { authenticateWithGoogle, AuthResult, backgroundVerifySubscription, clearUserSession, loadPersistedUser, storeUserSession, storeUserSessionWithTokens } from '../utils/auth';
import { backgroundVideoCheck, initializeNotifications } from '../utils/notifications';
import { UserProfile, userService } from '../utils/supabase';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubscribed: boolean;
  userProfile: UserProfile | null;
  signIn: () => Promise<AuthResult>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  isSubscribed: false,
  userProfile: null,
  signIn: async () => ({ success: false }),
  signInDemo: async () => {},
  signOut: async () => {},
  error: null,
  updateUserProfile: () => {},
  isDemoMode: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Remember Me modal state
  const [showRememberMeModal, setShowRememberMeModal] = useState(false);
  const [pendingAuthResult, setPendingAuthResult] = useState<AuthResult | null>(null);
  const [isTemporarySession, setIsTemporarySession] = useState(false);

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
      if (nextAppState === 'active' && isAuthenticated && !isDemoMode) {
        console.log('App became active, performing background checks...');
        
        // Check subscription status (skip for demo users)
        const subscriptionStatus = await backgroundVerifySubscription();
        if (subscriptionStatus !== null && subscriptionStatus !== isSubscribed) {
          setIsSubscribed(subscriptionStatus);
          console.log('Subscription status updated:', subscriptionStatus);
        }
        
        // Check for new videos and send notifications
        if (isSubscribed) {
          await backgroundVideoCheck();
        }
      } else if (nextAppState === 'background' && isAuthenticated && isTemporarySession && !isDemoMode) {
        console.log('App went to background with temporary session - clearing session...');
        await clearUserSession();
        setIsAuthenticated(false);
        setIsSubscribed(false);
        setUserProfile(null);
        setIsTemporarySession(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAuthenticated, isSubscribed, isTemporarySession, isDemoMode]);

  // Sign in with Google
  const signIn = async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await authenticateWithGoogle();
      
      if (result.success && result.userData) {
        // Only show Remember Me modal if user is authenticated AND subscribed
        if (result.isSubscribed) {
          // Store the pending result and show Remember Me modal
          setPendingAuthResult(result);
          setShowRememberMeModal(true);
          setIsLoading(false);
          
          // Return success but user isn't fully authenticated until they choose remember me option
          return { success: true, userData: result.userData, isSubscribed: result.isSubscribed };
        } else {
          // User authenticated but not subscribed - don't show remember me modal
          setIsLoading(false);
          return { success: true, userData: result.userData, isSubscribed: false };
        }
      } else {
        setError(result.error || 'Authentication failed');
        setIsLoading(false);
        return result;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during sign in';
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  // Sign in with demo mode - loads real demo user from database
  const signInDemo = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🎭 Starting demo mode - fetching demouser@apple.com from database');
      
      // Fetch the real demo user from Supabase
      const { data: demoUsers, error: fetchError } = await userService.supabase
        .from('users')
        .select('*')
        .eq('email', 'demouser@apple.com')
        .single();
      
      if (fetchError || !demoUsers) {
        console.error('❌ Failed to fetch demo user:', fetchError);
        throw new Error('Demo user not found in database. Please contact support.');
      }
      
      console.log('✅ Demo user loaded from database:', demoUsers);
      
      // Set the real demo user profile
      setUserProfile(demoUsers);
      setIsAuthenticated(true);
      setIsSubscribed(demoUsers.is_subscribed || true);
      setIsDemoMode(true);
      
      // Set analytics user id
      analytics.setUserId(demoUsers.google_id);
      
      console.log('🎭 Demo mode activated with real user');
      
      // Initialize notifications for demo user
      await initializeNotifications();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Demo mode failed';
      setError(errorMessage);
      console.error('❌ Demo sign in error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out
  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Only clear user session if not in demo mode
      if (!isDemoMode) {
        await clearUserSession();
      }
      
      setIsAuthenticated(false);
      setIsSubscribed(false);
      setUserProfile(null);
      setIsDemoMode(false);
      console.log('User signed out successfully');
      analytics.setUserId(null);
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Remember Me modal choice
  const handleRememberMeChoice = async (rememberMe: boolean) => {
    setIsLoading(true);
    setShowRememberMeModal(false);
    
    if (!pendingAuthResult) {
      setError('No pending authentication result');
      setIsLoading(false);
      return;
    }
    
    try {
      // Save/update user data in Supabase
      const supabaseUser = await userService.upsertUserProfile({
        googleId: pendingAuthResult.userData.id,
        email: pendingAuthResult.userData.email,
        fullName: pendingAuthResult.userData.name || pendingAuthResult.userData.email,
        avatarUrl: pendingAuthResult.userData.picture,
        isSubscribed: pendingAuthResult.isSubscribed || false,
      });

      if (supabaseUser) {
        // Process multi-channel subscriptions and award XP if available
        let updatedUser = supabaseUser;
        if (pendingAuthResult.allChannelSubscriptions) {
          try {
            const { updateChannelSubscriptionsAndAwardXP } = await import('../utils/channelSubscriptions');
            const result = await updateChannelSubscriptionsAndAwardXP(
              supabaseUser.google_id,
              pendingAuthResult.allChannelSubscriptions
            );

            if (result.totalXPAwarded > 0) {
              console.log(`🎉 Awarded ${result.totalXPAwarded} XP for channel subscriptions on sign-in!`);
              updatedUser = result.updatedUser;
            }
          } catch (error) {
            console.error('Failed to process channel subscriptions:', error);
            // Continue with normal flow even if XP awarding fails
          }
        }

        setUserProfile(updatedUser);
        setIsAuthenticated(true);
        setIsSubscribed(pendingAuthResult.isSubscribed || false);
        setIsTemporarySession(!rememberMe);
        console.log('User saved to Supabase:', updatedUser);

        // Set analytics user id
        analytics.setUserId(updatedUser.google_id);

        // Store session based on user choice
        if (pendingAuthResult.tokenData) {
          await storeUserSessionWithTokens(
            pendingAuthResult.tokenData,
            pendingAuthResult.userData,
            pendingAuthResult.isSubscribed || false,
            rememberMe
          );
        } else {
          // Fallback for legacy token format
          await storeUserSession(
            pendingAuthResult.token || '',
            pendingAuthResult.userData,
            pendingAuthResult.isSubscribed || false,
            rememberMe
          );
        }

        // Initialize notifications for newly authenticated users
        await initializeNotifications();
      } else {
        setError('Failed to save user to Supabase');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete authentication';
      setError(errorMessage);
    } finally {
      setPendingAuthResult(null);
      setIsLoading(false);
    }
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        isSubscribed,
        userProfile,
        signIn,
        signInDemo,
        signOut,
        error,
        updateUserProfile,
        isDemoMode,
      }}
    >
      {children}
      
      {/* Remember Me Modal */}
      <RememberMeModal
        visible={showRememberMeModal}
        onContinue={handleRememberMeChoice}
        userName={pendingAuthResult?.userData?.name || pendingAuthResult?.userData?.email}
      />
    </AuthContext.Provider>
  );
};

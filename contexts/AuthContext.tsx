import { authService, tokenManager } from '@/services/auth';
import { supabase } from '@/services/supabase/client';
import { userService } from '@/services/supabase/userService';
import type { AuthResult } from '@/types';
import type { UserProfile } from '@/types/user';
import { analytics } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { RememberMeModal } from '../components/ui/RememberMeModal';
import { backgroundVideoCheck, initializeNotifications } from '../utils/notifications';





const log = createLogger('Auth');

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
  signInDemo: async () => { },
  signOut: async () => { },
  error: null,
  updateUserProfile: () => { },
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
        log.info('Checking for persisted authentication...');

        // Try to load persisted user session
        const persistedResult = await authService.loadSavedSession();

        if (persistedResult.success && persistedResult.userData) {
          // Load user from Supabase to get latest profile data
          const supabaseUser = await userService.getUserProfile(persistedResult.userData.id);

          if (supabaseUser) {
            setUserProfile(supabaseUser);
            setIsAuthenticated(true);
            setIsSubscribed(persistedResult.isSubscribed || false);
            log.info('Successfully loaded persisted session', { email: persistedResult.userData.email });

            // Initialize notifications for authenticated users
            await initializeNotifications();
          } else {
            log.warn('User not found in Supabase, clearing session');
            await tokenManager.clearSession();
          }
        } else {
          log.debug('No valid persisted session found');
        }
      } catch (err) {
        log.error('Auth check error:', err);
        await tokenManager.clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Listen for app state changes to perform background verification and video checking
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active' && isAuthenticated && !isDemoMode && userProfile?.id) {
        log.info('App became active, performing background checks...');

        // Check subscription status (skip for demo users)
        const session = await tokenManager.getStoredSession();
        if (session) {
          const subscriptionStatus = await authService.triggerBackgroundVerification(session);
          if (subscriptionStatus !== null && subscriptionStatus !== isSubscribed) {
            setIsSubscribed(subscriptionStatus);
            log.info('Subscription status updated', { subscriptionStatus });
          }
        }

        // Check for new videos and send notifications
        if (isSubscribed) {
          await backgroundVideoCheck();
        }

        // Perform background XP checks (subscriptions + video likes)
        try {
          const { performBackgroundXPChecks } = await import('../utils/backgroundXPChecks');
          const xpResult = await performBackgroundXPChecks(userProfile.id);

          if (xpResult.totalXP > 0) {
            log.info('Background XP awarded', {
              total: xpResult.totalXP,
              subs: xpResult.subscriptionXP,
              likes: xpResult.videoLikeXP
            });

            // Refresh user profile to get updated XP
            const updatedProfile = await userService.getUserProfile(userProfile.google_id);
            if (updatedProfile) {
              setUserProfile(updatedProfile);
            }
          }
        } catch (error) {
          log.error('Error performing background XP checks:', error);
        }
      } else if (nextAppState === 'background' && isAuthenticated && isTemporarySession && !isDemoMode) {
        log.info('App went to background with temporary session - clearing session...');
        await tokenManager.clearSession();
        setIsAuthenticated(false);
        setIsSubscribed(false);
        setUserProfile(null);
        setIsTemporarySession(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAuthenticated, isSubscribed, isTemporarySession, isDemoMode, userProfile?.id, userProfile?.google_id]);

  // Sign in with Google
  const signIn = async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.authenticate();

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
      log.info('Starting demo mode - fetching demouser@apple.com from database');

      // Fetch the real demo user from Supabase
      const { data: demoUsers, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'demouser@apple.com')
        .single();

      if (fetchError || !demoUsers) {
        log.error('Failed to fetch demo user', fetchError);
        throw new Error('Demo user not found in database. Please contact support.');
      }

      log.info('Demo user loaded from database', { email: demoUsers.email });

      // Set the real demo user profile
      setUserProfile(demoUsers);
      setIsAuthenticated(true);
      setIsSubscribed(demoUsers.is_subscribed || true);
      setIsDemoMode(true);

      // Set analytics user id
      analytics.setUserId(demoUsers.google_id);

      log.info('Demo mode activated with real user');

      // Initialize notifications for demo user
      await initializeNotifications();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Demo mode failed';
      setError(errorMessage);
      log.error('Demo sign in error:', err);
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
        await tokenManager.clearSession();
      }

      setIsAuthenticated(false);
      setIsSubscribed(false);
      setUserProfile(null);
      setIsDemoMode(false);
      log.info('User signed out successfully');
      analytics.setUserId(null);
    } catch (err) {
      log.error('Sign out error:', err);
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
              log.info('Awarded XP for channel subscriptions on sign-in', { xp: result.totalXPAwarded });
              updatedUser = result.updatedUser;
            }
          } catch (error) {
            log.error('Failed to process channel subscriptions:', error);
            // Continue with normal flow even if XP awarding fails
          }
        }

        // Check video likes and award XP automatically on sign-in
        try {
          log.debug('Checking video likes on sign-in...');
          const { checkAndAwardVideoLikes } = await import('../utils/videoLikes');

          const accessToken = await tokenManager.getValidAccessToken();
          if (accessToken) {
            const likesResult = await checkAndAwardVideoLikes(accessToken, supabaseUser.id);

            if (likesResult.xpAwarded > 0) {
              log.info('Awarded XP for video likes on sign-in', { xp: likesResult.xpAwarded });

              // Refresh user profile to get updated XP
              const refreshedUser = await userService.getUserProfile(supabaseUser.google_id);
              if (refreshedUser) {
                updatedUser = refreshedUser;
              }
            }
          }
        } catch (error) {
          log.error('Failed to check video likes on sign-in:', error);
          // Continue with normal flow even if video likes check fails
        }

        setUserProfile(updatedUser);
        setIsAuthenticated(true);
        setIsSubscribed(pendingAuthResult.isSubscribed || false);
        setIsTemporarySession(!rememberMe);
        log.info('User saved to Supabase', { userId: updatedUser.id });

        // Set analytics user id
        analytics.setUserId(updatedUser.google_id);

        // Store session based on user choice
        if (pendingAuthResult.tokenData) {
          await tokenManager.storeSession(
            pendingAuthResult.tokenData,
            pendingAuthResult.userData,
            pendingAuthResult.isSubscribed || false,
            rememberMe
          );
        } else {
          // Fallback for legacy token format - create TokenData from string
          const tokenData = {
            accessToken: pendingAuthResult.token || '',
            expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days in ms
          };
          await tokenManager.storeSession(
            tokenData,
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

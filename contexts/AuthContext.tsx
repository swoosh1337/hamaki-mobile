/**
 * AuthContext
 * 
 * Central authentication state management.
 * Supports:
 * - Google OAuth login
 * - Email Magic Link login (Supabase)
 * - 30-day session persistence
 * - Silent session refresh on app resume
 * 
 * YouTube subscription is OPTIONAL and non-blocking.
 */

import { authService, tokenManager } from '@/services/auth';
import { supabase } from '@/services/supabase/client';
import { userService } from '@/services/supabase/userService';
import type { AuthMethod, AuthResult, MagicLinkResult } from '@/types';
import type { UserProfile } from '@/types/user';
import { analytics } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { RememberMeModal } from '../components/ui/RememberMeModal';
import { backgroundVideoCheck, initializeNotifications } from '../utils/notifications';

const log = createLogger('Auth');

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubscribed: boolean;
  userProfile: UserProfile | null;
  authMethod: AuthMethod | null;
  signIn: () => Promise<AuthResult>;
  signInWithMagicLink: (email: string) => Promise<MagicLinkResult>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  isDemoMode: boolean;
  magicLinkPending: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  isSubscribed: false,
  userProfile: null,
  authMethod: null,
  signIn: async () => ({ success: false }),
  signInWithMagicLink: async () => ({ success: false }),
  signInDemo: async () => { },
  signOut: async () => { },
  error: null,
  updateUserProfile: () => { },
  isDemoMode: false,
  magicLinkPending: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [magicLinkPending, setMagicLinkPending] = useState(false);

  // Remember Me modal state
  const [showRememberMeModal, setShowRememberMeModal] = useState(false);
  const [pendingAuthResult, setPendingAuthResult] = useState<AuthResult | null>(null);
  const [isTemporarySession, setIsTemporarySession] = useState(false);

  // Ref to track if sign out is in progress (for edge case #4)
  const isSigningOut = useRef(false);

  // Ref to track magic link pending timeout (auto-clear after 2 minutes)
  const magicLinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAGIC_LINK_PENDING_TIMEOUT = 2 * 60 * 1000; // 2 minutes

  /**
   * Clear the magic link pending timeout
   */
  const clearMagicLinkTimeout = useCallback(() => {
    if (magicLinkTimeoutRef.current) {
      clearTimeout(magicLinkTimeoutRef.current);
      magicLinkTimeoutRef.current = null;
    }
  }, []);

  /**
   * Complete authentication after successful auth (Google or Magic Link)
   */
  const completeAuthentication = useCallback(async (
    result: AuthResult,
    rememberMe: boolean = true
  ): Promise<boolean> => {
    try {
      if (!result.userData) {
        log.error('No user data in auth result');
        setError('Authentication failed - no user data');
        return false;
      }

      // Map user data based on auth method
      let upsertInput;
      const method = result.authMethod || 'google';

      if (method === 'magic_link') {
        // Magic link auth - user ID is Supabase UUID
        upsertInput = {
          googleId: result.userData.id, // Using Supabase user ID
          email: result.userData.email,
          fullName: result.userData.name || result.userData.email?.split('@')[0] || 'User',
          avatarUrl: result.userData.picture,
          isSubscribed: false, // Magic link users don't have YouTube subscription
        };
      } else {
        // Google OAuth - user ID is Google ID
        upsertInput = {
          googleId: result.userData.id,
          email: result.userData.email,
          fullName: result.userData.name || result.userData.email,
          avatarUrl: result.userData.picture,
          isSubscribed: result.isSubscribed || false,
        };
      }

      // Save/update user data in Supabase
      const supabaseUser = await userService.upsertUserProfile(upsertInput);

      if (!supabaseUser) {
        log.error('Failed to save user to database');
        setError('Failed to create user profile');
        return false;
      }

      let updatedUser = supabaseUser;

      // For Google OAuth users, check channel subscriptions and award XP
      if (method === 'google' && result.allChannelSubscriptions) {
        try {
          const { updateChannelSubscriptionsAndAwardXP } = await import('../utils/channelSubscriptions');
          const xpResult = await updateChannelSubscriptionsAndAwardXP(
            supabaseUser.google_id,
            result.allChannelSubscriptions
          );

          if (xpResult.totalXPAwarded > 0) {
            log.info('Awarded XP for channel subscriptions on sign-in', { xp: xpResult.totalXPAwarded });
            updatedUser = xpResult.updatedUser;
          }
        } catch (error) {
          log.error('Failed to process channel subscriptions:', error);
        }
      }

      // Check video likes and award XP (Google OAuth only)
      if (method === 'google') {
        try {
          log.debug('Checking video likes on sign-in...');
          const { checkAndAwardVideoLikes } = await import('../utils/videoLikes');

          const accessToken = await tokenManager.getValidAccessToken();
          if (accessToken) {
            const likesResult = await checkAndAwardVideoLikes(accessToken, supabaseUser.id);

            if (likesResult.xpAwarded > 0) {
              log.info('Awarded XP for video likes on sign-in', { xp: likesResult.xpAwarded });
              const refreshedUser = await userService.getUserProfile(supabaseUser.google_id);
              if (refreshedUser) {
                updatedUser = refreshedUser;
              }
            }
          }
        } catch (error) {
          log.error('Failed to check video likes on sign-in:', error);
        }
      }

      // Update state
      setUserProfile(updatedUser);
      setIsAuthenticated(true);
      setIsSubscribed(result.isSubscribed || false);
      setIsTemporarySession(!rememberMe);
      setAuthMethod(method);
      log.info('User authenticated successfully', {
        userId: updatedUser.id,
        method,
        email: updatedUser.email
      });

      // Set analytics user id
      analytics.setUserId(updatedUser.google_id);

      // Store session
      if (result.tokenData) {
        await tokenManager.storeSession(
          result.tokenData,
          result.userData,
          result.isSubscribed || false,
          rememberMe,
          method
        );
      }

      // Initialize notifications for newly authenticated users
      await initializeNotifications();

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete authentication';
      log.error('Error completing authentication:', err);
      setError(errorMessage);
      return false;
    }
  }, []);

  /**
   * Handle deep link for magic link callback
   */
  const handleDeepLink = useCallback(async (url: string) => {
    if (!url) return;

    log.info('--- Deep Link Received ---');
    log.info('Full URL:', url);

    // Filter out internal Expo router paths if they aren't auth related
    if (url.includes('expo-router')) {
      log.debug('Ignoring internal expo-router URL');
      return;
    }

    // Check if this is a magic link callback
    const isMagicLink =
      url.includes('access_token=') ||
      url.includes('refresh_token=') ||
      url.includes('type=magiclink') ||
      url.includes('type=signup') ||
      url.includes('auth/callback');

    if (isMagicLink) {
      log.info('MATCH: Magic link detected. Initializing authentication...');

      setIsLoading(true);
      clearMagicLinkTimeout();
      setMagicLinkPending(false);

      try {
        const result = await authService.handleMagicLinkCallback(url);

        log.info('Magic link processing result:', { success: result.success });

        if (isSigningOut.current) {
          log.info('Sign out detected during processing, aborting login');
          return;
        }

        if (result.success) {
          log.info('Authentication successful, completing sign-in...');
          await completeAuthentication(result, true);
        } else {
          log.error('Magic link authentication failed:', result.error);
          setError(result.error || 'Magic link authentication failed');
        }
      } catch (err) {
        log.error('Exception during magic link processing:', err);
        setError('Failed to process magic link');
      } finally {
        if (!isSigningOut.current) {
          setIsLoading(false);
        }
      }
    } else {
      log.info('NO MATCH: URL does not appear to be a magic link callback');
    }
  }, [isAuthenticated, completeAuthentication, clearMagicLinkTimeout]);

  // Set up deep link listener on mount
  useEffect(() => {
    // Handle initial URL (app opened via deep link)
    const getInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        log.info('🔗 INITIAL URL CHECK:', { initialUrl: initialUrl || 'none' });
        if (initialUrl) {
          handleDeepLink(initialUrl);
        }
      } catch (err) {
        log.error('Error getting initial URL:', err);
      }
    };

    getInitialURL();

    // Listen for deep links while app is open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      log.info('🔗 DEEP LINK RECEIVED:', { url });
      handleDeepLink(url);
    });

    // Also listen to Supabase auth state changes for magic link
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        log.debug('Supabase auth state change', { event });

        if (event === 'SIGNED_IN' && session && magicLinkPending) {
          // Session established from magic link
          const result: AuthResult = {
            success: true,
            userData: {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
              picture: session.user.user_metadata?.avatar_url,
            },
            tokenData: {
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              expiresIn: session.expires_in || 3600,
              expiresAt: (session.expires_at || 0) * 1000,
              tokenType: session.token_type || 'Bearer',
            },
            authMethod: 'magic_link',
          };

          await completeAuthentication(result, true);
          clearMagicLinkTimeout();
          setMagicLinkPending(false);
          setIsLoading(false);
        }
      }
    );

    return () => {
      subscription.remove();
      authSubscription.unsubscribe();
      clearMagicLinkTimeout();
    };
  }, [handleDeepLink, magicLinkPending, completeAuthentication, clearMagicLinkTimeout]);

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
            setAuthMethod(persistedResult.authMethod || 'google');
            log.info('Successfully loaded persisted session', {
              email: persistedResult.userData.email,
              method: persistedResult.authMethod
            });

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

  // Listen for app state changes to perform background verification
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active' && isAuthenticated && !isDemoMode && userProfile?.id) {
        log.info('App became active, performing background checks...');

        // Edge case #2: Check and refresh session after long inactivity
        const session = await tokenManager.getStoredSession();
        if (!session) {
          log.warn('Session not found on app resume, signing out');
          await signOut();
          return;
        }

        // For Google OAuth: Check subscription status
        if (authMethod === 'google') {
          try {
            const subscriptionStatus = await authService.triggerBackgroundVerification(session);
            if (typeof subscriptionStatus === 'boolean' && subscriptionStatus !== isSubscribed) {
              setIsSubscribed(subscriptionStatus);
              log.info('Subscription status updated', { subscriptionStatus });
            }
          } catch (err) {
            // Non-blocking - just log
            log.warn('Background verification failed (non-blocking)', err);
          }

          // Check for new videos and send notifications
          if (isSubscribed) {
            await backgroundVideoCheck();
          }
        }

        // Perform background XP checks (subscriptions + video likes) for Google users
        if (authMethod === 'google') {
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
        }
      } else if (nextAppState === 'background' && isAuthenticated && isTemporarySession && !isDemoMode) {
        log.info('App went to background with temporary session - clearing session...');
        await tokenManager.clearSession();
        setIsAuthenticated(false);
        setIsSubscribed(false);
        setUserProfile(null);
        setIsTemporarySession(false);
        setAuthMethod(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAuthenticated, isSubscribed, isTemporarySession, isDemoMode, userProfile?.id, userProfile?.google_id, authMethod]);

  /**
   * Sign in with Google OAuth
   */
  const signIn = async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);
    isSigningOut.current = false;

    try {
      const result = await authService.authenticate();

      if (result.success && result.userData) {
        // Always complete authentication - no subscription gating
        // Show Remember Me modal for better UX
        setPendingAuthResult(result);
        setShowRememberMeModal(true);
        setIsLoading(false);

        return { success: true, userData: result.userData, isSubscribed: result.isSubscribed };
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

  /**
   * Sign in with Email Magic Link
   */
  const signInWithMagicLink = async (email: string): Promise<MagicLinkResult> => {
    setError(null);
    isSigningOut.current = false;

    // Clear any existing timeout
    clearMagicLinkTimeout();

    try {
      const result = await authService.signInWithMagicLink(email);

      if (result.success) {
        setMagicLinkPending(true);
        log.info('Magic link sent, waiting for callback...', { email });

        // Auto-clear after 2 minutes
        magicLinkTimeoutRef.current = setTimeout(() => {
          log.info('Magic link pending state auto-cleared after timeout');
          setMagicLinkPending(false);
        }, MAGIC_LINK_PENDING_TIMEOUT);
      } else {
        setError(result.error || 'Failed to send magic link');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error sending magic link';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Sign in with demo mode - loads real demo user from database
   */
  const signInDemo = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    isSigningOut.current = false;

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
      setAuthMethod(null); // Demo mode has no auth method

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

  /**
   * Sign out
   */
  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    isSigningOut.current = true; // Edge case #4: Mark sign out in progress

    try {
      // Only clear user session if not in demo mode
      if (!isDemoMode) {
        await tokenManager.clearSession();

        // For magic link sessions, also sign out from Supabase
        if (authMethod === 'magic_link') {
          await authService.signOutSupabase();
        }
      }

      setIsAuthenticated(false);
      setIsSubscribed(false);
      setUserProfile(null);
      setIsDemoMode(false);
      setAuthMethod(null);
      clearMagicLinkTimeout();
      setMagicLinkPending(false);
      log.info('User signed out successfully');
      analytics.setUserId(null);
    } catch (err) {
      log.error('Sign out error:', err);
      setError('Failed to sign out');
    } finally {
      setIsLoading(false);
      isSigningOut.current = false;
    }
  };

  /**
   * Handle Remember Me modal choice
   */
  const handleRememberMeChoice = async (rememberMe: boolean) => {
    setIsLoading(true);
    setShowRememberMeModal(false);

    if (!pendingAuthResult) {
      setError('No pending authentication result');
      setIsLoading(false);
      return;
    }

    const success = await completeAuthentication(pendingAuthResult, rememberMe);

    if (!success) {
      // Error already set in completeAuthentication
    }

    setPendingAuthResult(null);
    setIsLoading(false);
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
        authMethod,
        signIn,
        signInWithMagicLink,
        signInDemo,
        signOut,
        error,
        updateUserProfile,
        isDemoMode,
        magicLinkPending,
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

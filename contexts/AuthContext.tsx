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

import { authService, rememberMeService, tokenManager } from '@/services/auth';
import { supabase } from '@/services/supabase/client';
import { userService } from '@/services/supabase/userService';
import { areAllChannelsVerified, verifyAndAwardSubscriptionXP } from '@/services/youtube/subscriptionService';
import { incrementDataVersion } from '@/services/youtube/verificationDataVersion';
import type { AuthMethod, AuthResult, MagicLinkResult } from '@/types';
import type { UserProfile } from '@/types/user';
import { analytics } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { RememberMeModal } from '../components/ui/RememberMeModal';
import { initializeNotifications, registerForPushNotificationsAsync, savePushTokenToDatabase, sendSubscriptionVerificationNotification } from '../utils/notifications';

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
  finalizeSession: (rememberMe: boolean) => Promise<boolean>;
  showRememberMeModal: boolean;
  handleDeepLink: (url: string) => Promise<void>;
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
  finalizeSession: async () => false,
  showRememberMeModal: false,
  handleDeepLink: async () => { },
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
   * This creates a temporary session and shows the Remember Me modal
   */
  const completeAuthentication = useCallback(async (
    result: AuthResult
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

      // Store temporary session (will be updated after Remember Me choice)
      if (result.tokenData) {
        await tokenManager.storeSession(
          result.tokenData,
          result.userData,
          result.isSubscribed || false,
          false, // Start with temporary session
          method
        );
      }

      // Check if user has existing "Remember Me" preference
      log.debug('Checking for existing Remember Me preference', {
        email: result.userData.email,
        method
      });
      const existingPreference = await rememberMeService.getPreference(result.userData.email);
      log.debug('Existing preference result', {
        found: !!existingPreference,
        rememberMe: existingPreference?.rememberMe,
        expiresAt: existingPreference?.expiresAt ? new Date(existingPreference.expiresAt).toISOString() : null
      });

      if (existingPreference && existingPreference.rememberMe) {
        // User previously chose "Remember Me" - skip modal and apply preference
        log.info('User has existing Remember Me preference, auto-applying');

        // Update session to be persistent
        if (result.tokenData) {
          await tokenManager.storeSession(
            result.tokenData,
            result.userData,
            result.isSubscribed || false,
            true, // Persistent session
            method
          );
        }

        // Finalize user and update preference timestamp
        await rememberMeService.setPreference(result.userData.email, true);

        setUserProfile(updatedUser);
        setAuthMethod(method);
        setIsSubscribed(result.isSubscribed || false);
        setIsAuthenticated(true);

        // Perform background checks for Google users
        if (method === 'google' && updatedUser.google_id && updatedUser.id) {
          performBackgroundChecks(updatedUser.google_id, updatedUser.id);
        }

        return true;
      }

      // No existing preference - show Remember Me modal
      log.info('No existing Remember Me preference found, showing modal', {
        email: result.userData.email,
        preferenceExists: !!existingPreference,
        rememberMeValue: existingPreference?.rememberMe
      });
      setPendingAuthResult(result);
      setShowRememberMeModal(true);

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete authentication';
      log.error('Error completing authentication:', err);
      setError(errorMessage);
      return false;
    }
  }, []);

  /**
   * Finalize session with Remember Me preference
   */
  const finalizeSession = useCallback(async (rememberMe: boolean): Promise<boolean> => {
    try {
      if (!pendingAuthResult || !pendingAuthResult.userData?.email) {
        log.error('No pending auth result to finalize');
        return false;
      }

      // Save the user's preference
      await rememberMeService.setPreference(pendingAuthResult.userData.email, rememberMe);

      // Update session with correct expiry
      if (pendingAuthResult.tokenData) {
        await tokenManager.storeSession(
          pendingAuthResult.tokenData,
          pendingAuthResult.userData,
          pendingAuthResult.isSubscribed || false,
          rememberMe,
          pendingAuthResult.authMethod || 'google'
        );
      }

      // Get user profile and update context
      const supabaseUser = await userService.getUserProfile(
        pendingAuthResult.authMethod === 'magic_link'
          ? pendingAuthResult.userData.id
          : pendingAuthResult.userData.id
      );

      if (supabaseUser) {
        setUserProfile(supabaseUser);
        setIsAuthenticated(true);
        setIsSubscribed(supabaseUser.youtube_subscribed || false);
        setAuthMethod(pendingAuthResult.authMethod || 'google');
        setIsTemporarySession(!rememberMe);

        // Set analytics user id
        analytics.setUserId(supabaseUser.google_id);

        // Initialize notifications (non-blocking - don't delay user)
        initializeNotifications().catch(error => {
          log.warn('Failed to initialize notifications (non-blocking)', error);
        });

        // Register and save push token for server-sent notifications
        registerForPushNotificationsAsync().then(async (token) => {
          if (token && supabaseUser.id) {
            await savePushTokenToDatabase(supabaseUser.id, token);
          }
        }).catch(error => {
          log.warn('Failed to save push token (non-blocking)', error);
        });

        // Perform background checks for Google OAuth users (non-blocking)
        if (pendingAuthResult.authMethod === 'google' && supabaseUser.id && supabaseUser.google_id) {
          // Don't await these - let them run in background
          // Subscription verification happens here, NOT during login
          performBackgroundChecks(supabaseUser.google_id, supabaseUser.id)
            .catch(error => {
              log.warn('Background checks failed (non-blocking)', error);
            });
        }

        log.info('Session finalized with Remember Me preference', {
          email: pendingAuthResult.userData.email,
          rememberMe,
          method: pendingAuthResult.authMethod
        });
      }

      // Clear pending state
      setPendingAuthResult(null);
      setShowRememberMeModal(false);

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to finalize session';
      log.error('Error finalizing session:', err);
      setError(errorMessage);
      return false;
    }
  }, [pendingAuthResult]);

  /**
   * Perform background subscription and XP checks
   * This runs AFTER login completes to avoid blocking the user
   */
  const performBackgroundChecks = useCallback(async (
    googleId: string,
    supabaseUserId: string
  ) => {
    try {
      log.info('Starting background subscription verification...', {
        googleId,
        supabaseUserId
      });

      // Check DB first - skip if all channels already verified
      const alreadyAllVerified = await areAllChannelsVerified(supabaseUserId);
      if (alreadyAllVerified) {
        log.info('All channels already verified in DB, skipping background check');
        return;
      }

      // Get access token for YouTube API calls
      const accessToken = await tokenManager.getValidAccessToken();
      if (!accessToken) {
        log.warn('No valid access token for background checks');
        return;
      }

      log.info('Access token obtained for background checks', {
        tokenLength: accessToken.length,
        tokenPrefix: accessToken.substring(0, 10),
        hasWhitespace: accessToken !== accessToken.trim(),
      });

      // Check and award XP for channel subscriptions using new service
      try {
        log.info('Calling verifyAndAwardSubscriptionXP', {
          supabaseUserId,
          googleId,
        });

        const result = await verifyAndAwardSubscriptionXP(
          accessToken,
          supabaseUserId,
          googleId,
          false // Use cache if available
        );

        if (result.success) {
          log.info('Background: Channel subscriptions checked', {
            subscriptions: result.statuses.map(s => ({ channel: s.channelKey, subscribed: s.isSubscribed })),
            xpAwarded: result.totalXPAwarded
          });

          // Check if user is subscribed to main HamaKi channel
          const hamakiSubscribed = result.statuses.find(s => s.channelKey === 'hamaki')?.isSubscribed || false;

          // Send notification for subscription verification results
          if (result.totalXPAwarded > 0) {
            // Signal that verification data has been updated
            await incrementDataVersion();

            await sendSubscriptionVerificationNotification(true, 'HamaKi');

            // Refresh user profile to get updated XP
            const updatedProfile = await userService.getUserProfile(googleId);
            if (updatedProfile) {
              setUserProfile(updatedProfile);
            }
          } else if (!hamakiSubscribed) {
            // Send notification that subscription was not found
            await sendSubscriptionVerificationNotification(false, 'HamaKi');
          }
        }
      } catch (err) {
        log.warn('Failed to check channel subscriptions in background', err);
      }

      // NOTE: Video like XP checks are now manual-only (from Settings)
      // to save YouTube API quota and comply with YouTube policy

      log.info('Background subscription verification completed');
    } catch (error) {
      log.error('Error in background checks:', error);
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
          await completeAuthentication(result);
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

          await completeAuthentication(result);
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
          // Check if user chose to stay signed in
          const preference = await rememberMeService.getPreference(persistedResult.userData.email);

          if (!preference || !preference.rememberMe) {
            log.info('User chose not to stay signed in, clearing session', {
              email: persistedResult.userData.email,
              rememberMe: preference?.rememberMe ?? false
            });
            await tokenManager.clearSession();
            return;
          }

          // Load user from Supabase to get latest profile data
          const supabaseUser = await userService.getUserProfile(persistedResult.userData.id);

          if (supabaseUser) {
            setUserProfile(supabaseUser);
            setIsAuthenticated(true);
            setIsSubscribed(persistedResult.isSubscribed || false);
            setAuthMethod(persistedResult.authMethod || 'google');
            log.info('Successfully auto-signed in user', {
              email: persistedResult.userData.email,
              method: persistedResult.authMethod,
              rememberMe: preference.rememberMe
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

          // Note: Background video polling removed - notifications now sent server-side
          // when sync-youtube-videos Edge Function finds new videos
        }

        // NOTE: Background XP checks removed to save YouTube API quota
        // Users can manually verify subscriptions and video likes from Settings
        // See: hooks/useYouTubeVerification.ts
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
        // Complete authentication - this will check for existing Remember Me preference
        await completeAuthentication(result);
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
   * NOTE: We don't set isLoading here - user should proceed to app immediately
   * Background checks happen silently after authentication
   */
  const handleRememberMeChoice = async (rememberMe: boolean) => {
    setShowRememberMeModal(false);

    if (!pendingAuthResult) {
      setError('No pending authentication result');
      return;
    }

    const success = await finalizeSession(rememberMe);

    if (!success) {
      // Error already set in finalizeSession
    }

    setPendingAuthResult(null);
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
        finalizeSession,
        showRememberMeModal,
        handleDeepLink,
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

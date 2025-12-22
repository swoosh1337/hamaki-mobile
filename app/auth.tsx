import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { MagicLinkButton } from '@/components/ui/MagicLinkButton';
import { MagicLinkModal } from '@/components/ui/MagicLinkModal';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/utils/logger';

const log = createLogger('Auth');

/**
 * Authentication screen component
 * Displays the welcome screen with Google and Email sign-in options
 */
function AuthScreen() {
  const { signIn, signInWithMagicLink, isLoading, signInDemo, magicLinkPending, isAuthenticated } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const isAuthenticating = useRef(false);

  // Magic Link modal state
  const [showMagicLinkModal, setShowMagicLinkModal] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [magicLinkSuccess, setMagicLinkSuccess] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  // Secret demo mode activation
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigate to main app when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  // Monitor app state changes to detect return from OAuth
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      log.debug('App state changed', { from: appState.current, to: nextAppState });

      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isAuthenticating.current
      ) {
        log.debug('App became active after OAuth - checking for auth completion');
        // Give a longer delay for any pending auth operations to complete
        setTimeout(() => {
          log.debug('Checking if WebBrowser can complete auth session');
          WebBrowser.maybeCompleteAuthSession();

          // Additional retry after a bit more time
          setTimeout(() => {
            log.debug('Second attempt to complete auth session');
            WebBrowser.maybeCompleteAuthSession();
          }, 2000);
        }, 1500);
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  // Handle secret tap to activate demo mode
  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Clear existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }

    // Reset tap count after 2 seconds of inactivity
    tapTimeoutRef.current = setTimeout(() => {
      setTapCount(0);
    }, 2000);

    // Activate demo mode after 5 taps
    if (newCount >= 5) {
      setTapCount(0);
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      handleDemoSignIn();
    }
  };

  // Handle demo sign-in
  const handleDemoSignIn = async () => {
    log.debug('Starting demo mode');
    setErrorMessage(null);

    try {
      await signInDemo();
      router.replace('/(tabs)');
    } catch (error) {
      log.error('Demo sign in error', error);
      setErrorMessage('Demo mode failed. Please try again.');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

  // Handle sign-in button press with Google authentication
  const handleSignIn = async () => {
    log.debug('Starting authentication process');
    setErrorMessage(null);
    isAuthenticating.current = true;

    try {
      const result = await signIn();
      isAuthenticating.current = false;

      log.debug('Authentication result received', result);

      if (result.success) {
        // Authentication successful - navigation handled by useEffect
        log.info('Google authentication successful');
      } else {
        // Authentication failed
        log.debug('Authentication failed', { error: result.error });
        setErrorMessage(result.error || 'Authentication failed. Please try again.');
      }
    } catch (error) {
      log.error('Sign in error', error);
      isAuthenticating.current = false;
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  };

  // Handle magic link button press
  const handleMagicLinkPress = () => {
    setMagicLinkError(null);
    setMagicLinkSuccess(false);
    setShowMagicLinkModal(true);
  };

  // Handle sending magic link with retry support
  const handleSendMagicLink = async (email: string, retryCount = 0) => {
    log.debug('Sending magic link', { email, attempt: retryCount + 1 });
    setMagicLinkError(null);
    setMagicLinkLoading(true);

    try {
      const result = await signInWithMagicLink(email);

      if (result.success) {
        log.info('Magic link sent successfully');
        setMagicLinkSuccess(true);
      } else {
        log.warn('Magic link failed', { error: result.error });

        // Auto-retry once for network errors (production-ready pattern)
        const isNetworkError = result.error?.includes('ინტერნეტთან') ||
          result.error?.toLowerCase().includes('network');

        if (isNetworkError && retryCount < 1) {
          log.info('Auto-retrying after network error...');
          // Wait 2 seconds and retry once
          await new Promise(resolve => setTimeout(resolve, 2000));
          return handleSendMagicLink(email, retryCount + 1);
        }

        setMagicLinkError(result.error || 'Failed to send magic link');
      }
    } catch (error) {
      log.error('Magic link error', error);
      setMagicLinkError('მოულოდნელი შეცდომა. გთხოვთ სცადოთ თავიდან.');
    } finally {
      setMagicLinkLoading(false);
    }
  };

  // Handle modal close
  const handleCloseMagicLinkModal = () => {
    setShowMagicLinkModal(false);
    // If magic link was sent, show pending state in main UI
    if (magicLinkSuccess) {
      setMagicLinkSuccess(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.tint} />
            <Text style={styles.loadingText}>
              {magicLinkPending ? 'Waiting for magic link...' : 'Verifying...'}
            </Text>
          </View>
        )}

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Welcome Text - Secret tap area for demo mode */}
        <TouchableOpacity
          onPress={handleSecretTap}
          activeOpacity={0.9}
          style={styles.welcomeContainer}
        >
          <Text style={styles.welcomeText}>WELCOME TO</Text>
          <Text style={styles.brandText}>HAMAKI</Text>
        </TouchableOpacity>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          შემოგვიერთდი სწრაფად და მარტივად
        </Text>

        {/* Auth Buttons */}
        <View style={styles.buttonContainer}>
          {/* Google Sign In - Primary */}
          <GoogleSignInButton onPress={handleSignIn} />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ან</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Magic Link - Secondary */}
          <MagicLinkButton
            onPress={handleMagicLinkPress}
            disabled={isLoading}
          />
        </View>

        {/* Magic Link Pending Indicator */}
        {magicLinkPending && (
          <View style={styles.pendingContainer}>
            <Text style={styles.pendingText}>
              ✉️ შეამოწმე ელფოსტა!
            </Text>
          </View>
        )}

        {/* Error Message */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
      </View>

      {/* Magic Link Modal */}
      <MagicLinkModal
        visible={showMagicLinkModal}
        onClose={handleCloseMagicLinkModal}
        onSendLink={handleSendMagicLink}
        isLoading={magicLinkLoading}
        error={magicLinkError}
        success={magicLinkSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background, // Dark navy background
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 12, 26, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
    marginTop: 16,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  welcomeContainer: {
    alignItems: 'center',
  },
  welcomeText: {
    fontFamily: 'SpaceMono',
    fontSize: 28,
    color: Colors.dark.text, // White/light gray
    textAlign: 'center',
  },
  brandText: {
    fontFamily: 'HamakiGeo',
    fontSize: 64,
    color: Colors.dark.tint, // Neon green
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text, // White/light gray
    textAlign: 'center',
    marginBottom: 48,
    opacity: 0.7,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 24,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 16,
  },
  pendingContainer: {
    padding: 16,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    width: '100%',
    maxWidth: 320,
    marginTop: 16,
  },
  pendingText: {
    fontFamily: 'HamakiGeo',
    fontSize: 14,
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  errorContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 8,
    width: '100%',
    maxWidth: 320,
  },
  errorText: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
  },
});

export default AuthScreen;

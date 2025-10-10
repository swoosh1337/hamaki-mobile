import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Authentication screen component
 * Displays the welcome screen with Google sign-in option
 */
function AuthScreen() {
  const { signIn, isLoading, signInDemo } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const isAuthenticating = useRef(false);
  
  // Secret demo mode activation
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Monitor app state changes to detect return from OAuth
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('🔍 App state changed from', appState.current, 'to', nextAppState);
      
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isAuthenticating.current
      ) {
        console.log('🔍 App became active after OAuth - checking for auth completion');
        // Give a longer delay for any pending auth operations to complete
        setTimeout(() => {
          console.log('🔍 Checking if WebBrowser can complete auth session');
          WebBrowser.maybeCompleteAuthSession();
          
          // Additional retry after a bit more time
          setTimeout(() => {
            console.log('🔍 Second attempt to complete auth session');
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
    console.log('🔍 Starting demo mode');
    setErrorMessage(null);
    
    try {
      await signInDemo();
      router.replace('/(tabs)');
    } catch (error) {
      console.error('🔍 Demo sign in error:', error);
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
    console.log('🔍 Starting authentication process');
    setErrorMessage(null);
    isAuthenticating.current = true;
    
    try {
      const result = await signIn();
      isAuthenticating.current = false;
      
      console.log('🔍 Authentication result received:', result);
      
      if (result.success) {
        if (result.isSubscribed) {
          // User is subscribed to Hamaki channel, allow access
          router.replace('/(tabs)');
        } else {
          // User is not subscribed, show error message
          setErrorMessage("გამოიწერეთ ჰამაკის არხი რომ შეძლოთ აუტორიზაცია");
        }
      } else {
        // Authentication failed
        console.log('🔍 Authentication failed:', result.error);
        setErrorMessage(result.error || 'Authentication failed. Please try again.');
      }
    } catch (error) {
      console.error('🔍 Sign in error:', error);
      isAuthenticating.current = false;
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.content}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.tint} />
            <Text style={styles.loadingText}>Verifying subscription...</Text>
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
          გამოიყენე შენი YouTube ექაუნთი{'\n'} რომ შემოგვიერთდე
        </Text>
        
        {/* Sign In Button */}
        <View style={styles.buttonContainer}>
          <GoogleSignInButton onPress={handleSignIn} />
        </View>
        
        {/* Error Message */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
        
        {/* Footer Text */}
        <Text style={styles.footerText}>
          მხოლოდ გამომწერებისათვის
        </Text>
      </View>
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
    fontFamily: 'hamaki-eng',
    fontSize: 64,
    color: Colors.dark.tint, // Neon green
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontFamily: 'SpaceMono',
    fontSize: 18,
    color: Colors.dark.text, // White/light gray
    textAlign: 'center',
    marginBottom: 60,
    opacity: 0.8,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 40,
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
  footerText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text, // White/light gray
    textAlign: 'center',
    opacity: 0.6,
    position: 'absolute',
    bottom: 40,
  },
});

export default AuthScreen;

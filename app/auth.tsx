import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { Colors } from '@/constants/Colors';

/**
 * Authentication screen component
 * Displays the welcome screen with Google sign-in option
 */
export default function AuthScreen() {
  // Handle sign-in button press - currently just navigates to the main app
  const handleSignIn = () => {
    // In a real app, this would handle the authentication process
    // For now, just navigate to the main app
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        
        {/* Welcome Text */}
        <Text style={styles.welcomeText}>WELCOME TO</Text>
        <Text style={styles.brandText}>HAMAKI</Text>
        
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Sign in with your YouTube account{'\n'}to get exclusive access.
        </Text>
        
        {/* Sign In Button */}
        <View style={styles.buttonContainer}>
          <GoogleSignInButton onPress={handleSignIn} />
        </View>
        
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
  logoContainer: {
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
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
    fontSize: 18,
    color: Colors.dark.text, // White/light gray
    textAlign: 'center',
    marginBottom: 60,
    opacity: 0.8,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 60,
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

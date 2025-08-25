import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/AuthContext';
import { ContentProvider } from '@/contexts/ContentContext';
import { useColorScheme } from '@/hooks/useColorScheme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Complete auth session setup for OAuth redirects
WebBrowser.maybeCompleteAuthSession();

function RootLayout() {
  // We're using DarkTheme exclusively now
  useColorScheme(); // Keep this hook to maintain theme context
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'hamaki-eng': require('../assets/fonts/Hamaki-ENG.otf'),
    HamakiGeo: require('../assets/fonts/HamakiGEO.otf'),
  });

  useEffect(() => {
    if (loaded) {
      // Hide the splash screen after the fonts have loaded and the
      // UI is ready to be displayed
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <AuthProvider>
      <ContentProvider>
        <ThemeProvider value={DarkTheme}>
          <Stack initialRouteName="auth">
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </ContentProvider>
    </AuthProvider>
  );
}

export default RootLayout;

import React, { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { VideoProvider } from '@/contexts/VideoContext';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  // We're using DarkTheme exclusively now
  useColorScheme(); // Keep this hook to maintain theme context
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    HamakiGeo: require('../assets/fonts/HamakiGEO.otf'),
    HamakiENG: require('../assets/fonts/Hamaki-ENG.otf'),
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
      <VideoProvider>
        <ThemeProvider value={DarkTheme}>
          <Stack initialRouteName="auth">
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </VideoProvider>
    </AuthProvider>
  );
}

export default RootLayout;

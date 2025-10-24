import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { ContentProvider } from '@/contexts/ContentContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { preloadAllGameAssets, setNoPogodAssetsLoaded } from '@/utils/gameAssetPreloader';

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

  const [gameAssetsLoaded, setGameAssetsLoaded] = useState(false);

  // Pre-load game assets on app start
  useEffect(() => {
    console.log('🎮 Starting game asset pre-load on app start...');
    preloadAllGameAssets()
      .then((result) => {
        console.log('✅ Game assets pre-loaded on app start:', result);
        setNoPogodAssetsLoaded(true);
        setGameAssetsLoaded(true);
      })
      .catch((error) => {
        console.error('❌ Failed to pre-load game assets on app start:', error);
        // Allow app to continue even if game assets fail
        setGameAssetsLoaded(true);
      });
  }, []);

  // Hide splash screen only when both fonts AND game assets are loaded
  useEffect(() => {
    if (loaded && gameAssetsLoaded) {
      console.log('✅ All resources loaded - hiding splash screen');
      SplashScreen.hideAsync();
    }
  }, [loaded, gameAssetsLoaded]);

  if (!loaded || !gameAssetsLoaded) {
    // Keep splash screen visible while loading
    return null;
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default RootLayout;

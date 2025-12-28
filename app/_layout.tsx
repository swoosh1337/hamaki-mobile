import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import NewRelic from 'newrelic-react-native-agent';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { ContentProvider } from '@/contexts/ContentContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  isPostHogConfigured,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  setPostHogClient,
} from '@/utils/analytics';
import { createLogger, initNewRelic } from '@/utils/logger';
import * as packageJson from '../package.json';

const log = createLogger('RootLayout');

// Initialize New Relic Agent for production
const NEW_RELIC_IOS_TOKEN = process.env.EXPO_PUBLIC_NEW_RELIC_IOS_TOKEN;
const NEW_RELIC_ANDROID_TOKEN = process.env.EXPO_PUBLIC_NEW_RELIC_ANDROID_TOKEN;

const appToken = Platform.OS === 'ios' ? NEW_RELIC_IOS_TOKEN : NEW_RELIC_ANDROID_TOKEN;

if (appToken && !__DEV__) {
  const agentConfiguration = {
    analyticsEventEnabled: true,
    crashReportingEnabled: true,
    interactionTracingEnabled: true,
    networkRequestEnabled: true,
    networkErrorRequestEnabled: true,
    httpResponseBodyCaptureEnabled: true,
    loggingEnabled: true,
    logLevel: NewRelic.LogLevel.INFO,
    webViewInstrumentation: true,
  };

  NewRelic.startAgent(appToken, agentConfiguration);
  NewRelic.setJSAppVersion(packageJson.version);

  initNewRelic({
    enabled: true,
    appName: 'hamaki-mobile',
  });

  console.log('New Relic agent started for production');
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Complete auth session setup for OAuth redirects
WebBrowser.maybeCompleteAuthSession();

/**
 * Component to set PostHog client reference for analytics functions
 */
function PostHogClientSetter({ children }: { children: React.ReactNode }) {
  const posthog = usePostHog();

  useEffect(() => {
    setPostHogClient(posthog);
  }, [posthog]);

  return <>{children}</>;
}

function RootLayout() {
  useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'hamaki-eng': require('../assets/fonts/Hamaki-ENG.otf'),
    HamakiEng: require('../assets/fonts/Hamaki-ENG.otf'),
    HamakiGeo: require('../assets/fonts/HamakiGEO.otf'),
  });

  useEffect(() => {
    if (loaded) {
      log.info('Fonts loaded - hiding splash screen');
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
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

function RootLayoutWithAnalytics() {
  // Only wrap with PostHogProvider in production builds
  if (!isPostHogConfigured()) {
    if (__DEV__) {
      console.log('PostHog disabled in development mode');
    }
    return <RootLayout />;
  }

  return (
    <PostHogProvider
      apiKey={POSTHOG_API_KEY}
      options={{
        host: POSTHOG_HOST,
      }}
    >
      <PostHogClientSetter>
        <RootLayout />
      </PostHogClientSetter>
    </PostHogProvider>
  );
}

export default RootLayoutWithAnalytics;

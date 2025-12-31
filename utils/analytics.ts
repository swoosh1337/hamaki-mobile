/**
 * PostHog Analytics
 *
 * Provides comprehensive analytics tracking using PostHog.
 * Uses PostHogProvider for proper React Native integration.
 *
 * Setup: Wrap your app with PostHogProvider in _layout.tsx
 */

import { PostHog } from 'posthog-react-native';

// PostHog configuration
export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

// Check if PostHog is configured and should be enabled (production only)
export const isPostHogConfigured = (): boolean => {
  // Only enable PostHog in production builds
  if (__DEV__) {
    return false;
  }
  return !!POSTHOG_API_KEY && POSTHOG_API_KEY !== '<YOUR_POSTHOG_API_KEY>';
};

// Reference to PostHog client (set by provider)
let posthogClient: PostHog | null = null;

/**
 * Set the PostHog client reference (called from PostHogProvider)
 */
export function setPostHogClient(client: PostHog | null): void {
  posthogClient = client;
}

/**
 * Get the PostHog client
 */
export function getPostHogClient(): PostHog | null {
  return posthogClient;
}

/**
 * Analytics client wrapper for convenience functions
 */
class AnalyticsClient {
  private userId: string | null = null;

  /**
   * Set the current user ID
   */
  setUserId(userId: string | null) {
    this.userId = userId;

    if (posthogClient && userId) {
      posthogClient.identify(userId);
    } else if (posthogClient && !userId) {
      posthogClient.reset();
    }
  }

  /**
   * Identify user with properties
   */
  identify(userId: string, properties?: Record<string, any>) {
    this.userId = userId;
    if (posthogClient) {
      posthogClient.identify(userId, properties);
    }
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>) {
    if (posthogClient && this.userId) {
      posthogClient.identify(this.userId, properties);
    }
  }

  /**
   * Track a custom event
   */
  track(eventName: string, properties?: Record<string, any>) {
    if (posthogClient) {
      posthogClient.capture(eventName, properties);
    }
  }

  /**
   * Track a screen view
   */
  screen(screenName: string, properties?: Record<string, any>) {
    if (posthogClient) {
      posthogClient.screen(screenName, properties);
    }
  }

  /**
   * Flush events immediately
   */
  async flush() {
    if (posthogClient) {
      await posthogClient.flush();
    }
  }
}

export const analytics = new AnalyticsClient();

// ============================================================
// Convenience Helpers for Common Events
// ============================================================

// Tab Navigation
export function trackTabTap(tab: string) {
  analytics.track('tab_tap', { tab });
}

// Content/Posts
export function trackCarouselTap(postId: string, postType?: string) {
  analytics.track('carousel_tap', {
    post_id: postId,
    post_type: postType || null,
    source: 'carousel',
  });
}

export function trackPostOpen(postId: string, source: 'carousel' | 'list' = 'list') {
  analytics.track('post_open', { post_id: postId, source });
}

export function trackPostClose(postId: string, dwellMs: number, source: 'carousel' | 'list' = 'list') {
  analytics.track('post_close', {
    post_id: postId,
    source,
    dwell_time_ms: dwellMs,
    dwell_time_seconds: Math.round(dwellMs / 1000),
  });
}

// Screen Views
export function trackScreenView(screenName: string, properties?: Record<string, any>) {
  analytics.screen(screenName, properties);
}

// ============================================================
// Game Analytics
// ============================================================

export function trackGameStart(gameName: string, properties?: Record<string, any>) {
  analytics.track('game_start', {
    game_name: gameName,
    ...properties,
  });
}

export function trackGameEnd(
  gameName: string,
  score: number,
  properties?: Record<string, any>
) {
  analytics.track('game_end', {
    game_name: gameName,
    score,
    ...properties,
  });
}

export function trackGameSession(
  gameName: string,
  score: number,
  durationMs: number,
  properties?: Record<string, any>
) {
  analytics.track('game_session', {
    game_name: gameName,
    score,
    duration_ms: durationMs,
    duration_seconds: Math.round(durationMs / 1000),
    ...properties,
  });
}

// ============================================================
// User Actions
// ============================================================

export function trackSignIn(method: 'google' | 'magic_link' | 'demo') {
  analytics.track('sign_in', { method });
}

export function trackSignOut() {
  analytics.track('sign_out');
}

export function trackSignUp(method: 'google' | 'magic_link') {
  analytics.track('sign_up', { method });
}

// ============================================================
// Feature Usage
// ============================================================

export function trackFeatureUsed(featureName: string, properties?: Record<string, any>) {
  analytics.track('feature_used', {
    feature_name: featureName,
    ...properties,
  });
}

export function trackButtonClick(buttonName: string, screen?: string) {
  analytics.track('button_click', {
    button_name: buttonName,
    screen,
  });
}

// ============================================================
// XP & Rewards
// ============================================================

export function trackXPEarned(
  amount: number,
  source: 'game' | 'subscription' | 'video_like' | 'other',
  properties?: Record<string, any>
) {
  analytics.track('xp_earned', {
    amount,
    source,
    ...properties,
  });
}

// ============================================================
// YouTube Integration
// ============================================================

export function trackSubscriptionVerified(channelKey: string, xpAwarded: number) {
  analytics.track('subscription_verified', {
    channel_key: channelKey,
    xp_awarded: xpAwarded,
  });
}

export function trackVideoLiked(videoId: string, xpAwarded: number) {
  analytics.track('video_liked', {
    video_id: videoId,
    xp_awarded: xpAwarded,
  });
}

// ============================================================
// Errors & Performance
// ============================================================

export function trackError(errorName: string, errorMessage: string, properties?: Record<string, any>) {
  analytics.track('error', {
    error_name: errorName,
    error_message: errorMessage,
    ...properties,
  });
}

export function trackApiCall(
  endpoint: string,
  durationMs: number,
  success: boolean,
  properties?: Record<string, any>
) {
  analytics.track('api_call', {
    endpoint,
    duration_ms: durationMs,
    success,
    ...properties,
  });
}

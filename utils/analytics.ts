/**
 * PostHog Analytics with Database Dual-Write
 *
 * Provides comprehensive analytics tracking using PostHog.
 * Also writes key events to Supabase analytics_events table for admin dashboard.
 *
 * Setup: Wrap your app with PostHogProvider in _layout.tsx
 */

import { supabase } from '@/services/supabase/client';
import { PostHog } from 'posthog-react-native';
import { createLogger } from './logger';

const log = createLogger('Analytics');

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

// Events that should be written to the database for admin dashboard
const DB_TRACKED_EVENTS = new Set([
  'video_watch',
  'game_play',
  'game_start',
  'game_end',
  'sponsor_view',
  'sponsor_click',
  'sign_in',
  'sign_up',
]);

/**
 * Write an event to the Supabase analytics_events table
 * Non-blocking - errors are logged but don't affect the app
 */
async function writeToDatabase(
  eventName: string,
  userId: string | null,
  properties?: Record<string, any>
): Promise<void> {
  try {
    const { error } = await supabase.from('analytics_events').insert({
      event_name: eventName,
      user_id: userId || 'anonymous',
      post_id: properties?.post_id || properties?.video_id || null,
      post_type: properties?.post_type || properties?.content_type || null,
      screen: properties?.screen || null,
      context: properties || {},
    });

    if (error) {
      log.debug('Failed to write analytics event to DB', { eventName, error: error.message });
    }
  } catch (err) {
    log.debug('Error writing analytics to DB', { eventName, err });
  }
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
   * Get the current user ID
   */
  getUserId(): string | null {
    return this.userId;
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
   * Automatically dual-writes to database for important events
   */
  track(eventName: string, properties?: Record<string, any>) {
    // Send to PostHog
    if (posthogClient) {
      posthogClient.capture(eventName, properties);
    }

    // Dual-write to database for important events
    if (DB_TRACKED_EVENTS.has(eventName)) {
      writeToDatabase(eventName, this.userId, properties);
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

// ============================================================
// Video Watch Tracking (for admin dashboard)
// ============================================================

/**
 * Track when user clicks "Watch" button on a video
 * Dual-writes to PostHog and Supabase for admin dashboard
 */
export function trackVideoWatch(
  videoId: string,
  channelKey: string,
  videoTitle?: string,
  channelName?: string
) {
  analytics.track('video_watch', {
    video_id: videoId,
    channel_key: channelKey,
    video_title: videoTitle || null,
    channel_name: channelName || null,
    content_type: 'video',
  });
}

// ============================================================
// Game Play Tracking (for admin dashboard)
// ============================================================

/**
 * Track when user opens/starts a game
 * Dual-writes to PostHog and Supabase for admin dashboard
 */
export function trackGamePlay(gameId: string, gameName: string) {
  analytics.track('game_play', {
    game_id: gameId,
    game_name: gameName,
    content_type: 'game',
  });
}

// ============================================================
// Sponsor Tracking (for admin dashboard)
// ============================================================

/**
 * Track when user views or interacts with a sponsor
 * Dual-writes to PostHog and Supabase for admin dashboard
 */
export function trackSponsorView(sponsorId: string, sponsorName: string) {
  analytics.track('sponsor_view', {
    sponsor_id: sponsorId,
    sponsor_name: sponsorName,
    content_type: 'sponsor',
    action: 'view',
  });
}

/**
 * Track when user clicks/expands a sponsor prize section
 */
export function trackSponsorClick(sponsorId: string, sponsorName: string) {
  analytics.track('sponsor_click', {
    sponsor_id: sponsorId,
    sponsor_name: sponsorName,
    content_type: 'sponsor',
    action: 'expand',
  });
}

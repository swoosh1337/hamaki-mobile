import { supabase } from '@/services/supabase/client';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

type Json = Record<string, any> | null;

interface AnalyticsEvent {
  created_at?: string; // server default
  user_id?: string | null;
  session_id?: string;
  event_name: string;
  post_id?: string | null;
  post_type?: string | null;
  screen?: string | null;
  tab?: string | null;
  app_version?: string | null;
  device?: Json;
  context?: Json;
}

// Simple session id
function generateSessionId(): string {
  const rnd = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}_${rnd}`;
}

class AnalyticsClient {
  private queue: AnalyticsEvent[] = [];
  private userId: string | null = null;
  private sessionId: string = generateSessionId();
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  setUserId(userId: string | null) {
    this.userId = userId;
  }

  startNewSession() {
    this.sessionId = generateSessionId();
  }

  track(eventName: string, payload: Partial<AnalyticsEvent> = {}) {
    const event: AnalyticsEvent = {
      event_name: eventName,
      user_id: this.userId ?? null,
      session_id: this.sessionId,
      app_version: Constants.expoConfig?.version ?? null,
      device: {
        platform: Platform.OS,
        modelName: Device.modelName,
        osVersion: Device.osVersion,
        deviceName: Device.deviceName,
        isDevice: Device.isDevice,
      },
      ...payload,
    };

    this.queue.push(event);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, 2000);
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await supabase.from('analytics_events').insert(batch);
    } catch (err) {
      // Put events back at the front on failure
      this.queue = [...batch, ...this.queue];
    } finally {
      this.flushing = false;
    }
  }
}

export const analytics = new AnalyticsClient();

// Convenience helpers for common events
export function trackTabTap(tab: string) {
  analytics.track('tab_tap', { tab });
}

export function trackCarouselTap(postId: string, postType?: string) {
  analytics.track('carousel_tap', { post_id: postId, post_type: postType ?? null, context: { source: 'carousel' } });
}

export function trackPostOpen(postId: string, source: 'carousel' | 'list' = 'list') {
  analytics.track('post_open', { post_id: postId, context: { source } });
}

export function trackPostClose(postId: string, dwellMs: number, source: 'carousel' | 'list' = 'list') {
  analytics.track('post_close', { post_id: postId, context: { source, dwellMs } });
}



import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { channelStateService, supabase } from '@/services/supabase';
import type { YouTubeChannelState } from '@/types/youtube';
import { createLogger } from './logger';

const log = createLogger('Notifications');

// Configuration
const LAST_VIDEO_CHECK_KEY = 'hamaki_last_video_check';
const KNOWN_VIDEOS_KEY = 'hamaki_known_videos';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async (_notification) => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Newer Expo SDKs expect these additional fields on iOS
    // Provide permissive defaults for visibility in foreground
    ...(Platform.OS === 'ios'
      ? { shouldShowBanner: true as const, shouldShowList: true as const }
      : {}),
  } as any),
});

/**
 * Register for push notifications
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('hamaki-videos', {
        name: 'ახალი ვიდეოები!',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C4FF00',
        sound: 'default',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        log.warn('Failed to get push token for push notifications - permission denied');
        return null;
      }

      token = (await Notifications.getExpoPushTokenAsync()).data;
      log.info('Push notification token generated');
    } else {
      log.info('Non-physical device detected, skipping push token generation');
    }
  } catch (error) {
    // Silently handle permission errors (e.g., missing aps-environment entitlement in development)
    log.debug('Push notifications not available in this environment', { error });
  }

  return token;
}

/**
 * Save push token to database for server-sent notifications
 */
export async function savePushTokenToDatabase(
  userId: string,
  token: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) {
      log.error('Failed to save push token to database', error);
    } else {
      log.info('Push token saved to database');
    }
  } catch (error) {
    log.error('Error saving push token to database:', error);
  }
}

/**
 * Store known video IDs to track new uploads
 */
async function storeKnownVideos(videos: YouTubeChannelState[]): Promise<void> {
  try {
    const videoIds = videos
      .filter(v => v.latest_video_id)
      .map(v => v.latest_video_id!);
    await SecureStore.setItemAsync(KNOWN_VIDEOS_KEY, JSON.stringify(videoIds));
  } catch (error) {
    log.error('Error storing known videos:', error);
  }
}

/**
 * Get previously known video IDs
 */
async function getKnownVideos(): Promise<string[]> {
  try {
    const knownVideosJson = await SecureStore.getItemAsync(KNOWN_VIDEOS_KEY);
    return knownVideosJson ? JSON.parse(knownVideosJson) : [];
  } catch (error) {
    log.error('Error getting known videos:', error);
    return [];
  }
}

/**
 * Check for new videos and send notifications
 * ✅ Uses database (channelStateService) instead of YouTube API
 * ✅ First-time users: initialize known videos WITHOUT notifications
 */
export async function checkForNewVideos(): Promise<YouTubeChannelState[]> {
  try {
    log.info('Checking for new HamaKi Studio videos...');

    // Fetch latest videos from database (synced by server)
    const channelStates = await channelStateService.getAll();
    const knownVideoIds = await getKnownVideos();

    // FIRST TIME USER: If no known videos stored, this is first run
    // Store current videos WITHOUT sending notifications
    if (knownVideoIds.length === 0) {
      log.info('First time check - storing current videos without notifications');
      await storeKnownVideos(channelStates);
      await SecureStore.setItemAsync(LAST_VIDEO_CHECK_KEY, Date.now().toString());
      return []; // Return empty - no "new" videos for first-time users
    }

    // Find new videos (not in known list)
    const newVideos = channelStates.filter(
      state => state.latest_video_id && !knownVideoIds.includes(state.latest_video_id)
    );

    if (newVideos.length > 0) {
      log.info(`Found ${newVideos.length} new video(s)`, {
        titles: newVideos.map(v => v.latest_video_title)
      });

      // Send notification for each new video
      for (const video of newVideos) {
        await sendNewVideoNotification(video);
      }

      // Update known videos
      await storeKnownVideos(channelStates);
    } else {
      log.info('No new videos found since last check');
    }

    // Update last check time
    await SecureStore.setItemAsync(LAST_VIDEO_CHECK_KEY, Date.now().toString());

    return newVideos;
  } catch (error) {
    log.error('Error checking for new videos:', error);
    return [];
  }
}

/**
 * Send notification for a new video
 */
async function sendNewVideoNotification(video: YouTubeChannelState): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎬 ახალი ვიდეო დაიდოოო!',
        body: video.latest_video_title || 'New video from ' + video.channel_name,
        data: {
          videoId: video.latest_video_id,
          videoTitle: video.latest_video_title,
          channelName: video.channel_name,
          type: 'new_video',
        },
        sound: Platform.OS === 'android' ? 'default' : true,
      },
      trigger: null, // Send immediately
    });
    log.info('New video notification sent', { title: video.latest_video_title });
  } catch (error) {
    log.error('Error sending new video notification:', error);
  }
}


/**
 * Send subscription verification result notification
 */
export async function sendSubscriptionVerificationNotification(
  isSubscribed: boolean,
  channelName: string = 'YouTube'
): Promise<void> {
  try {
    const title = isSubscribed ? '✅ გამოწერა დადასტურდა' : '❌ გამოწერა ვერ მოიძებნა';
    const body = isSubscribed
      ? `${channelName} გამოწერა წარმატებით დადასტურდა. დამატებითი XP დაერიგისტრირდა!`
      : `${channelName} გამოწერა ვერ მოიძებნა. შეგიძლიათ ხელით შეამოწმოთ პარამეტრებში.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'subscription_verification',
          isSubscribed,
          channelName,
        },
        sound: 'default',
      },
      trigger: null, // Send immediately
    });

    log.info('Subscription verification notification sent', {
      isSubscribed,
      channelName
    });
  } catch (error) {
    log.error('Error sending subscription verification notification:', error);
  }
}

/**
 * Initialize notification system
 * Note: Push notifications require proper Apple Developer setup for iOS
 * Will gracefully fail in development/Expo Go builds
 */
export async function initializeNotifications(): Promise<void> {
  try {
    // Register for push notifications (may fail in development without proper entitlements)
    const token = await registerForPushNotificationsAsync();

    if (token) {
      log.info('Notification system initialized with push token');
    } else {
      log.info('Notification system initialized (push token not available)');
    }

    // Set up notification received listener
    Notifications.addNotificationReceivedListener(notification => {
      log.debug('Notification received', { notification });
    });

    // Set up notification response listener (when user taps notification)
    Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data.type === 'new_video' && data.videoId) {
        log.info('User tapped notification for video', { videoId: data.videoId });
      }
    });
  } catch (error) {
    log.warn('Push notifications not available', { error });
  }
}
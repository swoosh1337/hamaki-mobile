import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { youtubeService, type YouTubeVideo } from '@/services/youtube';
import { createLogger } from './logger';

const log = createLogger('Notifications');

// Configuration
const LAST_VIDEO_CHECK_KEY = 'hamaki_last_video_check';
const KNOWN_VIDEOS_KEY = 'hamaki_known_videos';
const VIDEO_CHECK_INTERVAL = 15 * 60 * 1000; // Check every 15 minutes

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
        name: 'New Videos',
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
 * Store known video IDs to track new uploads
 */
async function storeKnownVideos(videos: YouTubeVideo[]): Promise<void> {
  try {
    const videoIds = videos.map(video => video.id);
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
 */
export async function checkForNewVideos(): Promise<YouTubeVideo[]> {
  try {
    log.info('Checking for new HamaKi Studio videos...');

    // Fetch latest videos
    const latestVideos = await youtubeService.fetchHamakiVideos(5);
    const knownVideoIds = await getKnownVideos();

    // Find new videos (not in known list)
    const newVideos = latestVideos.filter(video => !knownVideoIds.includes(video.id));

    if (newVideos.length > 0) {
      log.info(`Found ${newVideos.length} new video(s)`, { titles: newVideos.map(v => v.title) });

      // Send notification for each new video
      for (const video of newVideos) {
        await sendNewVideoNotification(video);
      }

      // Update known videos
      await storeKnownVideos(latestVideos);
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
async function sendNewVideoNotification(video: YouTubeVideo): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎬 New HamaKi Video!',
        body: video.title,
        data: {
          videoId: video.videoId,
          videoTitle: video.title,
          type: 'new_video',
        },
        sound: 'default',
      },
      trigger: null, // Send immediately
    });

    log.info('Notification sent for new video', { title: video.title });
  } catch (error) {
    log.error('Error sending notification:', error);
  }
}

/**
 * Check if enough time has passed since last video check
 */
export async function shouldCheckForVideos(): Promise<boolean> {
  try {
    const lastCheckString = await SecureStore.getItemAsync(LAST_VIDEO_CHECK_KEY);
    if (!lastCheckString) return true;

    const lastCheck = parseInt(lastCheckString);
    const timeSinceLastCheck = Date.now() - lastCheck;

    return timeSinceLastCheck >= VIDEO_CHECK_INTERVAL;
  } catch (error) {
    log.error('Error checking video check timing:', error);
    return true;
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

/**
 * Background video checking (called when app becomes active)
 */
export async function backgroundVideoCheck(): Promise<void> {
  try {
    if (await shouldCheckForVideos()) {
      await checkForNewVideos();
    }
  } catch (error) {
    log.error('Background video check failed:', error);
  }
}
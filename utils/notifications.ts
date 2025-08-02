import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchHamakiVideos, YouTubeVideo } from './youtube';

// Configuration
const LAST_VIDEO_CHECK_KEY = 'hamaki_last_video_check';
const KNOWN_VIDEOS_KEY = 'hamaki_known_videos';
const VIDEO_CHECK_INTERVAL = 15 * 60 * 1000; // Check every 15 minutes

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register for push notifications
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

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
      console.log('Failed to get push token for push notifications!');
      return null;
    }
    
    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Push notification token:', token);
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

/**
 * Store known video IDs to track new uploads
 */
async function storeKnownVideos(videos: YouTubeVideo[]): Promise<void> {
  try {
    const videoIds = videos.map(video => video.id);
    await AsyncStorage.setItem(KNOWN_VIDEOS_KEY, JSON.stringify(videoIds));
  } catch (error) {
    console.error('Error storing known videos:', error);
  }
}

/**
 * Get previously known video IDs
 */
async function getKnownVideos(): Promise<string[]> {
  try {
    const knownVideosJson = await AsyncStorage.getItem(KNOWN_VIDEOS_KEY);
    return knownVideosJson ? JSON.parse(knownVideosJson) : [];
  } catch (error) {
    console.error('Error getting known videos:', error);
    return [];
  }
}

/**
 * Check for new videos and send notifications
 */
export async function checkForNewVideos(): Promise<YouTubeVideo[]> {
  try {
    console.log('Checking for new HamaKi Studio videos...');
    
    // Fetch latest videos
    const latestVideos = await fetchHamakiVideos(5);
    const knownVideoIds = await getKnownVideos();
    
    // Find new videos (not in known list)
    const newVideos = latestVideos.filter(video => !knownVideoIds.includes(video.id));
    
    if (newVideos.length > 0) {
      console.log(`Found ${newVideos.length} new video(s):`, newVideos.map(v => v.title));
      
      // Send notification for each new video
      for (const video of newVideos) {
        await sendNewVideoNotification(video);
      }
      
      // Update known videos
      await storeKnownVideos(latestVideos);
    } else {
      console.log('No new videos found');
    }
    
    // Update last check time
    await AsyncStorage.setItem(LAST_VIDEO_CHECK_KEY, Date.now().toString());
    
    return newVideos;
  } catch (error) {
    console.error('Error checking for new videos:', error);
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
    
    console.log('Notification sent for new video:', video.title);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

/**
 * Check if enough time has passed since last video check
 */
export async function shouldCheckForVideos(): Promise<boolean> {
  try {
    const lastCheckString = await AsyncStorage.getItem(LAST_VIDEO_CHECK_KEY);
    if (!lastCheckString) return true;
    
    const lastCheck = parseInt(lastCheckString);
    const timeSinceLastCheck = Date.now() - lastCheck;
    
    return timeSinceLastCheck >= VIDEO_CHECK_INTERVAL;
  } catch (error) {
    console.error('Error checking video check timing:', error);
    return true;
  }
}

/**
 * Initialize notification system
 */
export async function initializeNotifications(): Promise<void> {
  try {
    // Register for push notifications
    await registerForPushNotificationsAsync();
    
    // Set up notification received listener
    Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });
    
    // Set up notification response listener (when user taps notification)
    Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data.type === 'new_video' && data.videoId) {
        // Handle opening the video when notification is tapped
        console.log('User tapped notification for video:', data.videoId);
        // You can navigate to the video or home screen here
      }
    });
    
    console.log('Notification system initialized');
  } catch (error) {
    console.error('Error initializing notifications:', error);
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
    console.error('Background video check failed:', error);
  }
}
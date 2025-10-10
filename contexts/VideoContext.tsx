import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isNetworkError as checkNetworkError, getUserFriendlyErrorMessage } from '../utils/errorHandling';
import { checkForNewVideos } from '../utils/notifications';
import { fetchHamakiVideos, YouTubeVideo } from '../utils/youtube';
import { useAuth } from './AuthContext';


const VIDEO_FETCH_LIMIT = 3;

interface VideoContextType {
  videos: YouTubeVideo[];
  isLoading: boolean;
  error: string | null;
  refreshVideos: () => Promise<void>;
  hasNewVideos: boolean;
  isNetworkError: boolean;
}

const VideoContext = createContext<VideoContextType>({
  videos: [],
  isLoading: true,
  error: null,
  refreshVideos: async () => {},
  hasNewVideos: false,
  isNetworkError: false,
});

export const useVideos = () => useContext(VideoContext);

export const VideoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isSubscribed } = useAuth();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNewVideos, setHasNewVideos] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  // Load initial videos
  const loadVideos = async () => {
    if (!isAuthenticated || !isSubscribed) {
      setVideos([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIsNetworkError(false);
      const fetchedVideos = await fetchHamakiVideos(VIDEO_FETCH_LIMIT);
      setVideos(fetchedVideos);
      console.log(`Loaded ${fetchedVideos.length} videos`);
    } catch (err) {
      console.error('Failed to load videos:', err);
      const isNetwork = checkNetworkError(err);
      setIsNetworkError(isNetwork);
      setError(getUserFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh videos manually
  const refreshVideos = async () => {
    await loadVideos();
    setHasNewVideos(false);
  };

  // Check for new videos in background
  const backgroundVideoUpdate = async () => {
    if (!isAuthenticated || !isSubscribed) return;

    try {
      console.log('Checking for new videos in background...');
      const newVideos = await checkForNewVideos();
      
      if (newVideos.length > 0) {
        // Update video list with new videos
        const updatedVideos = await fetchHamakiVideos(3);
        setVideos(updatedVideos);
        setHasNewVideos(true);
        console.log(`Updated feed with ${newVideos.length} new video(s)`);
      }
    } catch (error) {
      console.error('Background video update failed:', error);
    }
  };

  // Load videos when auth state changes
  useEffect(() => {
    loadVideos();
  }, [isAuthenticated, isSubscribed]);

  // Listen for app state changes to check for new videos
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active' && isAuthenticated && isSubscribed) {
        await backgroundVideoUpdate();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAuthenticated, isSubscribed]);

  // Set up periodic background checking (every 15 minutes when app is active)
  useEffect(() => {
    if (!isAuthenticated || !isSubscribed) return;

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        backgroundVideoUpdate();
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, isSubscribed]);

  return (
    <VideoContext.Provider
      value={{
        videos,
        isLoading,
        error,
        refreshVideos,
        hasNewVideos,
        isNetworkError,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
};
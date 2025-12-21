/**
 * @deprecated This file is maintained for backwards compatibility.
 * Please import from the new YouTube service instead:
 * 
 * - import { youtubeService, type YouTubeVideo } from '@/services/youtube';
 */

import { youtubeService, type YouTubeVideo } from '@/services/youtube';
import { createLogger } from './logger';

const log = createLogger('YouTube');

// Re-export types
export type { YouTubeVideo };

// Re-export the old interface for backwards compatibility
export interface YouTubeApiResponse {
  items: Array<{
    id: {
      videoId: string;
    };
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      thumbnails: {
        medium: {
          url: string;
        };
        high: {
          url: string;
        };
      };
    };
    statistics?: {
      viewCount: string;
    };
    contentDetails?: {
      duration: string;
    };
  }>;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

/**
 * @deprecated Use youtubeService.fetchHamakiVideos()
 */
export const fetchHamakiVideos = youtubeService.fetchHamakiVideos.bind(youtubeService);

/**
 * @deprecated Use youtubeService.formatTimeAgo()
 */
export const formatTimeAgo = youtubeService.formatTimeAgo.bind(youtubeService);

/**
 * @deprecated Use youtubeService.isVideoNew()
 */
export const isVideoNew = youtubeService.isVideoNew.bind(youtubeService);

/**
 * @deprecated Use youtubeService.clearCache()
 */
export const clearVideosCache = youtubeService.clearCache.bind(youtubeService);

/**
 * @deprecated Use youtubeService.getVideoUrl() with Linking.openURL
 */
export function openYouTubeVideo(videoId: string): void {
  const url = youtubeService.getVideoUrl(videoId);
  log.info('Opening YouTube video', { videoId, url });
  // Note: This function previously didn't actually open the video
  // Use Linking.openURL(youtubeService.getVideoUrl(videoId)) in your component
}
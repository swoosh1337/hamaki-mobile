// YouTube Data API service for fetching HamaKi Studio videos

const YOUTUBE_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY!;
const HAMAKI_CHANNEL_ID = process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID!;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let videosCache: { data: YouTubeVideo[]; timestamp: number } | null = null;

if (!YOUTUBE_API_KEY || !HAMAKI_CHANNEL_ID) {
  throw new Error('Missing YouTube API configuration. Please check your .env file.');
}

// Types for YouTube API responses
export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount?: string;
  duration?: string;
  videoId: string;
}

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
 * Fetch latest videos from HamaKi Studio channel
 */
export async function fetchHamakiVideos(maxResults: number = 10): Promise<YouTubeVideo[]> {
  try {
    // Check cache first
    if (videosCache && Date.now() - videosCache.timestamp < CACHE_DURATION) {
      console.log('Returning cached HamaKi Studio videos');
      return videosCache.data;
    }

    console.log('Fetching HamaKi Studio videos from API...');
    
    // Step 1: Get the latest videos from the channel
    const searchUrl = `${YOUTUBE_API_BASE}/search?` +
      `part=snippet&` +
      `channelId=${HAMAKI_CHANNEL_ID}&` +
      `maxResults=${maxResults}&` +
      `order=date&` +
      `type=video&` +
      `key=${YOUTUBE_API_KEY}`;

    const searchResponse = await fetch(searchUrl);
    const searchData: YouTubeApiResponse = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('YouTube API Error:', searchData);
      throw new Error(`YouTube API Error: ${searchData}`);
    }

    if (!searchData.items || searchData.items.length === 0) {
      console.log('No videos found for HamaKi Studio channel');
      return [];
    }

    // Step 2: Get video statistics (view counts, duration) for each video
    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    const statisticsUrl = `${YOUTUBE_API_BASE}/videos?` +
      `part=statistics,contentDetails&` +
      `id=${videoIds}&` +
      `key=${YOUTUBE_API_KEY}`;

    const statisticsResponse = await fetch(statisticsUrl);
    const statisticsData = await statisticsResponse.json();

    // Step 3: Combine search results with statistics
    const videos: YouTubeVideo[] = searchData.items.map((item, index) => {
      const stats = statisticsData.items?.[index];
      const viewCount = stats?.statistics?.viewCount;
      
      return {
        id: item.id.videoId,
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        publishedAt: item.snippet.publishedAt,
        viewCount: viewCount ? formatViewCount(parseInt(viewCount)) : undefined,
        duration: stats?.contentDetails?.duration,
      };
    });

    console.log(`Successfully fetched ${videos.length} videos from HamaKi Studio`);
    
    // Cache the results
    videosCache = {
      data: videos,
      timestamp: Date.now(),
    };
    
    return videos;

  } catch (error) {
    console.error('Error fetching HamaKi videos:', error);
    throw error;
  }
}

/**
 * Format view count to human readable format (e.g., 1.2K, 45K, 1.5M)
 */
function formatViewCount(views: number): string {
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`;
  } else if (views >= 1000) {
    return `${Math.floor(views / 1000)}K`;
  } else {
    return views.toString();
  }
}

/**
 * Format time ago from ISO date string
 */
export function formatTimeAgo(publishedAt: string): string {
  const publishedDate = new Date(publishedAt);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) {
    return 'Just now';
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 168) { // Less than a week
    const days = Math.floor(diffInHours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 730) { // Less than a month
    const weeks = Math.floor(diffInHours / 168);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(diffInHours / 730);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
}

/**
 * Check if video is "new" (uploaded within last 24 hours)
 */
export function isVideoNew(publishedAt: string): boolean {
  const publishedDate = new Date(publishedAt);
  const now = new Date();
  const diffInHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
  
  return diffInHours <= 24;
}

/**
 * Clear the videos cache (useful for testing or forced refresh)
 */
export function clearVideosCache(): void {
  videosCache = null;
  console.log('YouTube videos cache cleared');
}

/**
 * Open YouTube video in the device's YouTube app or browser
 */
export function openYouTubeVideo(videoId: string): void {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  // We'll implement this with Linking.openURL in the component
  console.log('Opening YouTube video:', youtubeUrl);
}
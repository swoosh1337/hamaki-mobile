/**
 * Video Likes Service
 * Checks if user has liked the latest video from each channel and awards XP
 */

import { ChannelKey, YOUTUBE_CHANNELS } from './channelSubscriptions';
import { supabase } from './supabase';

const YOUTUBE_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY!;

// XP rewards for liking latest videos
const VIDEO_LIKE_XP = {
  hamaki: 200,  // Main channel
  miro: 100,
  bastos: 100,
  koro: 100,
} as const;

export interface VideoLikeStatus {
  channelKey: ChannelKey;
  channelName: string;
  videoId: string | null;
  videoTitle: string | null;
  isLiked: boolean;
  xpReward: number;
  xpAwarded: boolean;
}

/**
 * Get the latest video from a channel
 */
async function getLatestVideo(channelId: string): Promise<{ id: string; title: string } | null> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet&order=date&type=video&maxResults=1`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('YouTube API error getting latest video:', data);
      throw new Error(data.error?.message || 'Failed to fetch latest video');
    }

    if (data.items && data.items.length > 0) {
      const video = data.items[0];
      return {
        id: video.id.videoId,
        title: video.snippet.title,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error getting latest video for channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Check if user has liked a specific video
 * Uses the videos.getRating endpoint with youtube.force-ssl scope
 * 
 * This endpoint returns the authenticated user's rating (like/dislike/none) for a video
 * Requires: https://www.googleapis.com/auth/youtube.force-ssl scope
 */
async function checkVideoLike(accessToken: string, videoId: string): Promise<boolean> {
  try {
    // Use the videos.getRating endpoint to check if user has liked the video
    const url = `https://www.googleapis.com/youtube/v3/videos/getRating?id=${videoId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('YouTube API error checking video rating:', data);
      
      // If permission denied, the user needs to re-authenticate with the new scope
      if (data.error?.code === 403) {
        console.log(`⚠️ Insufficient permissions to check video rating. User needs to re-authenticate.`);
      }
      
      return false;
    }

    // Check if the rating is 'like'
    // Response format: { items: [{ videoId: "...", rating: "like" | "dislike" | "none" }] }
    const isLiked = data.items && data.items.length > 0 && data.items[0].rating === 'like';
    
    if (isLiked) {
      console.log(`✅ User has liked video ${videoId}`);
    } else {
      console.log(`ℹ️ User has not liked video ${videoId}`);
    }
    
    return isLiked;
  } catch (error) {
    console.error(`Error checking like for video ${videoId}:`, error);
    return false;
  }
}

/**
 * Check all channels for latest video likes and return status
 */
export async function checkAllVideoLikes(
  accessToken: string,
  userId: string
): Promise<VideoLikeStatus[]> {
  const statuses: VideoLikeStatus[] = [];

  // Get user's current video like XP awards from database
  const { data: userData, error } = await supabase
    .from('users')
    .select('video_like_xp_awarded')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user video like XP data:', error);
  }

  const awardedLikes = userData?.video_like_xp_awarded || {};

  // Check each channel
  for (const [key, channel] of Object.entries(YOUTUBE_CHANNELS)) {
    const channelKey = key as ChannelKey;
    
    try {
      // Get latest video from channel
      const latestVideo = await getLatestVideo(channel.id);
      
      if (!latestVideo) {
        statuses.push({
          channelKey,
          channelName: channel.name,
          videoId: null,
          videoTitle: null,
          isLiked: false,
          xpReward: VIDEO_LIKE_XP[channelKey],
          xpAwarded: false,
        });
        continue;
      }

      // Check if user has liked this video
      const isLiked = await checkVideoLike(accessToken, latestVideo.id);
      
      // Check if XP was already awarded for this specific video
      const xpAwarded = awardedLikes[latestVideo.id] || false;

      statuses.push({
        channelKey,
        channelName: channel.name,
        videoId: latestVideo.id,
        videoTitle: latestVideo.title,
        isLiked,
        xpReward: VIDEO_LIKE_XP[channelKey],
        xpAwarded,
      });
    } catch (error) {
      console.error(`Error checking video for ${channel.name}:`, error);
      // Add error status
      statuses.push({
        channelKey,
        channelName: channel.name,
        videoId: null,
        videoTitle: null,
        isLiked: false,
        xpReward: VIDEO_LIKE_XP[channelKey],
        xpAwarded: false,
      });
    }
  }

  return statuses;
}

/**
 * Award XP for liked videos that haven't been awarded yet
 */
export async function awardVideoLikeXP(
  userId: string,
  videoLikeStatuses: VideoLikeStatus[]
): Promise<{ success: boolean; xpAwarded: number; errors: string[] }> {
  let totalXPAwarded = 0;
  const errors: string[] = [];
  const newAwardedLikes: Record<string, boolean> = {};

  // Get current awarded likes
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('video_like_xp_awarded, xp_points')
    .eq('id', userId)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching user data for XP award:', fetchError);
    errors.push(`Failed to fetch user data: ${fetchError.message}`);
    return { success: false, xpAwarded: 0, errors };
  }

  const currentAwardedLikes = userData?.video_like_xp_awarded || {};
  const currentXP = userData?.xp_points || 0;

  console.log('📊 Current XP:', currentXP);
  console.log('📊 Current awarded likes:', currentAwardedLikes);
  console.log('📊 Video statuses to check:', videoLikeStatuses.map(s => ({
    channel: s.channelName,
    videoId: s.videoId,
    isLiked: s.isLiked,
    xpAwarded: s.xpAwarded,
  })));

  // Check each video like status
  for (const status of videoLikeStatuses) {
    console.log(`🔍 Checking ${status.channelName}: isLiked=${status.isLiked}, xpAwarded=${status.xpAwarded}, videoId=${status.videoId}`);
    
    if (status.isLiked && !status.xpAwarded && status.videoId) {
      // User has liked the video and hasn't been awarded XP yet
      totalXPAwarded += status.xpReward;
      newAwardedLikes[status.videoId] = true;
      
      console.log(`✅ Will award ${status.xpReward} XP for liking ${status.channelName} latest video (${status.videoId})`);
    }
  }

  console.log('💰 Total XP to award:', totalXPAwarded);
  console.log('📝 New awarded likes:', newAwardedLikes);

  // If there's XP to award, update the database
  if (totalXPAwarded > 0) {
    try {
      const updatedAwardedLikes = { ...currentAwardedLikes, ...newAwardedLikes };
      
      console.log('💾 Updating database with:', {
        newXP: currentXP + totalXPAwarded,
        updatedAwardedLikes,
      });
      
      const { error, data: updateData } = await supabase
        .from('users')
        .update({
          xp_points: currentXP + totalXPAwarded,
          video_like_xp_awarded: updatedAwardedLikes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select();

      if (error) {
        console.error('❌ Error awarding video like XP:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        errors.push(`Failed to update XP in database: ${error.message}`);
        return { success: false, xpAwarded: 0, errors };
      }

      console.log('✅ Database update result:', updateData);
      console.log(`🎉 Successfully awarded ${totalXPAwarded} XP for video likes!`);
    } catch (error) {
      console.error('❌ Exception in awardVideoLikeXP:', error);
      errors.push('Failed to award XP');
      return { success: false, xpAwarded: 0, errors };
    }
  } else {
    console.log('ℹ️ No XP to award (either no likes or already awarded)');
  }

  return {
    success: errors.length === 0,
    xpAwarded: totalXPAwarded,
    errors,
  };
}

/**
 * Check and award XP for all video likes in one call
 */
export async function checkAndAwardVideoLikes(
  accessToken: string,
  userId: string
): Promise<{ success: boolean; xpAwarded: number; statuses: VideoLikeStatus[]; errors: string[] }> {
  try {
    // Check all video likes
    const statuses = await checkAllVideoLikes(accessToken, userId);
    
    // Award XP for new likes
    const result = await awardVideoLikeXP(userId, statuses);
    
    return {
      ...result,
      statuses,
    };
  } catch (error) {
    console.error('Error in checkAndAwardVideoLikes:', error);
    return {
      success: false,
      xpAwarded: 0,
      statuses: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

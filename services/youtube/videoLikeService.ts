/**
 * YouTube Video Like Service
 *
 * Handles video like verification for XP rewards.
 * Uses caching to minimize API calls.
 *
 * Key features:
 * - Gets latest video from each channel (cached 24h)
 * - Checks if user liked the video
 * - Awards XP per video ID (not per channel)
 */

import { supabase } from '@/services/supabase/client';
import type {
    ChannelKey,
    VerifyVideoLikesResult,
    VideoLikeStatus,
    VideoLikeXPAwarded,
} from '@/types/youtube';
import { VIDEO_LIKE_XP, YOUTUBE_CHANNELS } from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import { verificationCacheService } from './verificationCacheService';

const log = createLogger('VideoLikeService');

const YOUTUBE_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || '';

/**
 * Get the latest video from a channel
 * Uses cache if available (24h TTL), otherwise makes API call
 *
 * Cost: 100 units per call (search.list)
 */
async function getLatestVideo(
    channelId: string,
    channelKey: ChannelKey,
    forceRefresh: boolean = false
): Promise<{ id: string; title: string; thumbnail?: string } | null> {
    try {
        // Check cache first (unless forced refresh)
        if (!forceRefresh) {
            const cached = await verificationCacheService.getCachedVideo(channelKey);
            if (cached) {
                log.debug(`Using cached video for ${channelKey}`, { videoId: cached.videoId });
                return { id: cached.videoId, title: cached.title, thumbnail: cached.thumbnail };
            }
        }

        // Make API call
        log.info(`Fetching latest video for ${channelKey} from API`);
        const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet&order=date&type=video&maxResults=1`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            log.error('YouTube API error getting latest video', data);
            throw new Error(data.error?.message || 'Failed to fetch latest video');
        }

        if (data.items && data.items.length > 0) {
            const video = data.items[0];
            const result = {
                id: video.id.videoId,
                title: video.snippet.title,
                thumbnail: video.snippet.thumbnails?.medium?.url,
            };

            // Update cache
            await verificationCacheService.updateVideoCache(
                channelKey,
                result.id,
                result.title,
                result.thumbnail
            );

            return result;
        }

        return null;
    } catch (error) {
        log.error(`Error getting latest video for channel ${channelId}`, error);
        throw error;
    }
}

/**
 * Check if user has liked a specific video
 * Uses YouTube Data API videos.getRating endpoint
 *
 * Cost: 1 unit per call
 */
async function checkVideoLike(
    accessToken: string,
    videoId: string
): Promise<boolean> {
    try {
        const url = `https://www.googleapis.com/youtube/v3/videos/getRating?id=${videoId}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            log.error('YouTube API error checking video rating', data);

            // Permission denied - user needs to re-authenticate
            if (data.error?.code === 403) {
                log.warn('Insufficient permissions to check video rating');
            }

            return false;
        }

        const isLiked = data.items?.[0]?.rating === 'like';
        log.debug(`Video ${videoId} like status: ${isLiked}`);
        return isLiked;
    } catch (error) {
        log.error(`Error checking like for video ${videoId}`, error);
        return false;
    }
}

/**
 * Check all channels for video likes
 * Uses cached video IDs when possible
 *
 * Cost: ~4 units if all videos cached, ~404 units if all need refresh
 */
export async function checkAllVideoLikes(
    accessToken: string,
    userId: string
): Promise<VideoLikeStatus[]> {
    const statuses: VideoLikeStatus[] = [];

    // Get user's awarded video likes from database
    const { data: userData } = await supabase
        .from('users')
        .select('video_like_xp_awarded')
        .eq('id', userId)
        .single();

    const awardedLikes: VideoLikeXPAwarded = userData?.video_like_xp_awarded || {};
    const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

    for (const channelKey of channelKeys) {
        const channel = YOUTUBE_CHANNELS[channelKey];

        try {
            // Get latest video (uses cache if valid)
            const latestVideo = await getLatestVideo(channel.id, channelKey);

            if (!latestVideo) {
                statuses.push({
                    channelKey,
                    channelName: channel.name,
                    latestVideoId: null,
                    videoTitle: null,
                    isLiked: false,
                    xpReward: VIDEO_LIKE_XP[channelKey],
                    xpAwarded: false,
                    lastChecked: Date.now(),
                });
                continue;
            }

            // Check if user liked this video
            const isLiked = await checkVideoLike(accessToken, latestVideo.id);

            // Check if XP was already awarded for THIS specific video
            const xpAwarded = awardedLikes[latestVideo.id] || false;

            statuses.push({
                channelKey,
                channelName: channel.name,
                latestVideoId: latestVideo.id,
                videoTitle: latestVideo.title,
                videoThumbnail: latestVideo.thumbnail,
                isLiked,
                xpReward: VIDEO_LIKE_XP[channelKey],
                xpAwarded,
                lastChecked: Date.now(),
            });
        } catch (error) {
            log.error(`Error checking video for ${channel.name}`, error);
            statuses.push({
                channelKey,
                channelName: channel.name,
                latestVideoId: null,
                videoTitle: null,
                isLiked: false,
                xpReward: VIDEO_LIKE_XP[channelKey],
                xpAwarded: false,
                lastChecked: Date.now(),
            });
        }
    }

    return statuses;
}

/**
 * Verify video likes and award XP
 *
 * Key behavior:
 * - XP is awarded per VIDEO ID (not per channel)
 * - When a new video is released, user can earn XP again
 * - If user liked and unliked, no duplicate XP
 */
export async function verifyAndAwardVideoLikeXP(
    accessToken: string,
    userId: string
): Promise<VerifyVideoLikesResult> {
    const result: VerifyVideoLikesResult = {
        success: false,
        statuses: [],
        totalXPAwarded: 0,
        errors: [],
    };

    try {
        // Get all video like statuses
        const statuses = await checkAllVideoLikes(accessToken, userId);
        result.statuses = statuses;

        // Get current awarded likes from DB
        const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('video_like_xp_awarded, xp_points')
            .eq('id', userId)
            .single();

        if (fetchError) {
            log.error('Failed to fetch user data', fetchError);
            result.errors.push('Failed to fetch user data');
            return result;
        }

        const currentAwardedLikes: VideoLikeXPAwarded = userData?.video_like_xp_awarded || {};
        const currentXP = userData?.xp_points || 0;

        let totalNewXP = 0;
        const newAwardedLikes: VideoLikeXPAwarded = {};

        // Process each status
        for (const status of statuses) {
            if (status.isLiked && !status.xpAwarded && status.latestVideoId) {
                // User liked video AND XP not yet awarded for this video
                totalNewXP += status.xpReward;
                newAwardedLikes[status.latestVideoId] = true;
                log.info(`Awarding ${status.xpReward} XP for liking ${status.channelName} video`, {
                    videoId: status.latestVideoId,
                });
            }
        }

        // Update database if any XP was awarded
        if (totalNewXP > 0) {
            const updatedAwardedLikes = { ...currentAwardedLikes, ...newAwardedLikes };

            const { error: updateError } = await supabase
                .from('users')
                .update({
                    xp_points: currentXP + totalNewXP,
                    video_like_xp_awarded: updatedAwardedLikes,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userId);

            if (updateError) {
                log.error('Failed to update user XP', updateError);
                result.errors.push('Failed to update XP in database');
                return result;
            }

            log.info(`Awarded ${totalNewXP} total XP for video likes`);
        }

        result.success = true;
        result.totalXPAwarded = totalNewXP;
        return result;

    } catch (error) {
        log.error('Error in verifyAndAwardVideoLikeXP', error);
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        return result;
    }
}

/**
 * Get current video like statuses from cache
 * Does NOT make fresh API calls
 */
export async function getCachedVideoStatuses(): Promise<VideoLikeStatus[]> {
    const statuses: VideoLikeStatus[] = [];
    const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

    for (const channelKey of channelKeys) {
        const channel = YOUTUBE_CHANNELS[channelKey];
        const cached = await verificationCacheService.getCachedVideo(channelKey);

        statuses.push({
            channelKey,
            channelName: channel.name,
            latestVideoId: cached?.videoId || null,
            videoTitle: cached?.title || null,
            videoThumbnail: cached?.thumbnail,
            isLiked: false, // Unknown without API call
            xpReward: VIDEO_LIKE_XP[channelKey],
            xpAwarded: false, // Unknown without DB check
            lastChecked: 0,
        });
    }

    return statuses;
}

/**
 * Calculate total possible XP from all video likes
 */
export function getTotalPossibleVideoLikeXP(): number {
    return Object.values(VIDEO_LIKE_XP).reduce((sum, xp) => sum + xp, 0);
}

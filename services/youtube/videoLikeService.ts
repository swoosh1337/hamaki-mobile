/**
 * YouTube Video Like Service
 *
 * Handles video like verification for XP rewards.
 *
 * ⚠️ ZERO CLIENT-SIDE YOUTUBE API CALLS
 * 
 * This service:
 *   1. Reads video state from database (via channelStateService)
 *   2. Calls Edge Function for like verification (not YouTube directly)
 *   3. Returns verification results
 */

import { channelStateService, supabase } from '@/services/supabase';
import type {
    VerifyVideoLikesResult,
    VideoLikeStatus,
    YouTubeChannelState
} from '@/types/youtube';
import { VIDEO_LIKE_XP } from '@/types/youtube';
import { createLogger } from '@/utils/logger';

const log = createLogger('VideoLikeService');

// Edge Function response type
interface EdgeFunctionResult {
    success: boolean;
    results: Array<{
        videoId: string;
        channelKey: string;
        liked: boolean;
        xpAwarded: number;
    }>;
    totalXPAwarded: number;
    error?: string;
}

/**
 * Get video statuses from database
 * ✅ Reads from server-synced youtube_channel_state table
 * ✅ Zero YouTube API calls
 */
export async function getVideoStatusesFromDB(): Promise<VideoLikeStatus[]> {
    const statuses: VideoLikeStatus[] = [];

    try {
        const channelStates = await channelStateService.getAll();

        for (const state of channelStates) {
            statuses.push({
                channelKey: state.channel_key,
                channelName: state.channel_name,
                latestVideoId: state.latest_video_id,
                videoTitle: state.latest_video_title,
                videoThumbnail: state.latest_video_thumbnail || undefined,
                isLiked: false, // Unknown until verified
                xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                xpAwarded: false, // Unknown until verified
                lastChecked: 0,
            });
        }
    } catch (error) {
        log.error('Error fetching video statuses from DB', error);
    }

    return statuses;
}

/**
 * Verify video likes and award XP via Edge Function
 * ✅ Zero client-side YouTube API calls
 * ✅ Batched verification (1 API unit)
 * ✅ XP awarded per video ID
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
        // Get all channel states from database
        const channelStates = await channelStateService.getAll();

        // Build video list for Edge Function
        const videos = channelStates
            .filter((state): state is YouTubeChannelState & { latest_video_id: string } =>
                state.latest_video_id !== null
            )
            .map(state => ({
                videoId: state.latest_video_id,
                channelKey: state.channel_key,
            }));

        if (videos.length === 0) {
            log.warn('No videos to verify');
            result.success = true;
            return result;
        }

        // Call Edge Function for verification
        log.info(`Verifying ${videos.length} videos via Edge Function`);

        const { data, error } = await supabase.functions.invoke<EdgeFunctionResult>(
            'verify-video-likes',
            {
                body: { videos, userId },
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (error) {
            log.error('Edge Function error:', error);
            result.errors.push(error.message);
            return result;
        }

        if (!data?.success) {
            log.error('Verification failed:', data?.error);
            result.errors.push(data?.error || 'Unknown error');
            return result;
        }

        // Convert Edge Function results to VideoLikeStatus
        for (const state of channelStates) {
            const edgeResult = data.results.find(r => r.videoId === state.latest_video_id);

            result.statuses.push({
                channelKey: state.channel_key,
                channelName: state.channel_name,
                latestVideoId: state.latest_video_id,
                videoTitle: state.latest_video_title,
                videoThumbnail: state.latest_video_thumbnail || undefined,
                isLiked: edgeResult?.liked ?? false,
                xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                xpAwarded: (edgeResult?.xpAwarded ?? 0) > 0,
                lastChecked: Date.now(),
            });
        }

        result.success = true;
        result.totalXPAwarded = data.totalXPAwarded;

        if (data.totalXPAwarded > 0) {
            log.info(`Awarded ${data.totalXPAwarded} XP for video likes`);
        }

        return result;

    } catch (error) {
        log.error('Error in verifyAndAwardVideoLikeXP:', error);
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        return result;
    }
}

/**
 * Calculate total possible XP from all video likes
 */
export function getTotalPossibleVideoLikeXP(): number {
    return Object.values(VIDEO_LIKE_XP).reduce((sum, xp) => sum + xp, 0);
}

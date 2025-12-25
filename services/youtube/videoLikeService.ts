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
import { decodeHtmlEntities } from '@/utils/text';

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
 * ✅ Reads user's video_like_xp_awarded to determine XP status
 * ✅ Zero YouTube API calls
 */
export async function getVideoStatusesFromDB(userId?: string): Promise<VideoLikeStatus[]> {
    const statuses: VideoLikeStatus[] = [];

    try {
        const channelStates = await channelStateService.getAll();

        // Get user's awarded video likes if userId provided
        let awardedVideoIds = new Set<string>();
        if (userId) {
            const { data: userData } = await supabase
                .from('users')
                .select('video_like_xp_awarded')
                .eq('id', userId)
                .single();

            if (userData?.video_like_xp_awarded) {
                awardedVideoIds = new Set(
                    Object.keys(userData.video_like_xp_awarded).filter(
                        videoId => userData.video_like_xp_awarded?.[videoId] === true
                    )
                );
            }
        }

        for (const state of channelStates) {
            const isAwarded = state.latest_video_id
                ? awardedVideoIds.has(state.latest_video_id)
                : false;

            statuses.push({
                channelKey: state.channel_key,
                channelName: state.channel_name,
                latestVideoId: state.latest_video_id,
                videoTitle: decodeHtmlEntities(state.latest_video_title),
                videoThumbnail: state.latest_video_thumbnail || undefined,
                isLiked: isAwarded, // If XP awarded, must have been liked
                xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                xpAwarded: isAwarded,
                lastChecked: isAwarded ? Date.now() : 0,
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

        // Get user's video_like_xp_awarded JSONB to check which videos already have XP
        log.debug('Checking for existing awarded videos');
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('video_like_xp_awarded')
            .eq('id', userId)
            .single();

        if (userError) {
            log.error('Error checking existing awarded videos:', userError);
            // Continue anyway - worst case we re-verify
        }

        const awardedVideoIds = new Set<string>(
            Object.keys(userData?.video_like_xp_awarded || {}).filter(
                videoId => userData?.video_like_xp_awarded?.[videoId] === true
            )
        );

        log.debug(`Found ${awardedVideoIds.size} videos already awarded XP`);

        // Build video list for Edge Function - SKIP videos that already have xp_awarded
        const videos = channelStates
            .filter((state): state is YouTubeChannelState & { latest_video_id: string } =>
                state.latest_video_id !== null &&
                state.latest_video_id !== '' && // Also filter out empty strings
                !awardedVideoIds.has(state.latest_video_id) // ← NEW: Skip already awarded
            )
            .map(state => ({
                videoId: state.latest_video_id,
                channelKey: state.channel_key,
            }));

        if (videos.length === 0 && channelStates.some(s => s.latest_video_id !== null)) {
            log.info('All videos already verified - skipping Edge Function call');

            // Return cached statuses from database
            for (const state of channelStates) {
                const isAwarded = state.latest_video_id ? awardedVideoIds.has(state.latest_video_id) : false;
                result.statuses.push({
                    channelKey: state.channel_key,
                    channelName: state.channel_name,
                    latestVideoId: state.latest_video_id,
                    videoTitle: decodeHtmlEntities(state.latest_video_title),
                    videoThumbnail: state.latest_video_thumbnail || undefined,
                    isLiked: isAwarded, // If awarded, must have been liked
                    xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                    xpAwarded: isAwarded,
                    lastChecked: Date.now(),
                });
            }

            result.success = true;
            result.totalXPAwarded = 0;
            return result;
        }

        if (videos.length === 0) {
            log.warn('No videos to verify');
            result.success = true;
            return result;
        }

        // Call Edge Function for verification (only for non-awarded videos)
        log.info(`Verifying ${videos.length} videos via Edge Function (${awardedVideoIds.size} already awarded, skipped)`);

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
            const isAwarded = state.latest_video_id ? awardedVideoIds.has(state.latest_video_id) : false;

            result.statuses.push({
                channelKey: state.channel_key,
                channelName: state.channel_name,
                latestVideoId: state.latest_video_id,
                videoTitle: decodeHtmlEntities(state.latest_video_title),
                videoThumbnail: state.latest_video_thumbnail || undefined,
                isLiked: edgeResult?.liked ?? isAwarded,
                xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                xpAwarded: (edgeResult?.xpAwarded ?? 0) > 0 || isAwarded,
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

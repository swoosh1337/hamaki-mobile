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
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
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
        alreadyAwarded?: boolean;  // True if XP was previously awarded
    }>;
    totalXPAwarded: number;
    error?: string;
}

/**
 * Get video statuses from database
 * ✅ Reads from server-synced youtube_channel_state table
 * ✅ Reads from user_video_like_awards table to determine XP status (same source as Edge Function)
 * ✅ Zero YouTube API calls
 */
export async function getVideoStatusesFromDB(userId?: string): Promise<VideoLikeStatus[]> {
    const statuses: VideoLikeStatus[] = [];

    try {
        const channelStates = await channelStateService.getAll();

        // Get user's awarded video likes from the tracking table (same as Edge Function)
        let awardedVideoIds = new Set<string>();
        if (userId) {
            const { data: awardedData } = await supabase
                .from('user_video_like_awards')
                .select('video_id')
                .eq('user_id', userId);

            if (awardedData) {
                awardedVideoIds = new Set(awardedData.map(a => a.video_id));
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

        // Get user's awarded video likes from the tracking table (same as Edge Function)
        log.debug('Checking for existing awarded videos');
        const { data: awardedData, error: awardedError } = await supabase
            .from('user_video_like_awards')
            .select('video_id')
            .eq('user_id', userId);

        if (awardedError) {
            log.error('Error checking existing awarded videos:', awardedError);
            // Continue anyway - worst case we re-verify
        }

        const awardedVideoIds = new Set<string>(
            (awardedData || []).map(a => a.video_id)
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
        // Using unified wrapper with retry + cache fallback
        log.info(`Verifying ${videos.length} videos via Edge Function (${awardedVideoIds.size} already awarded, skipped)`);

        // Pre-flight validation: ensure access token is valid (like subscriptionService)
        const trimmedToken = accessToken.trim();
        if (!trimmedToken) {
            log.error('Access token is empty or whitespace');
            result.errors.push('Access token is empty');
            return result;
        }

        log.debug('Calling Edge Function with token', {
            tokenLength: trimmedToken.length,
            tokenPrefix: trimmedToken.substring(0, 10),
        });

        const edgeResult = await invokeEdgeFunction<EdgeFunctionResult>({
            functionName: 'verify-video-likes',
            body: { videos, userId, accessToken: trimmedToken },  // Pass token in body like subscriptions
            cacheKey: `video-likes:${userId}`,
            cacheTTL: 5 * 60 * 1000, // 5 minutes
            cacheFallback: async () => {
                // If Edge Function fails, return statuses from DB
                log.info('Edge Function failed, using DB statuses as fallback');
                return null; // Will use existing channel states
            },
            maxRetries: 3,
            silentFail: true,
        });

        if (!edgeResult.success || !edgeResult.data) {
            log.warn('Edge Function failed, using existing DB data');
            // Return success with existing DB data (already populated from awardedVideoIds)
            for (const state of channelStates) {
                const isAwarded = state.latest_video_id ? awardedVideoIds.has(state.latest_video_id) : false;
                result.statuses.push({
                    channelKey: state.channel_key,
                    channelName: state.channel_name,
                    latestVideoId: state.latest_video_id,
                    videoTitle: decodeHtmlEntities(state.latest_video_title),
                    videoThumbnail: state.latest_video_thumbnail || undefined,
                    isLiked: isAwarded,
                    xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                    xpAwarded: isAwarded,
                    lastChecked: Date.now(),
                });
            }
            result.success = true;
            return result;
        }

        const data = edgeResult.data;

        if (!data.success) {
            log.error('Verification failed:', data.error);
            result.errors.push(data.error || 'Unknown error');
            return result;
        }

        // Convert Edge Function results to VideoLikeStatus
        // Use Edge Function's alreadyAwarded flag which is authoritative (from user_video_like_awards table)
        for (const state of channelStates) {
            const edgeResult = data.results.find(r => r.videoId === state.latest_video_id);

            // Determine if XP was awarded:
            // 1. alreadyAwarded = true from Edge Function means it was previously awarded
            // 2. xpAwarded > 0 means it was just awarded in this request
            const isXpAwarded = edgeResult?.alreadyAwarded === true || (edgeResult?.xpAwarded ?? 0) > 0;

            result.statuses.push({
                channelKey: state.channel_key,
                channelName: state.channel_name,
                latestVideoId: state.latest_video_id,
                videoTitle: decodeHtmlEntities(state.latest_video_title),
                videoThumbnail: state.latest_video_thumbnail || undefined,
                isLiked: edgeResult?.liked ?? false,
                xpReward: VIDEO_LIKE_XP[state.channel_key] || 0,
                xpAwarded: isXpAwarded,
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

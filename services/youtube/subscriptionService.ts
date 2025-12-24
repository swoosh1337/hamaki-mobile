/**
 * YouTube Subscription Service
 *
 * Handles YouTube subscription verification for XP rewards.
 *
 * ⚠️ ZERO CLIENT-SIDE YOUTUBE API CALLS
 * 
 * This service:
 *   1. Reads verification state from database
 *   2. Calls Edge Function for verification (not YouTube directly)
 *   3. XP is awarded once per channel (gate model, not signal)
 * 
 * Subscriptions are GATES:
 *   - Verified once → never auto-checked again
 *   - User can manually re-verify if needed
 *   - XP is awarded once and never revoked
 */

import { leaderboardService, supabase } from '@/services/supabase';
import type {
    ChannelKey,
    SubscriptionStatus,
    VerifySubscriptionsResult,
} from '@/types/youtube';
import { YOUTUBE_CHANNELS as CHANNELS } from '@/types/youtube';
import { createLogger } from '@/utils/logger';

const log = createLogger('SubscriptionService');

// Edge Function response type
interface EdgeFunctionResult {
    success: boolean;
    results: Array<{
        channelId: string;
        channelKey: string;
        subscribed: boolean;
        xpAwarded: number;
        alreadyVerified: boolean;
    }>;
    totalXPAwarded: number;
    error?: string;
}

// Database verification record
interface SubscriptionVerification {
    user_id: string;
    channel_id: string;
    channel_key: string;
    subscribed: boolean;
    xp_awarded: boolean;
    verified_at: string | null;
}

/**
 * Get subscription statuses from database
 * ✅ Reads from youtube_subscription_verifications table
 * ✅ Zero YouTube API calls
 */
export async function getSubscriptionStatuses(
    userId: string
): Promise<SubscriptionStatus[]> {
    const statuses: SubscriptionStatus[] = [];
    const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

    try {
        // Get existing verifications from DB
        const { data: verifications } = await supabase
            .from('youtube_subscription_verifications')
            .select('*')
            .eq('user_id', userId);

        const verificationMap = new Map(
            (verifications || []).map((v: SubscriptionVerification) => [v.channel_key, v])
        );

        for (const channelKey of channelKeys) {
            const channel = CHANNELS[channelKey];
            const verification = verificationMap.get(channelKey);

            statuses.push({
                channelKey,
                channelId: channel.id,
                channelName: channel.name,
                isSubscribed: verification?.subscribed ?? false,
                xpReward: channel.xpReward,
                xpAwarded: verification?.xp_awarded ?? false,
                lastChecked: verification?.verified_at
                    ? new Date(verification.verified_at).getTime()
                    : 0,
            });
        }
    } catch (error) {
        log.error('Error fetching subscription statuses:', error);
        // Return unverified statuses on error
        for (const channelKey of channelKeys) {
            const channel = CHANNELS[channelKey];
            statuses.push({
                channelKey,
                channelId: channel.id,
                channelName: channel.name,
                isSubscribed: false,
                xpReward: channel.xpReward,
                xpAwarded: false,
                lastChecked: 0,
            });
        }
    }

    return statuses;
}

/**
 * Verify subscriptions and award XP via Edge Function
 * ✅ Zero client-side YouTube API calls
 * ✅ DB short-circuit (already verified = no API call)
 * ✅ XP awarded once per channel (gate model)
 */
export async function verifyAndAwardSubscriptionXP(
    accessToken: string,
    userId: string,
    _googleId: string, // Kept for backwards compatibility
    _forceRefresh: boolean = false // Ignored - gate model
): Promise<VerifySubscriptionsResult> {
    const result: VerifySubscriptionsResult = {
        success: false,
        statuses: [],
        totalXPAwarded: 0,
        errors: [],
    };

    try {
        const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

        // Build channel list for Edge Function
        const channels = channelKeys.map(key => ({
            channelId: CHANNELS[key].id,
            channelKey: key,
        }));

        // Call Edge Function for verification
        log.info('Verifying subscriptions via Edge Function');

        const { data, error } = await supabase.functions.invoke<EdgeFunctionResult>(
            'verify-subscriptions',
            {
                body: { channels, userId },
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (error) {
            log.error('Edge Function error:', error);
            log.error('Edge Function error details:', {
                message: error.message,
                name: error.name,
                context: (error as any).context,
            });
            result.errors.push(error.message);
            return result;
        }

        if (!data?.success) {
            log.error('Verification failed:', data?.error);
            result.errors.push(data?.error || 'Unknown error');
            return result;
        }

        // Convert Edge Function results to SubscriptionStatus
        for (const channelKey of channelKeys) {
            const channel = CHANNELS[channelKey];
            const edgeResult = data.results.find(r => r.channelKey === channelKey);

            result.statuses.push({
                channelKey,
                channelId: channel.id,
                channelName: channel.name,
                isSubscribed: edgeResult?.subscribed ?? false,
                xpReward: channel.xpReward,
                xpAwarded: (edgeResult?.xpAwarded ?? 0) > 0 || edgeResult?.alreadyVerified === true,
                lastChecked: Date.now(),
            });
        }

        result.success = true;
        result.totalXPAwarded = data.totalXPAwarded;

        // Update leaderboard if XP was awarded
        if (data.totalXPAwarded > 0) {
            log.info(`Awarded ${data.totalXPAwarded} XP for subscriptions`);
            try {
                await leaderboardService.updateLeaderboardPoints(userId, data.totalXPAwarded);
                log.info('Updated leaderboard with subscription XP');
            } catch (leaderboardError) {
                log.error('Failed to update leaderboard:', leaderboardError);
            }
        }

        return result;

    } catch (error) {
        log.error('Error in verifyAndAwardSubscriptionXP:', error);
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        return result;
    }
}

/**
 * Calculate total possible XP from all subscriptions
 */
export function getTotalPossibleSubscriptionXP(): number {
    return Object.values(CHANNELS).reduce((sum, channel) => sum + channel.xpReward, 0);
}

/**
 * Calculate earned subscription XP from statuses
 */
export function getEarnedSubscriptionXP(statuses: SubscriptionStatus[]): number {
    return statuses
        .filter(s => s.xpAwarded)
        .reduce((sum, s) => sum + s.xpReward, 0);
}

/**
 * YouTube Subscription Service
 *
 * Handles YouTube subscription verification for XP rewards.
 * Uses caching to minimize API calls.
 *
 * Key features:
 * - Checks subscriptions via YouTube API
 * - Caches results for 7 days
 * - Awards XP only once per channel (never revoked)
 */

import { supabase } from '@/services/supabase/client';
import type {
    ChannelKey,
    SubscriptionStatus,
    SubscriptionXPAwarded,
    VerifySubscriptionsResult
} from '@/types/youtube';
import { YOUTUBE_CHANNELS as CHANNELS } from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import { verificationCacheService } from './verificationCacheService';

const log = createLogger('SubscriptionService');

/**
 * Check if user is subscribed to a specific YouTube channel
 * Uses YouTube Data API subscriptions.list endpoint
 *
 * Cost: ~1-N units (depending on pagination)
 */
async function checkSingleChannelSubscription(
    accessToken: string,
    channelId: string
): Promise<boolean> {
    try {
        let nextPageToken: string | undefined = undefined;

        do {
            const url: string = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''
                }`;

            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                log.error(`YouTube API error for channel ${channelId}`, data);
                throw new Error(
                    `${response.status}: ${data.error?.message || 'Failed to fetch subscriptions'}`
                );
            }

            // Check if subscribed to this channel on current page
            const isSubscribed =
                data.items?.some(
                    (item: any) => item.snippet?.resourceId?.channelId === channelId
                ) || false;

            if (isSubscribed) {
                return true;
            }

            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        return false;
    } catch (error) {
        log.error(`Error checking subscription for channel ${channelId}`, error);
        throw error;
    }
}

/**
 * Check all channel subscriptions via YouTube API
 *
 * Cost: ~4 units (1 per channel, assuming user has < 50 subscriptions)
 */
export async function checkAllChannelSubscriptions(
    accessToken: string
): Promise<Record<ChannelKey, boolean>> {
    log.info('Checking all channel subscriptions...');

    const results: Record<ChannelKey, boolean> = {
        hamaki: false,
        miro: false,
        bastos: false,
        koro: false,
    };

    const channelKeys: ChannelKey[] = ['hamaki', 'miro', 'bastos', 'koro'];

    await Promise.all(
        channelKeys.map(async (key) => {
            try {
                const channel = CHANNELS[key];
                results[key] = await checkSingleChannelSubscription(accessToken, channel.id);
                log.debug(`Channel ${channel.name}: ${results[key] ? 'subscribed' : 'not subscribed'}`);
            } catch (error) {
                log.error(`Error checking ${key} subscription`, error);
                results[key] = false;
            }
        })
    );

    log.info('Subscription check completed', { results });
    return results;
}

/**
 * Verify subscriptions and award XP
 * Uses cache when available, only makes API calls if cache is expired
 *
 * Key behavior:
 * - XP is awarded only once per channel
 * - If user was awarded XP before, they won't get it again (even if they unsubscribed)
 * - Cache is used to avoid repeated API calls (7-day TTL)
 */
export async function verifyAndAwardSubscriptionXP(
    accessToken: string,
    userId: string,
    googleId: string,
    forceRefresh: boolean = false
): Promise<VerifySubscriptionsResult> {
    const result: VerifySubscriptionsResult = {
        success: false,
        statuses: [],
        totalXPAwarded: 0,
        errors: [],
    };

    try {
        // Check if we need to make API calls or can use cache
        const needsCheck = forceRefresh || await verificationCacheService.needsFullSubscriptionCheck();

        let subscriptionResults: Record<ChannelKey, boolean>;

        if (needsCheck) {
            log.info('Making fresh API call for subscription check');
            subscriptionResults = await checkAllChannelSubscriptions(accessToken);
        } else {
            log.info('Using cached subscription data');
            const cache = await verificationCacheService.getCache();
            subscriptionResults = {} as Record<ChannelKey, boolean>;

            for (const key of Object.keys(CHANNELS) as ChannelKey[]) {
                const status = cache.subscriptions.statuses[key];
                subscriptionResults[key] = status?.isSubscribed || false;
            }
        }

        // Get current XP awarded status from database
        const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('subscription_xp_awarded, xp_points')
            .eq('google_id', googleId)
            .single();

        if (fetchError) {
            log.error('Failed to fetch user data', fetchError);
            result.errors.push('Failed to fetch user data');
            return result;
        }

        const currentXPAwarded: SubscriptionXPAwarded = userData?.subscription_xp_awarded || {
            hamaki: false,
            miro: false,
            bastos: false,
            koro: false,
        };
        const currentXP = userData?.xp_points || 0;

        let totalNewXP = 0;
        const updatedXPAwarded = { ...currentXPAwarded };
        const statuses: SubscriptionStatus[] = [];

        // Process each channel
        for (const [key, channel] of Object.entries(CHANNELS)) {
            const channelKey = key as ChannelKey;
            const isSubscribed = subscriptionResults[channelKey];
            const alreadyAwarded = currentXPAwarded[channelKey] || false;

            // Award XP only if subscribed AND not already awarded
            let xpToAward = 0;
            if (isSubscribed && !alreadyAwarded) {
                xpToAward = channel.xpReward;
                totalNewXP += xpToAward;
                updatedXPAwarded[channelKey] = true;
                log.info(`Awarding ${xpToAward} XP for ${channel.name} subscription`);
            }

            const status: SubscriptionStatus = {
                channelKey,
                channelId: channel.id,
                channelName: channel.name,
                isSubscribed,
                xpReward: channel.xpReward,
                xpAwarded: alreadyAwarded || xpToAward > 0,
                lastChecked: Date.now(),
            };
            statuses.push(status);
        }

        // Update database if any XP was awarded
        if (totalNewXP > 0) {
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    xp_points: currentXP + totalNewXP,
                    subscription_xp_awarded: updatedXPAwarded,
                    subscriptions_verified_at: new Date().toISOString(),
                })
                .eq('google_id', googleId);

            if (updateError) {
                log.error('Failed to update user XP', updateError);
                result.errors.push('Failed to update XP in database');
                return result;
            }

            log.info(`Awarded ${totalNewXP} total XP for subscriptions`);
        }

        // Update cache
        const statusMap: Record<ChannelKey, SubscriptionStatus> = {} as Record<ChannelKey, SubscriptionStatus>;
        statuses.forEach(s => { statusMap[s.channelKey] = s; });
        await verificationCacheService.updateAllSubscriptionStatuses(statusMap);

        result.success = true;
        result.statuses = statuses;
        result.totalXPAwarded = totalNewXP;
        return result;

    } catch (error) {
        log.error('Error in verifyAndAwardSubscriptionXP', error);
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        return result;
    }
}

/**
 * Get current subscription status from cache or DB
 * Does NOT make API calls
 */
export async function getSubscriptionStatuses(
    googleId: string
): Promise<SubscriptionStatus[]> {
    try {
        // Try cache first
        const cache = await verificationCacheService.getCache();
        const cachedStatuses = Object.values(cache.subscriptions.statuses);

        if (cachedStatuses.length > 0) {
            return cachedStatuses;
        }

        // Fall back to database
        const { data: userData } = await supabase
            .from('users')
            .select('subscription_xp_awarded, youtube_subscribed, miro_channel_subscribed, bastos_channel_subscribed, koro_channel_subscribed')
            .eq('google_id', googleId)
            .single();

        if (!userData) {
            return [];
        }

        const xpAwarded: SubscriptionXPAwarded = userData.subscription_xp_awarded || {};

        return Object.entries(CHANNELS).map(([key, channel]) => {
            const channelKey = key as ChannelKey;
            const dbField = channel.dbField as keyof typeof userData;

            return {
                channelKey,
                channelId: channel.id,
                channelName: channel.name,
                isSubscribed: userData[dbField] || false,
                xpReward: channel.xpReward,
                xpAwarded: xpAwarded[channelKey] || false,
                lastChecked: 0,
            };
        });
    } catch (error) {
        log.error('Error getting subscription statuses', error);
        return [];
    }
}

/**
 * Calculate total possible XP from all subscriptions
 */
export function getTotalPossibleSubscriptionXP(): number {
    return Object.values(CHANNELS).reduce((sum, channel) => sum + channel.xpReward, 0);
}

/**
 * Calculate earned subscription XP
 */
export function getEarnedSubscriptionXP(statuses: SubscriptionStatus[]): number {
    return statuses
        .filter(s => s.xpAwarded)
        .reduce((sum, s) => sum + s.xpReward, 0);
}

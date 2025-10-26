/**
 * Channel Subscription Service
 * Manages multi-channel YouTube subscriptions and XP rewards
 */

import { supabase, UserProfile, userService } from './supabase';

// Channel configuration with IDs and XP rewards
export const YOUTUBE_CHANNELS = {
  hamaki: {
    id: process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID!,
    name: 'HamaKi',
    xpReward: 1000,
    dbField: 'youtube_subscribed' as const,
    rewardKey: 'hamaki' as const,
  },
  miro: {
    id: 'UChJnB_7-JUYXEr-Fv3Y_rGA',
    name: "Miro",
    xpReward: 700,
    dbField: 'miro_channel_subscribed' as const,
    rewardKey: 'miro' as const,
  },
  bastos: {
    id: 'UCjSZIjLKfQHkdZbZMvYQhAw',
    name: "Basto",
    xpReward: 700,
    dbField: 'bastos_channel_subscribed' as const,
    rewardKey: 'bastos' as const,
  },
  koro: {
    id: 'UCPCQmO5MrP3S1oVu6p9bxRw',
    name: "Koro",
    xpReward: 700,
    dbField: 'koro_channel_subscribed' as const,
    rewardKey: 'koro' as const,
  },
} as const;

export type ChannelKey = keyof typeof YOUTUBE_CHANNELS;

export interface ChannelSubscriptionStatus {
  channelKey: ChannelKey;
  channelId: string;
  channelName: string;
  isSubscribed: boolean;
  xpReward: number;
  xpAwarded: boolean;
}

/**
 * Check if user is subscribed to a specific channel
 */
async function checkSingleChannelSubscription(
  accessToken: string,
  channelId: string
): Promise<boolean> {
  try {
    let nextPageToken: string | undefined = undefined;

    do {
      const url = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${
        nextPageToken ? `&pageToken=${nextPageToken}` : ''
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`YouTube API error for channel ${channelId}:`, data);
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
    console.error(`Error checking subscription for channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Check all channel subscriptions for a user
 */
export async function checkAllChannelSubscriptions(
  accessToken: string
): Promise<Record<ChannelKey, boolean>> {
  try {
    console.log('🔍 Checking all channel subscriptions...');

    const subscriptionChecks = Object.entries(YOUTUBE_CHANNELS).map(
      async ([key, channel]) => {
        const isSubscribed = await checkSingleChannelSubscription(
          accessToken,
          channel.id
        );
        return [key, isSubscribed] as [ChannelKey, boolean];
      }
    );

    const results = await Promise.all(subscriptionChecks);
    const subscriptions = Object.fromEntries(results) as Record<ChannelKey, boolean>;

    console.log('✅ Subscription check results:', subscriptions);
    return subscriptions;
  } catch (error) {
    console.error('Error checking all channel subscriptions:', error);
    throw error;
  }
}

/**
 * Get current subscription status for all channels from database
 */
export async function getChannelSubscriptionStatus(
  googleId: string
): Promise<ChannelSubscriptionStatus[]> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (error) throw error;
    if (!user) throw new Error('User not found');

    const statuses: ChannelSubscriptionStatus[] = Object.entries(YOUTUBE_CHANNELS).map(
      ([key, channel]) => ({
        channelKey: key as ChannelKey,
        channelId: channel.id,
        channelName: channel.name,
        isSubscribed: user[channel.dbField] || false,
        xpReward: channel.xpReward,
        xpAwarded: user.subscription_xp_awarded?.[channel.rewardKey] || false,
      })
    );

    return statuses;
  } catch (error) {
    console.error('Error getting channel subscription status:', error);
    throw error;
  }
}

/**
 * Update subscription status in database and award XP if needed
 */
export async function updateChannelSubscriptionsAndAwardXP(
  googleId: string,
  subscriptions: Record<ChannelKey, boolean>
): Promise<{ totalXPAwarded: number; updatedUser: UserProfile }> {
  try {
    console.log('📊 Updating channel subscriptions and awarding XP...');

    // Get current user data
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (fetchError) throw fetchError;
    if (!currentUser) throw new Error('User not found');

    // Calculate XP to award
    let totalXPAwarded = 0;
    const xpAwardedRecord = currentUser.subscription_xp_awarded || {
      hamaki: false,
      miro: false,
      bastos: false,
      koro: false,
    };

    const updateData: any = {
      subscriptions_verified_at: new Date().toISOString(),
    };

    // Check each channel and award XP if newly subscribed
    Object.entries(YOUTUBE_CHANNELS).forEach(([key, channel]) => {
      const channelKey = key as ChannelKey;
      const isSubscribed = subscriptions[channelKey];
      const wasAwarded = xpAwardedRecord[channel.rewardKey];

      // Update subscription status
      updateData[channel.dbField] = isSubscribed;

      // Award XP if subscribed and not already awarded
      if (isSubscribed && !wasAwarded) {
        totalXPAwarded += channel.xpReward;
        xpAwardedRecord[channel.rewardKey] = true;
        console.log(`💰 Awarding ${channel.xpReward} XP for ${channel.name}`);
      }
    });

    // Update XP and subscription data
    if (totalXPAwarded > 0) {
      updateData.xp_points = currentUser.xp_points + totalXPAwarded;
    }
    updateData.subscription_xp_awarded = xpAwardedRecord;

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('google_id', googleId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Always sync total XP to leaderboard (even if no new XP was awarded)
    // This ensures the leaderboard reflects the user's current total XP
    if (updatedUser) {
      console.log(`📊 Syncing user's total XP (${updatedUser.xp_points}) to leaderboard...`);
      try {
        // Sync the user's TOTAL XP to leaderboard, not just the newly awarded XP
        await syncUserXPToLeaderboard(updatedUser.id, updatedUser.xp_points);
        console.log(`✅ Leaderboard synced with user's total XP`);
      } catch (leaderboardError) {
        console.error('⚠️ Failed to sync leaderboard:', leaderboardError);
        // Don't fail the whole operation if leaderboard sync fails
      }
    }

    console.log(`✅ Updated subscriptions. Total XP awarded: ${totalXPAwarded}`);

    return {
      totalXPAwarded,
      updatedUser: updatedUser as UserProfile,
    };
  } catch (error) {
    console.error('Error updating channel subscriptions:', error);
    throw error;
  }
}

/**
 * Sync user's total XP to leaderboard (sets absolute value, not incremental)
 */
async function syncUserXPToLeaderboard(userId: string, totalXP: number): Promise<void> {
  try {
    const weekStartDate = getWeekStartDate();

    // Update all-time leaderboard with user's TOTAL XP
    const { data: allTimeEntry, error: allTimeCheckError } = await supabase
      .from('leaderboard_entries')
      .select('points')
      .eq('user_id', userId)
      .eq('period_type', 'all_time')
      .single();

    if (allTimeCheckError && allTimeCheckError.code !== 'PGRST116') {
      console.error('Error checking all-time leaderboard:', allTimeCheckError);
    }

    if (allTimeEntry) {
      // Update existing entry with user's TOTAL XP
      const { error: updateError } = await supabase
        .from('leaderboard_entries')
        .update({ points: totalXP })
        .eq('user_id', userId)
        .eq('period_type', 'all_time');

      if (updateError) {
        console.error('Error updating all-time leaderboard:', updateError);
      } else {
        console.log(`✅ All-time leaderboard updated to ${totalXP} XP`);
      }
    } else {
      // Create new entry with user's TOTAL XP
      const { error: insertError } = await supabase
        .from('leaderboard_entries')
        .insert({
          user_id: userId,
          points: totalXP,
          period_type: 'all_time',
        });

      if (insertError) {
        console.error('Error inserting all-time leaderboard:', insertError);
      } else {
        console.log(`✅ All-time leaderboard entry created with ${totalXP} XP`);
      }
    }

    // Note: We don't sync weekly leaderboard here since subscription XP
    // shouldn't count toward weekly XP (only game scores should)
  } catch (error) {
    console.error('Error syncing XP to leaderboard:', error);
    throw error;
  }
}

/**
 * Get week start date (Monday) for leaderboard
 */
function getWeekStartDate(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

/**
 * Verify and sync subscriptions with YouTube (call this when user taps verify)
 */
export async function verifyAndSyncSubscriptions(
  accessToken: string,
  googleId: string
): Promise<{ totalXPAwarded: number; updatedUser: UserProfile }> {
  try {
    console.log('🔄 Verifying and syncing channel subscriptions...');

    // Check all subscriptions via YouTube API
    const subscriptions = await checkAllChannelSubscriptions(accessToken);

    // Update database and award XP
    const result = await updateChannelSubscriptionsAndAwardXP(googleId, subscriptions);

    return result;
  } catch (error) {
    console.error('Error verifying subscriptions:', error);
    throw error;
  }
}

/**
 * Open a YouTube channel in the YouTube app or browser
 */
export function openYouTubeChannel(channelId: string): string {
  const youtubeUrl = `https://www.youtube.com/channel/${channelId}?sub_confirmation=1`;
  // The ?sub_confirmation=1 parameter shows the subscribe button
  return youtubeUrl;
}

/**
 * Calculate total possible XP from all channels
 */
export function getTotalPossibleXP(): number {
  return Object.values(YOUTUBE_CHANNELS).reduce(
    (sum, channel) => sum + channel.xpReward,
    0
  );
}

/**
 * Calculate current XP earned from subscriptions
 */
export function calculateEarnedXP(statuses: ChannelSubscriptionStatus[]): number {
  return statuses
    .filter((status) => status.isSubscribed && status.xpAwarded)
    .reduce((sum, status) => sum + status.xpReward, 0);
}

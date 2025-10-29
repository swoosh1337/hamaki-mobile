/**
 * Background XP Checks
 * Automatically checks and awards XP for subscriptions and video likes
 */

import { getValidAccessToken } from './auth';
import { checkAllChannelSubscriptions, updateChannelSubscriptionsAndAwardXP } from './channelSubscriptions';
import { userService } from './supabase';
import { checkAndAwardVideoLikes } from './videoLikes';

export interface BackgroundXPResult {
  subscriptionXP: number;
  videoLikeXP: number;
  totalXP: number;
  errors: string[];
}

/**
 * Perform all background XP checks (subscriptions + video likes)
 * This is called automatically on sign-in and when app becomes active
 */
export async function performBackgroundXPChecks(userId: string): Promise<BackgroundXPResult> {
  const result: BackgroundXPResult = {
    subscriptionXP: 0,
    videoLikeXP: 0,
    totalXP: 0,
    errors: [],
  };

  try {
    // Get valid access token
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.log('⚠️ No valid access token for background XP checks');
      result.errors.push('No valid access token');
      return result;
    }

    console.log('🔍 Starting background XP checks...');

    // Check channel subscriptions
    try {
      console.log('📺 Checking channel subscriptions...');
      
      // First, get the user's google_id from their user_id
      const { data: userData, error: userError } = await userService.supabase
        .from('users')
        .select('google_id')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        console.error('❌ Failed to get user google_id:', userError);
        result.errors.push('Failed to get user data');
      } else {
        const subscriptions = await checkAllChannelSubscriptions(accessToken);
        const subResult = await updateChannelSubscriptionsAndAwardXP(userData.google_id, subscriptions);
        
        result.subscriptionXP = subResult.totalXPAwarded;
        
        if (subResult.totalXPAwarded > 0) {
          console.log(`✅ Awarded ${subResult.totalXPAwarded} XP for channel subscriptions`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking channel subscriptions:', error);
      result.errors.push('Failed to check channel subscriptions');
    }

    // Check video likes
    try {
      console.log('👍 Checking video likes...');
      const likesResult = await checkAndAwardVideoLikes(accessToken, userId);
      
      result.videoLikeXP = likesResult.xpAwarded;
      
      if (likesResult.xpAwarded > 0) {
        console.log(`✅ Awarded ${likesResult.xpAwarded} XP for video likes`);
      }
      
      if (likesResult.errors.length > 0) {
        result.errors.push(...likesResult.errors);
      }
    } catch (error) {
      console.error('❌ Error checking video likes:', error);
      result.errors.push('Failed to check video likes');
    }

    result.totalXP = result.subscriptionXP + result.videoLikeXP;

    if (result.totalXP > 0) {
      console.log(`🎉 Total XP awarded in background: ${result.totalXP} (Subscriptions: ${result.subscriptionXP}, Video Likes: ${result.videoLikeXP})`);
    } else {
      console.log('ℹ️ No new XP to award (already claimed or no qualifying actions)');
    }

    return result;
  } catch (error) {
    console.error('❌ Error in performBackgroundXPChecks:', error);
    result.errors.push('Background XP check failed');
    return result;
  }
}

/**
 * Perform background XP checks with notification
 * Shows a notification to the user if XP was awarded
 */
export async function performBackgroundXPChecksWithNotification(
  userId: string,
  showNotification: (title: string, message: string) => void
): Promise<BackgroundXPResult> {
  const result = await performBackgroundXPChecks(userId);

  // Show notification if XP was awarded
  if (result.totalXP > 0) {
    const messages: string[] = [];
    
    if (result.subscriptionXP > 0) {
      messages.push(`${result.subscriptionXP} XP from subscriptions`);
    }
    
    if (result.videoLikeXP > 0) {
      messages.push(`${result.videoLikeXP} XP from video likes`);
    }

    showNotification(
      '🎉 XP Earned!',
      `You earned ${result.totalXP} XP!\n${messages.join('\n')}`
    );
  }

  return result;
}

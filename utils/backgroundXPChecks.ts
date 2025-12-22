/**
 * Background XP Checks
 * Automatically checks and awards XP for subscriptions and video likes
 */

import { userService } from '@/services/supabase';
import { getValidAccessToken } from './auth';
import { checkAllChannelSubscriptions, updateChannelSubscriptionsAndAwardXP } from './channelSubscriptions';
import { createLogger } from './logger';
import { checkAndAwardVideoLikes } from './videoLikes';

const log = createLogger('BackgroundXP');

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
      log.warn('No valid access token available for background XP checks');
      result.errors.push('No valid access token');
      return result;
    }

    log.info('Starting background XP checks...');

    // Check channel subscriptions
    try {
      log.debug('Checking channel subscriptions...');

      // Fetch google_id via service helper (testable/mocked)
      const googleId = await userService.getGoogleIdByUserId(userId);

      if (!googleId) {
        log.error('Failed to get user google_id via service', { userId });
        result.errors.push('Failed to get user data');
      } else {
        const subscriptions = await checkAllChannelSubscriptions(accessToken);
        const subResult = await updateChannelSubscriptionsAndAwardXP(googleId, subscriptions);

        result.subscriptionXP = subResult.totalXPAwarded;

        if (subResult.totalXPAwarded > 0) {
          log.info(`Awarded ${subResult.totalXPAwarded} XP for channel subscriptions`);
        }
      }
    } catch (error) {
      log.error('Error checking channel subscriptions:', error);
      result.errors.push('Failed to check channel subscriptions');
    }

    // Check video likes
    try {
      log.debug('Checking video likes...');
      const likesResult = await checkAndAwardVideoLikes(accessToken, userId);

      result.videoLikeXP = likesResult.xpAwarded;

      if (likesResult.xpAwarded > 0) {
        log.info(`Awarded ${likesResult.xpAwarded} XP for video likes`);
      }

      if (likesResult.errors.length > 0) {
        result.errors.push(...likesResult.errors);
      }
    } catch (error) {
      log.error('Error checking video likes:', error);
      result.errors.push('Failed to check video likes');
    }

    result.totalXP = result.subscriptionXP + result.videoLikeXP;

    if (result.totalXP > 0) {
      log.info('Background XP checks complete', {
        total: result.totalXP,
        subs: result.subscriptionXP,
        likes: result.videoLikeXP
      });
    } else {
      log.debug('No new XP to award from background checks');
    }

    return result;
  } catch (error: any) {
    log.error('Error in performBackgroundXPChecks:', error);
    result.errors.push(`performBackgroundXPChecks failed: ${error.message || String(error)}`);
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

  // Show notification if XP was awarded (do not let errors bubble)
  if (result.totalXP > 0) {
    const messages: string[] = [];
    if (result.subscriptionXP > 0) messages.push(`${result.subscriptionXP} XP from subscriptions`);
    if (result.videoLikeXP > 0) messages.push(`${result.videoLikeXP} XP from video likes`);

    try {
      showNotification('🎉 XP Earned!', `You earned ${result.totalXP} XP!\n${messages.join('\n')}`);
    } catch (err) {
      log.error('Failed to show XP notification:', err);
    }
  }

  return result;
}

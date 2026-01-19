/**
 * Game Cooldown System
 * Manages cooldowns for games and schedules notifications
 */

import { supabase } from '@/services/supabase/client';
import * as Notifications from 'expo-notifications';
import { createLogger } from './logger';

const log = createLogger('GameCooldown');

// Cooldown duration in milliseconds (1 hour)
export const GAME_COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour

export type GameType = 'nopogod' | 'hammockjump';

export interface GameCooldownStatus {
  gameType: GameType;
  canPlay: boolean;
  lastPlayedAt: Date | null;
  cooldownEndsAt: Date | null;
  remainingMs: number;
  remainingMinutes: number;
}

/**
 * Check if a user can play a specific game (cooldown check)
 */
export async function checkGameCooldown(
  userId: string,
  gameType: GameType,
  isDemoMode: boolean = false
): Promise<GameCooldownStatus> {
  // Demo users have no cooldowns
  if (isDemoMode) {
    return {
      gameType,
      canPlay: true,
      lastPlayedAt: null,
      cooldownEndsAt: null,
      remainingMs: 0,
      remainingMinutes: 0,
    };
  }

  try {
    // Get user's game cooldown data
    const { data: userData, error } = await supabase
      .from('users')
      .select('game_last_played')
      .eq('id', userId)
      .single();

    if (error) {
      log.error('Error fetching game cooldown data:', error);
      // On error, allow play (fail open)
      return {
        gameType,
        canPlay: true,
        lastPlayedAt: null,
        cooldownEndsAt: null,
        remainingMs: 0,
        remainingMinutes: 0,
      };
    }

    const gameLastPlayed = userData?.game_last_played || {};
    const lastPlayedTimestamp = gameLastPlayed[gameType];

    if (!lastPlayedTimestamp) {
      // Never played before, can play
      return {
        gameType,
        canPlay: true,
        lastPlayedAt: null,
        cooldownEndsAt: null,
        remainingMs: 0,
        remainingMinutes: 0,
      };
    }

    const lastPlayedAt = new Date(lastPlayedTimestamp);
    const now = new Date();
    const timeSinceLastPlay = now.getTime() - lastPlayedAt.getTime();
    const remainingMs = Math.max(0, GAME_COOLDOWN_MS - timeSinceLastPlay);
    const cooldownEndsAt = new Date(lastPlayedAt.getTime() + GAME_COOLDOWN_MS);

    return {
      gameType,
      canPlay: remainingMs === 0,
      lastPlayedAt,
      cooldownEndsAt,
      remainingMs,
      remainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
    };
  } catch (error) {
    log.error('Error checking game cooldown:', error);
    // On error, allow play (fail open)
    return {
      gameType,
      canPlay: true,
      lastPlayedAt: null,
      cooldownEndsAt: null,
      remainingMs: 0,
      remainingMinutes: 0,
    };
  }
}

/**
 * Update the last played timestamp for a game
 */
export async function updateGameLastPlayed(
  userId: string,
  gameType: GameType,
  isDemoMode: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Demo users don't need cooldown tracking
  if (isDemoMode) {
    return { success: true };
  }

  try {
    // Get current game_last_played data
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('game_last_played')
      .eq('id', userId)
      .single();

    if (fetchError) {
      log.error('Error fetching game data:', fetchError);
      return { success: false, error: fetchError.message };
    }

    const currentGameData = userData?.game_last_played || {};
    const updatedGameData = {
      ...currentGameData,
      [gameType]: new Date().toISOString(),
    };

    // Update the database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        game_last_played: updatedGameData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      log.error('Error updating game last played:', updateError);
      return { success: false, error: updateError.message };
    }

    log.info(`Updated last played time for ${gameType}`);

    // Schedule cooldown notification
    await scheduleCooldownNotification(gameType);

    return { success: true };
  } catch (error) {
    log.error('Error in updateGameLastPlayed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Record a game play session (wrapper for updateGameLastPlayed)
 */
// Valid game types for validation
const VALID_GAME_TYPES: readonly GameType[] = ['nopogod', 'hammockjump'] as const;

export async function recordGamePlay(
  userId: string,
  gameType: string, // Accept string to be more flexible, but internally map to GameType
  isDemoMode: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Map game names if necessary (different IDs used in different places)
  // Server-side expects: 'nopogod', 'hammockjump'
  let validGameType: GameType;

  switch (gameType.toLowerCase()) {
    case 'nopogod':
    case 'no-pogodi':
      validGameType = 'nopogod';
      break;
    case 'hammockjump':
    case 'hammock-jump':
      validGameType = 'hammockjump';
      break;
    default:
      // Validate unknown game types instead of unsafe cast
      log.warn(`Unknown game type received: "${gameType}". Valid types: ${VALID_GAME_TYPES.join(', ')}`);
      return {
        success: false,
        error: `Invalid game type: ${gameType}`,
      };
  }

  return updateGameLastPlayed(userId, validGameType, isDemoMode);
}

/**
 * Schedule a push notification for when the game cooldown expires
 */
async function scheduleCooldownNotification(gameType: GameType): Promise<void> {
  try {
    // Check if we have notification permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      log.debug('No notification permissions, skipping cooldown notification');
      return;
    }

    const gameNames: Record<GameType, string> = {
      nopogod: 'მისაღებზე',
      hammockjump: 'Hammock Jump',
    };

    // Cancel any existing notifications for this game
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.gameType === gameType) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

    // Schedule new notification for 2 hours from now
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎮 Cooldown-ი მორჩა!',
        body: `${gameNames[gameType]} cooldown-ი მორჩა, შეგიძლია თამაში ითამაშო და დააგროვო ქულები!`,
        data: { gameType, type: 'game_cooldown' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: GAME_COOLDOWN_MS / 1000, // 2 hours in seconds
        repeats: false,
      },
    });

    log.info(`Scheduled cooldown notification for ${gameType}`, { notificationId });
  } catch (error) {
    log.error('Error scheduling cooldown notification:', error);
    // Don't throw - notification scheduling is not critical
  }
}

/**
 * Get cooldown status for all games
 */
export async function getAllGameCooldowns(
  userId: string,
  isDemoMode: boolean = false
): Promise<Record<GameType, GameCooldownStatus>> {
  const games: GameType[] = ['nopogod', 'hammockjump'];
  const checks = games.map((game) => checkGameCooldown(userId, game, isDemoMode));
  const results = await Promise.all(checks);

  const statuses = results.reduce<Record<GameType, GameCooldownStatus>>((acc, status, idx) => {
    acc[games[idx]] = status;
    return acc;
  }, {} as Record<GameType, GameCooldownStatus>);

  return statuses;
}

/**
 * Format remaining time as human-readable string
 */
export function formatCooldownTime(remainingMs: number): string {
  if (remainingMs === 0) {
    return 'Ready to play!';
  }

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else {
    return `${minutes}m remaining`;
  }
}

/**
 * Cancel all game cooldown notifications
 */
export async function cancelAllGameCooldownNotifications(): Promise<void> {
  try {
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.type === 'game_cooldown') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    log.info('Cancelled all game cooldown notifications');
  } catch (error) {
    log.error('Error cancelling cooldown notifications:', error);
  }
}

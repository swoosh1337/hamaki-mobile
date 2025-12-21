/**
 * XP Stats Cache
 * Caches weekly and total XP stats to reduce database queries
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';
import { XPStats } from './supabase';

const log = createLogger('XPCache');

const CACHE_KEY_PREFIX = 'xp_stats_cache_';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface CachedXPStats {
  data: XPStats;
  timestamp: number;
}

/**
 * Get cache key for a user
 */
function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cachedData: CachedXPStats): boolean {
  const now = Date.now();
  const age = now - cachedData.timestamp;
  return age < CACHE_DURATION_MS;
}

/**
 * Get XP stats from cache
 */
export async function getCachedXPStats(userId: string): Promise<XPStats | null> {
  try {
    const cacheKey = getCacheKey(userId);
    const cachedJson = await AsyncStorage.getItem(cacheKey);

    if (!cachedJson) {
      log.debug('No cached XP stats found');
      return null;
    }

    const cached: CachedXPStats = JSON.parse(cachedJson);

    if (!isCacheValid(cached)) {
      log.debug('Cached XP stats expired');
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    log.debug('Using cached XP stats');
    return cached.data;
  } catch (error) {
    log.error('Error reading XP stats cache:', error);
    return null;
  }
}

/**
 * Save XP stats to cache
 */
export async function setCachedXPStats(userId: string, stats: XPStats): Promise<void> {
  try {
    const cacheKey = getCacheKey(userId);
    const cached: CachedXPStats = {
      data: stats,
      timestamp: Date.now(),
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cached));
    log.debug('XP stats cached successfully');
  } catch (error) {
    log.error('Error saving XP stats cache:', error);
  }
}

/**
 * Invalidate (clear) XP stats cache for a user
 */
export async function invalidateXPStatsCache(userId: string): Promise<void> {
  try {
    const cacheKey = getCacheKey(userId);
    await AsyncStorage.removeItem(cacheKey);
    log.debug('XP stats cache invalidated', { userId });
  } catch (error) {
    log.error('Error invalidating XP stats cache:', error);
  }
}

/**
 * Clear all XP stats caches (useful for sign out)
 */
export async function clearAllXPStatsCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));

    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      log.info(`Cleared ${cacheKeys.length} XP stats cache(s)`);
    }
  } catch (error) {
    log.error('Error clearing all XP stats cache:', error);
  }
}

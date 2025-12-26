/**
 * Edge Function Client
 * 
 * Unified wrapper for Supabase Edge Function calls with:
 * - Retry with exponential backoff
 * - Cache fallback for network failures
 * - Silent degradation (log warning, don't crash)
 * 
 * Usage:
 * ```typescript
 * const result = await invokeEdgeFunction({
 *   functionName: 'verify-subscriptions',
 *   body: { userId, channels },
 *   cacheKey: `subscriptions:${userId}`,
 *   cacheFallback: () => getCachedSubscriptions(userId),
 * });
 * ```
 */

import { supabase } from '@/services/supabase';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff } from '@/utils/retry';
import AsyncStorage from '@react-native-async-storage/async-storage';

const log = createLogger('EdgeFunctionClient');

// Cache prefix for edge function results
const CACHE_PREFIX = '@edge_function_cache:';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Options for invoking an Edge Function
 */
export interface EdgeFunctionOptions<T> {
    /** Name of the Edge Function to invoke */
    functionName: string;

    /** Request body to send */
    body: Record<string, unknown>;

    /** Optional additional headers */
    headers?: Record<string, string>;

    /** Cache key for storing/retrieving cached results (optional) */
    cacheKey?: string;

    /** TTL for cached results in milliseconds (default: 5 minutes) */
    cacheTTL?: number;

    /** Fallback function to call if cache is empty (optional) */
    cacheFallback?: () => T | Promise<T | null> | null;

    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;

    /** Base delay for exponential backoff in ms (default: 1000) */
    baseDelayMs?: number;

    /** Whether to silently fail and return fallback (default: true) */
    silentFail?: boolean;
}

/**
 * Result from Edge Function invocation
 */
export interface EdgeFunctionResult<T> {
    /** Whether the call was successful */
    success: boolean;

    /** Response data from the function */
    data: T | null;

    /** Error message if failed */
    error?: string;

    /** Whether the result came from cache */
    fromCache: boolean;
}

/**
 * Cached result structure
 */
interface CachedResult<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Get cached result from AsyncStorage
 */
async function getCachedResult<T>(cacheKey: string): Promise<T | null> {
    try {
        const key = `${CACHE_PREFIX}${cacheKey}`;
        const cached = await AsyncStorage.getItem(key);

        if (!cached) return null;

        const parsed: CachedResult<T> = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is expired
        if (now - parsed.timestamp > parsed.ttl) {
            log.debug(`Cache expired for ${cacheKey}`);
            await AsyncStorage.removeItem(key);
            return null;
        }

        log.debug(`Cache hit for ${cacheKey}`);
        return parsed.data;
    } catch (error) {
        log.warn(`Failed to read cache for ${cacheKey}:`, error);
        return null;
    }
}

/**
 * Save result to cache
 */
async function setCachedResult<T>(
    cacheKey: string,
    data: T,
    ttl: number = DEFAULT_CACHE_TTL_MS
): Promise<void> {
    try {
        const key = `${CACHE_PREFIX}${cacheKey}`;
        const cached: CachedResult<T> = {
            data,
            timestamp: Date.now(),
            ttl,
        };
        await AsyncStorage.setItem(key, JSON.stringify(cached));
        log.debug(`Cached result for ${cacheKey}`);
    } catch (error) {
        log.warn(`Failed to cache result for ${cacheKey}:`, error);
    }
}

/**
 * Invoke a Supabase Edge Function with retry and cache fallback
 * 
 * This function:
 * 1. Tries to call the Edge Function with retry + exponential backoff
 * 2. If successful, caches the result (if cacheKey provided)
 * 3. If all retries fail, tries to return cached result
 * 4. If no cache, calls cacheFallback() if provided
 * 5. If silentFail is true, returns error result instead of throwing
 */
export async function invokeEdgeFunction<T>(
    options: EdgeFunctionOptions<T>
): Promise<EdgeFunctionResult<T>> {
    const {
        functionName,
        body,
        headers,
        cacheKey,
        cacheTTL = DEFAULT_CACHE_TTL_MS,
        cacheFallback,
        maxRetries = 3,
        baseDelayMs = 1000,
        silentFail = true,
    } = options;

    log.info(`Invoking Edge Function: ${functionName}`);

    try {
        // Try to call the Edge Function with retry
        const { data, error } = await retryWithBackoff(
            () => supabase.functions.invoke<T>(functionName, { body, headers }),
            {
                maxRetries,
                baseDelayMs,
                onRetry: (attempt, err) => {
                    log.warn(`Retry attempt ${attempt} for ${functionName}`, err);
                },
            }
        );

        // Handle Edge Function error response
        if (error) {
            throw error;
        }

        // Success! Cache the result if cacheKey provided
        if (cacheKey && data) {
            await setCachedResult(cacheKey, data, cacheTTL);
        }

        log.info(`Edge Function ${functionName} succeeded`);
        return {
            success: true,
            data,
            fromCache: false,
        };

    } catch (error) {
        log.error(`Edge Function ${functionName} failed after retries:`, error);

        // Try cache fallback
        if (cacheKey) {
            const cachedData = await getCachedResult<T>(cacheKey);
            if (cachedData) {
                log.info(`Using cached result for ${functionName}`);
                return {
                    success: true,
                    data: cachedData,
                    fromCache: true,
                };
            }
        }

        // Try custom fallback function
        if (cacheFallback) {
            try {
                const fallbackData = await cacheFallback();
                if (fallbackData) {
                    log.info(`Using fallback for ${functionName}`);
                    return {
                        success: true,
                        data: fallbackData,
                        fromCache: true,
                    };
                }
            } catch (fallbackError) {
                log.error(`Fallback failed for ${functionName}:`, fallbackError);
            }
        }

        // No fallback available
        if (silentFail) {
            log.warn(`Edge Function ${functionName} failed silently, returning null`);
            return {
                success: false,
                data: null,
                error: error instanceof Error ? error.message : String(error),
                fromCache: false,
            };
        }

        // Throw if not silent
        throw error;
    }
}

/**
 * Clear cached Edge Function results
 */
export async function clearEdgeFunctionCache(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
        if (cacheKeys.length > 0) {
            await AsyncStorage.multiRemove(cacheKeys);
            log.info(`Cleared ${cacheKeys.length} cached Edge Function results`);
        }
    } catch (error) {
        log.error('Failed to clear Edge Function cache:', error);
    }
}

/**
 * Retry Utility
 * 
 * Provides retry logic with exponential backoff for transient network errors.
 */

import { createLogger } from '@/utils/logger';

const log = createLogger('Retry');

/**
 * Check if an error is a transient network error that should be retried
 */
export function isTransientError(error: unknown): boolean {
    if (!error) return false;

    const errorStr = String(error).toLowerCase();
    const errorName = (error as Error)?.name?.toLowerCase() || '';

    // Common transient error patterns
    const transientPatterns = [
        'network',
        'fetch',
        'timeout',
        'econnreset',
        'econnrefused',
        'socket',
        'failed to send',
        'connection',
        'temporarily unavailable',
    ];

    return transientPatterns.some(
        pattern => errorStr.includes(pattern) || errorName.includes(pattern)
    );
}

/**
 * Delay for specified milliseconds
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelayMs = 1000,
        onRetry
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // If not a transient error, fail immediately
            if (!isTransientError(error)) {
                log.warn('Non-transient error, not retrying', error);
                throw error;
            }

            // If we've exhausted retries, fail
            if (attempt === maxRetries) {
                log.error(`All ${maxRetries + 1} attempts failed`, error);
                throw error;
            }

            // Calculate delay with exponential backoff
            const delayMs = baseDelayMs * Math.pow(2, attempt);
            log.info(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);

            if (onRetry) {
                onRetry(attempt + 1, error);
            }

            await delay(delayMs);
        }
    }

    throw lastError;
}

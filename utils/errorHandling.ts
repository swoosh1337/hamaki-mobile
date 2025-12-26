/**
 * Utility functions for error handling and network error detection
 */

import { createLogger } from './logger';

const log = createLogger('ErrorHandling');

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Common network error patterns
  const networkPatterns = [
    'network',
    'fetch',
    'failed',
    'timeout',
    'connection',
    'offline',
    'unreachable',
    'econnrefused',
    'enotfound',
    'etimedout',
  ];

  return networkPatterns.some(pattern => lowerMessage.includes(pattern));
}

export function getErrorMessage(error: unknown, defaultMessage = 'An error occurred'): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return defaultMessage;
}

export function getUserFriendlyErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Unable to connect. Please check your internet connection.';
  }

  const message = getErrorMessage(error);

  // Map technical errors to user-friendly messages
  if (message.includes('unauthorized') || message.includes('401')) {
    return 'You need to sign in to access this feature.';
  }

  if (message.includes('forbidden') || message.includes('403')) {
    return 'You don\'t have permission to access this.';
  }

  if (message.includes('not found') || message.includes('404')) {
    return 'The requested content was not found.';
  }

  if (message.includes('server') || message.includes('500')) {
    return 'Server error. Please try again later.';
  }

  return message;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.info(`Retry attempt ${attempt + 1} after ${delay}ms`, { attempt: attempt + 1, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

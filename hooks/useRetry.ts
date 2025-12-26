import { createLogger } from '@/utils/logger';
import { useCallback, useState } from 'react';

const log = createLogger('UseRetry');

interface UseRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
}

export function useRetry<T>(
  asyncFunction: () => Promise<T>,
  options: UseRetryOptions = {}
) {
  const { maxRetries = 3, retryDelay = 1000, onError } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (): Promise<T | null> => {
    setIsRetrying(true);
    setError(null);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await asyncFunction();
        setRetryCount(0);
        setIsRetrying(false);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');
        log.warn(`Attempt ${attempt + 1} failed`, { error: lastError.message });

        if (attempt < maxRetries) {
          setRetryCount(attempt + 1);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    setError(lastError);
    setIsRetrying(false);
    setRetryCount(0);

    if (lastError && onError) {
      onError(lastError);
    }

    return null;
  }, [asyncFunction, maxRetries, retryDelay, onError]);

  const reset = useCallback(() => {
    setIsRetrying(false);
    setRetryCount(0);
    setError(null);
  }, []);

  return {
    execute,
    isRetrying,
    retryCount,
    error,
    reset,
  };
}

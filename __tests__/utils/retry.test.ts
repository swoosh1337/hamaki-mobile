/**
 * Retry Utility Tests
 */

import { isTransientError, retryWithBackoff } from '@/utils/retry';

describe('Retry Utility', () => {
    describe('isTransientError', () => {
        it('should return true for network errors', () => {
            expect(isTransientError(new Error('Network request failed'))).toBe(true);
            expect(isTransientError(new Error('Failed to send a request'))).toBe(true);
            expect(isTransientError(new Error('Connection refused'))).toBe(true);
            expect(isTransientError(new Error('Socket timeout'))).toBe(true);
        });

        it('should return false for non-transient errors', () => {
            expect(isTransientError(new Error('Invalid JSON'))).toBe(false);
            expect(isTransientError(new Error('Missing required field'))).toBe(false);
            expect(isTransientError(null)).toBe(false);
        });
    });

    describe('retryWithBackoff', () => {
        it('should return result on first success', async () => {
            const fn = jest.fn().mockResolvedValue('success');
            const result = await retryWithBackoff(fn);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry on transient error', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Network failed'))
                .mockResolvedValue('success');

            const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 });

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should not retry on non-transient error', async () => {
            const fn = jest.fn().mockRejectedValue(new Error('Invalid data'));

            await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toThrow('Invalid data');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should fail after max retries', async () => {
            const fn = jest.fn().mockRejectedValue(new Error('Network failed'));

            await expect(
                retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 })
            ).rejects.toThrow('Network failed');
            expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        it('should call onRetry callback', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Network failed'))
                .mockResolvedValue('success');
            const onRetry = jest.fn();

            await retryWithBackoff(fn, {
                maxRetries: 3,
                baseDelayMs: 10,
                onRetry
            });

            expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
        });
    });
});

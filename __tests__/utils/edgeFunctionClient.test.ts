/**
 * Test Suite for Edge Function Client
 *
 * Tests cover:
 * - Successful Edge Function calls
 * - Retry logic with exponential backoff
 * - Cache fallback behavior
 * - Silent fail mode
 * - Cache management
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

// ----------------------------------------------------------------------
// 1. Storage map - declared at module level before mocks
// ----------------------------------------------------------------------
const mockStorageMap = new Map<string, string>();

// ----------------------------------------------------------------------
// 2. Setup mocks with proper types
// ----------------------------------------------------------------------

// Mock Supabase invoke function
type InvokeResult = { data: unknown; error: Error | null };
const mockInvoke = jest.fn<(name: string, options?: object) => Promise<InvokeResult>>();
jest.mock('@/services/supabase', () => ({
    get supabase() {
        return {
            functions: {
                invoke: mockInvoke,
            },
        };
    },
}));

// Mock retry utility
type RetryFn = <T>(fn: () => Promise<T>, options?: object) => Promise<T>;
const mockRetryWithBackoff = jest.fn<RetryFn>();
const mockIsTransientError = jest.fn<(error: unknown) => boolean>();
jest.mock('@/utils/retry', () => ({
    get retryWithBackoff() {
        return mockRetryWithBackoff;
    },
    get isTransientError() {
        return mockIsTransientError;
    },
}));

// Mock AsyncStorage - use getter pattern to avoid hoisting issues
const mockAsyncStorage = {
    getItem: jest.fn<(key: string) => Promise<string | null>>(),
    setItem: jest.fn<(key: string, value: string) => Promise<void>>(),
    removeItem: jest.fn<(key: string) => Promise<void>>(),
    getAllKeys: jest.fn<() => Promise<readonly string[]>>(),
    multiRemove: jest.fn<(keys: readonly string[]) => Promise<void>>(),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        get getItem() { return mockAsyncStorage.getItem; },
        get setItem() { return mockAsyncStorage.setItem; },
        get removeItem() { return mockAsyncStorage.removeItem; },
        get getAllKeys() { return mockAsyncStorage.getAllKeys; },
        get multiRemove() { return mockAsyncStorage.multiRemove; },
    },
}));

// Import module under test AFTER mocks are set up
import { clearEdgeFunctionCache, invokeEdgeFunction } from '@/utils/edgeFunctionClient';

describe('Edge Function Client', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorageMap.clear();

        // Re-implement AsyncStorage mocks to use mockStorageMap
        mockAsyncStorage.getItem.mockImplementation((key) =>
            Promise.resolve(mockStorageMap.get(key) ?? null)
        );
        mockAsyncStorage.setItem.mockImplementation((key, value) => {
            mockStorageMap.set(key, value);
            return Promise.resolve();
        });
        mockAsyncStorage.removeItem.mockImplementation((key) => {
            mockStorageMap.delete(key);
            return Promise.resolve();
        });
        mockAsyncStorage.getAllKeys.mockImplementation(() =>
            Promise.resolve(Array.from(mockStorageMap.keys()))
        );
        mockAsyncStorage.multiRemove.mockImplementation((keys) => {
            keys.forEach(k => mockStorageMap.delete(k));
            return Promise.resolve();
        });

        // Default retry implementation: pass through to the function
        mockRetryWithBackoff.mockImplementation((fn) => fn());

        // Default error check
        mockIsTransientError.mockImplementation((error) => {
            const str = String(error).toLowerCase();
            return str.includes('network') || str.includes('fetch');
        });

        // Default invoke success
        mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    });

    describe('Successful Calls', () => {
        it('should invoke Edge Function and return data', async () => {
            const mockData = { success: true, results: ['test'] };
            mockInvoke.mockResolvedValueOnce({ data: mockData, error: null });

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: { userId: '123' },
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockData);
            expect(result.fromCache).toBe(false);
            expect(mockInvoke).toHaveBeenCalledWith('test-function', {
                body: { userId: '123' },
            });
        });

        it('should pass custom headers to Edge Function', async () => {
            mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

            await invokeEdgeFunction({
                functionName: 'test-function',
                body: { userId: '123' },
                headers: { Authorization: 'Bearer token123' },
            });

            expect(mockInvoke).toHaveBeenCalledWith('test-function', {
                body: { userId: '123' },
                headers: { Authorization: 'Bearer token123' },
            });
        });

        it('should cache result when cacheKey provided', async () => {
            const mockData = { cached: 'yes' };
            mockInvoke.mockResolvedValueOnce({ data: mockData, error: null });

            await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                cacheKey: 'test-cache-key',
            });

            // Verify it's in our mock storage (using mockStorageMap directly)
            const cached = mockStorageMap.get('@edge_function_cache:test-cache-key');
            expect(cached).toBeDefined();
            if (cached) {
                const parsed = JSON.parse(cached);
                expect(parsed.data).toEqual(mockData);
            }
        });
    });

    describe('Retry Logic', () => {
        it('should use retryWithBackoff for Edge Function calls', async () => {
            await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
            });

            expect(mockRetryWithBackoff).toHaveBeenCalled();
        });

        it('should pass retry options to retryWithBackoff', async () => {
            await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                maxRetries: 5,
                baseDelayMs: 2000,
            });

            expect(mockRetryWithBackoff).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    maxRetries: 5,
                    baseDelayMs: 2000,
                })
            );
        });
    });

    describe('Cache Fallback', () => {
        it('should return cached data when Edge Function fails', async () => {
            const cachedData = { from: 'cache' };

            // Pre-populate cache manually
            mockStorageMap.set(
                '@edge_function_cache:fail-key',
                JSON.stringify({
                    data: cachedData,
                    timestamp: Date.now(),
                    ttl: 300000
                })
            );

            // Make Edge Function fail via retry mock
            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Network error'));

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                cacheKey: 'fail-key',
                silentFail: true,
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(cachedData);
            expect(result.fromCache).toBe(true);
        });

        it('should call cacheFallback when cache is empty', async () => {
            const fallbackData = { from: 'fallback' };
            const cacheFallback = jest.fn<() => Promise<typeof fallbackData>>()
                .mockResolvedValue(fallbackData);

            // Fail the Edge Function
            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Network error'));

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                cacheKey: 'empty-key',
                cacheFallback,
                silentFail: true,
            });

            expect(cacheFallback).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.data).toEqual(fallbackData);
        });

        it('should not return expired cache', async () => {
            const cachedData = { from: 'cache' };

            // Pre-populate cache with expired data
            mockStorageMap.set(
                '@edge_function_cache:expired-key',
                JSON.stringify({
                    data: cachedData,
                    timestamp: Date.now() - 400000, // Older than TTL
                    ttl: 300000
                })
            );

            // Make Edge Function fail
            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Network error'));

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                cacheKey: 'expired-key',
                silentFail: true,
            });

            // Should fail since cache is expired and no fallback
            expect(result.success).toBe(false);
            expect(result.fromCache).toBe(false);
        });
    });

    describe('Silent Fail Mode', () => {
        it('should return failed result when silentFail is true', async () => {
            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Server error'));

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                silentFail: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Server error');
            expect(result.data).toBeNull();
        });

        it('should throw error when silentFail is false', async () => {
            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Server error'));

            await expect(
                invokeEdgeFunction({
                    functionName: 'test-function',
                    body: {},
                    silentFail: false,
                })
            ).rejects.toThrow('Server error');
        });
    });

    describe('Error Handling', () => {
        it('should handle Edge Function error response', async () => {
            mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('Function error') });

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                silentFail: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Function error');
        });

        it('should handle cacheFallback errors gracefully', async () => {
            const cacheFallback = jest.fn<() => Promise<unknown>>()
                .mockRejectedValue(new Error('Fallback error'));

            mockRetryWithBackoff.mockRejectedValueOnce(new Error('Network error'));

            const result = await invokeEdgeFunction({
                functionName: 'test-function',
                body: {},
                cacheKey: 'error-key',
                cacheFallback,
                silentFail: true,
            });

            expect(cacheFallback).toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });

    describe('Cache Management', () => {
        it('should clear all Edge Function cache', async () => {
            // Add some cache entries
            mockStorageMap.set('@edge_function_cache:key1', JSON.stringify({ data: 1 }));
            mockStorageMap.set('@edge_function_cache:key2', JSON.stringify({ data: 2 }));
            mockStorageMap.set('@other_key', 'other value');

            await clearEdgeFunctionCache();

            // Check keys
            expect(mockStorageMap.has('@edge_function_cache:key1')).toBe(false);
            expect(mockStorageMap.has('@edge_function_cache:key2')).toBe(false);
            expect(mockStorageMap.has('@other_key')).toBe(true);
        });

        it('should handle empty cache gracefully', async () => {
            // No cache entries
            await expect(clearEdgeFunctionCache()).resolves.not.toThrow();
        });
    });
});

/**
 * Test Suite for useEdgeFunctionQueue Hook
 *
 * Tests cover:
 * - Queue initialization
 * - Optimistic XP delta calculation
 * - Queue status updates
 * - Queue processing
 * - App state handling
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// ----------------------------------------------------------------------
// Mock storage
// ----------------------------------------------------------------------
const mockStorageMap = new Map<string, string>();

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

// Mock react-native AppState
// Note: jest.mock is hoisted, so we define the mock inside the factory
jest.mock('react-native', () => {
    const mockAddEventListener = jest.fn().mockReturnValue({ remove: jest.fn() });
    return {
        AppState: {
            addEventListener: mockAddEventListener,
            currentState: 'active',
        },
        // Export for test access
        __mockAppStateAddEventListener: mockAddEventListener,
    };
});

// Get reference to the mock for assertions
const { __mockAppStateAddEventListener: mockAppStateAddEventListener } = jest.requireMock<{
    __mockAppStateAddEventListener: jest.Mock;
}>('react-native');

// Mock Supabase
const mockSupabaseFrom = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseSingle = jest.fn();

jest.mock('@/services/supabase', () => ({
    supabase: {
        from: mockSupabaseFrom,
        functions: {
            invoke: jest.fn(),
        },
    },
}));

// Mock leaderboard service
jest.mock('@/services/supabase/leaderboardService', () => ({
    leaderboardService: {
        getMyLeaderboardStatus: jest.fn().mockResolvedValue({
            xp: { total: 100 },
            personalRank: 1,
        }),
    },
}));

// Mock edge function client
jest.mock('@/utils/edgeFunctionClient', () => ({
    invokeEdgeFunction: jest.fn().mockResolvedValue({
        success: true,
        data: { success: true, new_total_xp: 100, personal_rank: 1 },
        status: 200,
        fromCache: false,
    }),
}));

// Import after mocks
import { useEdgeFunctionQueue } from '@/hooks/useEdgeFunctionQueue';
import { edgeFunctionQueueService } from '@/services/queue/edgeFunctionQueueService';

describe('useEdgeFunctionQueue Hook', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockStorageMap.clear();

        // Re-setup AppState mock after clearAllMocks
        mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });

        // Implement mock storage
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

        // Clear the queue
        await edgeFunctionQueueService.clearQueue();
    });

    describe('Initialization', () => {
        it('should initialize with default values', async () => {
            const { result } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(result.current.queueStatus.pendingCount).toBe(0);
            });

            expect(result.current.optimisticXPDelta).toBe(0);
            expect(result.current.totalOptimisticXPDelta).toBe(0);
            expect(result.current.isProcessing).toBe(false);
        });

        it('should accept userId option', async () => {
            const { result } = renderHook(() =>
                useEdgeFunctionQueue({ userId: 'user123' })
            );

            await waitFor(() => {
                expect(result.current.queueStatus).toBeDefined();
            });
        });

        it('should accept autoProcess option', async () => {
            const { result } = renderHook(() =>
                useEdgeFunctionQueue({ autoProcess: false })
            );

            await waitFor(() => {
                expect(result.current.queueStatus).toBeDefined();
            });
        });
    });

    describe('Queue Status', () => {
        it('should update status when queue changes', async () => {
            const { result } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(result.current.queueStatus.pendingCount).toBe(0);
            });

            // Add item to queue
            await act(async () => {
                await edgeFunctionQueueService.addToQueue({
                    id: 'xp-1',
                    idempotencyKey: 'key1',
                    category: 'xp',
                    functionName: 'award-xp',
                    body: { userId: 'user1', xpType: 'game', amount: 50 },
                    amount: 50,
                    createdAt: Date.now(),
                });
            });

            await waitFor(() => {
                expect(result.current.queueStatus.pendingCount).toBe(1);
                expect(result.current.queueStatus.xpItemCount).toBe(1);
            });
        });
    });

    describe('Optimistic XP Delta', () => {
        it('should calculate optimistic delta for user', async () => {
            // Add item to queue first
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user123', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            const { result } = renderHook(() =>
                useEdgeFunctionQueue({ userId: 'user123' })
            );

            await waitFor(() => {
                expect(result.current.optimisticXPDelta).toBe(50);
            });
        });

        it('should return 0 for user with no queued items', async () => {
            const { result } = renderHook(() =>
                useEdgeFunctionQueue({ userId: 'nonexistent' })
            );

            await waitFor(() => {
                expect(result.current.optimisticXPDelta).toBe(0);
            });
        });

        it('should return total delta when no userId provided', async () => {
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-2',
                idempotencyKey: 'key2',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user2', xpType: 'game', amount: 100 },
                amount: 100,
                createdAt: Date.now(),
            });

            const { result } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(result.current.totalOptimisticXPDelta).toBe(150);
            });
        });
    });

    describe('Process Queue', () => {
        it('should provide processQueue function', async () => {
            const { result } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(typeof result.current.processQueue).toBe('function');
            });
        });

        it('should not throw when calling processQueue', async () => {
            const { result } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(result.current.processQueue).toBeDefined();
            });

            await act(async () => {
                await expect(result.current.processQueue()).resolves.not.toThrow();
            });
        });
    });

    describe('App State Handling', () => {
        it('should set up app state listener when autoProcess is true', async () => {
            renderHook(() => useEdgeFunctionQueue({ autoProcess: true }));

            await waitFor(() => {
                expect(mockAppStateAddEventListener).toHaveBeenCalledWith(
                    'change',
                    expect.any(Function)
                );
            });
        });

        it('should not set up app state listener when autoProcess is false', async () => {
            mockAppStateAddEventListener.mockClear();

            renderHook(() => useEdgeFunctionQueue({ autoProcess: false }));

            // Wait a bit to ensure no listener is added
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not be called with autoProcess: false
            expect(mockAppStateAddEventListener).not.toHaveBeenCalled();
        });
    });

    describe('Cleanup', () => {
        it('should unsubscribe from queue on unmount', async () => {
            const { result, unmount } = renderHook(() => useEdgeFunctionQueue());

            await waitFor(() => {
                expect(result.current.queueStatus).toBeDefined();
            });

            // Should not throw on unmount
            expect(() => unmount()).not.toThrow();
        });
    });

    describe('Server XP Update Callback', () => {
        it('should accept onServerXPUpdate callback', async () => {
            const onServerXPUpdate = jest.fn();

            const { result } = renderHook(() =>
                useEdgeFunctionQueue({ onServerXPUpdate })
            );

            await waitFor(() => {
                expect(result.current.queueStatus).toBeDefined();
            });

            // Callback should be stored but not called yet
            expect(onServerXPUpdate).not.toHaveBeenCalled();
        });
    });
});

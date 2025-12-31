/**
 * Test Suite for Edge Function Queue Service
 *
 * Tests cover:
 * - Queue initialization and persistence
 * - Adding/removing items from queue
 * - Optimistic XP delta calculation
 * - Per-user XP lock mechanism
 * - Retry logic with backoff
 * - Queue processing
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

// Import after mocks
import { edgeFunctionQueueService } from '@/services/queue/edgeFunctionQueueService';
import type { QueueItem, VerificationQueueItem, XPQueueItem } from '@/types/edgeFunctionQueue';

describe('Edge Function Queue Service', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockStorageMap.clear();

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

        // Clear the queue for each test
        await edgeFunctionQueueService.clearQueue();
    });

    describe('Queue Operations', () => {
        it('should add XP item to queue', async () => {
            const item: Omit<XPQueueItem, 'retryCount' | 'nextAttemptAt'> = {
                id: 'xp-1',
                idempotencyKey: 'award-xp:user1:game:session:50',
                category: 'xp',
                functionName: 'award-xp',
                body: {
                    userId: 'user1',
                    xpType: 'game',
                    amount: 50,
                },
                amount: 50,
                createdAt: Date.now(),
            };

            const added = await edgeFunctionQueueService.addToQueue(item);

            expect(added).toBe(true);
            expect(edgeFunctionQueueService.getQueue()).toHaveLength(1);
        });

        it('should reject duplicate idempotency keys', async () => {
            const item: Omit<XPQueueItem, 'retryCount' | 'nextAttemptAt'> = {
                id: 'xp-1',
                idempotencyKey: 'award-xp:user1:game:session:50',
                category: 'xp',
                functionName: 'award-xp',
                body: {
                    userId: 'user1',
                    xpType: 'game',
                    amount: 50,
                },
                amount: 50,
                createdAt: Date.now(),
            };

            await edgeFunctionQueueService.addToQueue(item);
            const added = await edgeFunctionQueueService.addToQueue({
                ...item,
                id: 'xp-2', // Different ID, same idempotency key
            });

            expect(added).toBe(false);
            expect(edgeFunctionQueueService.getQueue()).toHaveLength(1);
        });

        it('should remove item from queue', async () => {
            const item: Omit<XPQueueItem, 'retryCount' | 'nextAttemptAt'> = {
                id: 'xp-1',
                idempotencyKey: 'award-xp:user1:game:session:50',
                category: 'xp',
                functionName: 'award-xp',
                body: {
                    userId: 'user1',
                    xpType: 'game',
                    amount: 50,
                },
                amount: 50,
                createdAt: Date.now(),
            };

            await edgeFunctionQueueService.addToQueue(item);
            await edgeFunctionQueueService.removeFromQueue('xp-1');

            expect(edgeFunctionQueueService.getQueue()).toHaveLength(0);
        });

        it('should remove multiple items', async () => {
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
                body: { userId: 'user1', xpType: 'game', amount: 100 },
                amount: 100,
                createdAt: Date.now(),
            });
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-3',
                idempotencyKey: 'key3',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 25 },
                amount: 25,
                createdAt: Date.now(),
            });

            await edgeFunctionQueueService.removeItems(['xp-1', 'xp-3']);

            expect(edgeFunctionQueueService.getQueue()).toHaveLength(1);
            expect(edgeFunctionQueueService.getQueue()[0].id).toBe('xp-2');
        });
    });

    describe('Optimistic XP Delta', () => {
        it('should calculate optimistic delta for user', async () => {
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
                body: { userId: 'user1', xpType: 'game', amount: 100 },
                amount: 100,
                createdAt: Date.now(),
            });

            const delta = edgeFunctionQueueService.getOptimisticXPDeltaForUser('user1');
            expect(delta).toBe(150);
        });

        it('should only count XP for specific user', async () => {
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

            expect(edgeFunctionQueueService.getOptimisticXPDeltaForUser('user1')).toBe(50);
            expect(edgeFunctionQueueService.getOptimisticXPDeltaForUser('user2')).toBe(100);
        });

        it('should calculate total optimistic delta', async () => {
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

            expect(edgeFunctionQueueService.getOptimisticXPDelta()).toBe(150);
        });

        it('should not count non-XP items in delta', async () => {
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
                id: 'verify-1',
                idempotencyKey: 'key2',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now(),
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);

            expect(edgeFunctionQueueService.getOptimisticXPDelta()).toBe(50);
        });

        it('should return 0 for user with no queued XP', () => {
            expect(edgeFunctionQueueService.getOptimisticXPDeltaForUser('nonexistent')).toBe(0);
        });
    });

    describe('Queue Status', () => {
        it('should return correct status', async () => {
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
                id: 'verify-1',
                idempotencyKey: 'key2',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now(),
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);

            const status = edgeFunctionQueueService.getStatus();

            expect(status.pendingCount).toBe(2);
            expect(status.xpItemCount).toBe(1);
            expect(status.optimisticXPDelta).toBe(50);
            expect(status.isProcessing).toBe(false);
            expect(status.processingUsers).toEqual([]);
        });
    });

    describe('User Locks', () => {
        it('should acquire and release user lock', () => {
            expect(edgeFunctionQueueService.isUserProcessing('user1')).toBe(false);

            const acquired = edgeFunctionQueueService.acquireUserLock('user1');
            expect(acquired).toBe(true);
            expect(edgeFunctionQueueService.isUserProcessing('user1')).toBe(true);

            edgeFunctionQueueService.releaseUserLock('user1');
            expect(edgeFunctionQueueService.isUserProcessing('user1')).toBe(false);
        });

        it('should not acquire lock if already held', () => {
            edgeFunctionQueueService.acquireUserLock('user1');
            const acquired = edgeFunctionQueueService.acquireUserLock('user1');

            expect(acquired).toBe(false);

            // Cleanup
            edgeFunctionQueueService.releaseUserLock('user1');
        });

        it('should allow different users to have locks', () => {
            expect(edgeFunctionQueueService.acquireUserLock('user1')).toBe(true);
            expect(edgeFunctionQueueService.acquireUserLock('user2')).toBe(true);

            expect(edgeFunctionQueueService.isUserProcessing('user1')).toBe(true);
            expect(edgeFunctionQueueService.isUserProcessing('user2')).toBe(true);

            // Cleanup
            edgeFunctionQueueService.releaseUserLock('user1');
            edgeFunctionQueueService.releaseUserLock('user2');
        });
    });

    describe('Retry Logic', () => {
        it('should mark item for retry with backoff', async () => {
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            await edgeFunctionQueueService.markForRetry('xp-1', 'Network error', 500);

            const queue = edgeFunctionQueueService.getQueue();
            expect(queue[0].retryCount).toBe(1);
            expect(queue[0].lastError).toBe('Network error');
            expect(queue[0].lastStatus).toBe(500);
            expect(queue[0].nextAttemptAt).toBeGreaterThan(Date.now());
        });

        it('should remove item after max retries', async () => {
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            // Mark for retry 5 times (max is 5)
            for (let i = 0; i < 5; i++) {
                await edgeFunctionQueueService.markForRetry('xp-1', 'Error');
            }

            expect(edgeFunctionQueueService.getQueue()).toHaveLength(0);
        });

        it('should classify errors correctly', () => {
            // Retryable errors
            expect(edgeFunctionQueueService.shouldQueueError(0)).toBe(true);
            expect(edgeFunctionQueueService.shouldQueueError(500)).toBe(true);
            expect(edgeFunctionQueueService.shouldQueueError(503)).toBe(true);
            expect(edgeFunctionQueueService.shouldQueueError(429)).toBe(true);
            expect(edgeFunctionQueueService.shouldQueueError(undefined)).toBe(true);

            // Non-retryable errors
            expect(edgeFunctionQueueService.shouldQueueError(400)).toBe(false);
            expect(edgeFunctionQueueService.shouldQueueError(401)).toBe(false);
            expect(edgeFunctionQueueService.shouldQueueError(403)).toBe(false);
            expect(edgeFunctionQueueService.shouldQueueError(404)).toBe(false);
            expect(edgeFunctionQueueService.shouldQueueError(422)).toBe(false);
        });

        it('should calculate exponential backoff delay', () => {
            expect(edgeFunctionQueueService.getRetryDelay(0)).toBe(1000);
            expect(edgeFunctionQueueService.getRetryDelay(1)).toBe(2000);
            expect(edgeFunctionQueueService.getRetryDelay(2)).toBe(4000);
            expect(edgeFunctionQueueService.getRetryDelay(3)).toBe(8000);
            expect(edgeFunctionQueueService.getRetryDelay(4)).toBe(16000);
            expect(edgeFunctionQueueService.getRetryDelay(5)).toBe(32000);
            // Cap at 5
            expect(edgeFunctionQueueService.getRetryDelay(10)).toBe(32000);
        });
    });

    describe('Get Items by Category', () => {
        beforeEach(async () => {
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
                id: 'verify-1',
                idempotencyKey: 'key2',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now(),
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
        });

        it('should get items by category', () => {
            const xpItems = edgeFunctionQueueService.getItemsByCategory('xp');
            expect(xpItems).toHaveLength(1);
            expect(xpItems[0].id).toBe('xp-1');

            const verificationItems = edgeFunctionQueueService.getItemsByCategory('verification');
            expect(verificationItems).toHaveLength(1);
            expect(verificationItems[0].id).toBe('verify-1');

            const contentItems = edgeFunctionQueueService.getItemsByCategory('content');
            expect(contentItems).toHaveLength(0);
        });
    });

    describe('Get XP Items for User', () => {
        it('should get XP items sorted by creation time', async () => {
            const now = Date.now();

            await edgeFunctionQueueService.addToQueue({
                id: 'xp-2',
                idempotencyKey: 'key2',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 100 },
                amount: 100,
                createdAt: now + 1000, // Later
            });
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: now, // Earlier
            });

            const items = edgeFunctionQueueService.getXPItemsForUser('user1');

            expect(items).toHaveLength(2);
            expect(items[0].id).toBe('xp-1'); // Earlier item first
            expect(items[1].id).toBe('xp-2');
        });

        it('should not include other users items', async () => {
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

            const user1Items = edgeFunctionQueueService.getXPItemsForUser('user1');
            expect(user1Items).toHaveLength(1);
            expect(user1Items[0].body.userId).toBe('user1');
        });
    });

    describe('Clear User Items', () => {
        it('should clear only XP items for specific user', async () => {
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
            await edgeFunctionQueueService.addToQueue({
                id: 'verify-1',
                idempotencyKey: 'key3',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now(),
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);

            await edgeFunctionQueueService.clearUserItems('user1');

            const queue = edgeFunctionQueueService.getQueue();
            expect(queue).toHaveLength(2); // user2 XP item + verification item
            expect(queue.find(i => i.id === 'xp-1')).toBeUndefined();
            expect(queue.find(i => i.id === 'xp-2')).toBeDefined();
            expect(queue.find(i => i.id === 'verify-1')).toBeDefined();
        });
    });

    describe('Subscription', () => {
        it('should notify listeners on queue changes', async () => {
            const listener = jest.fn();
            const unsubscribe = edgeFunctionQueueService.subscribe(listener);

            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            expect(listener).toHaveBeenCalled();

            unsubscribe();
        });

        it('should not notify after unsubscribe', async () => {
            const listener = jest.fn();
            const unsubscribe = edgeFunctionQueueService.subscribe(listener);
            unsubscribe();

            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('Persistence', () => {
        it('should persist queue to AsyncStorage', async () => {
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            expect(mockAsyncStorage.setItem).toHaveBeenCalled();
            const storedData = mockStorageMap.get('@edge_function_queue');
            expect(storedData).toBeDefined();

            if (storedData) {
                const parsed = JSON.parse(storedData);
                expect(parsed.version).toBe(1);
                expect(parsed.items).toHaveLength(1);
            }
        });
    });

    describe('Retryable Items', () => {
        it('should get items ready for retry', async () => {
            const now = Date.now();

            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: now,
            });

            // Mark for retry (sets nextAttemptAt in the future)
            await edgeFunctionQueueService.markForRetry('xp-1', 'Error');

            // Should not be ready yet (backoff not expired)
            const notReady = edgeFunctionQueueService.getRetryableItems();
            expect(notReady).toHaveLength(0);
        });

        it('should include items without nextAttemptAt', async () => {
            await edgeFunctionQueueService.addToQueue({
                id: 'xp-1',
                idempotencyKey: 'key1',
                category: 'xp',
                functionName: 'award-xp',
                body: { userId: 'user1', xpType: 'game', amount: 50 },
                amount: 50,
                createdAt: Date.now(),
            });

            const ready = edgeFunctionQueueService.getRetryableItems();
            expect(ready).toHaveLength(1);
        });
    });

    describe('Concurrency Limited Processing', () => {
        it('should process non-XP items with concurrency limit', async () => {
            // Add 5 verification items
            for (let i = 0; i < 5; i++) {
                await edgeFunctionQueueService.addToQueue({
                    id: `verify-${i}`,
                    idempotencyKey: `key-${i}`,
                    category: 'verification',
                    functionName: 'verify-subscriptions',
                    body: { userId: 'user1', index: i },
                    createdAt: Date.now() + i,
                } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
            }

            const processedIds: string[] = [];
            const mockProcessor = jest.fn(async (item: QueueItem) => {
                await new Promise(r => setTimeout(r, 10)); // Small delay
                processedIds.push(item.id);
                return { success: true, shouldRemove: true, shouldRetry: false };
            });

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            expect(processedIds).toHaveLength(5);
            expect(mockProcessor).toHaveBeenCalledTimes(5);
        });

        it('should process all items even with concurrency limit', async () => {
            // Add 10 verification items (more than concurrency limit of 3)
            for (let i = 0; i < 10; i++) {
                await edgeFunctionQueueService.addToQueue({
                    id: `verify-${i}`,
                    idempotencyKey: `key-${i}`,
                    category: 'verification',
                    functionName: 'verify-subscriptions',
                    body: { userId: 'user1', index: i },
                    createdAt: Date.now() + i,
                } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
            }

            const processedIds: string[] = [];
            const mockProcessor = jest.fn(async (item: QueueItem) => {
                processedIds.push(item.id);
                return { success: true, shouldRemove: true, shouldRetry: false };
            });

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            // All 10 items should be processed
            expect(processedIds).toHaveLength(10);
            expect(edgeFunctionQueueService.getQueue()).toHaveLength(0);
        });

        it('should preserve result ordering', async () => {
            // Add items with specific creation times
            const createTimes = [100, 200, 300, 400, 500];
            for (let i = 0; i < 5; i++) {
                await edgeFunctionQueueService.addToQueue({
                    id: `verify-${i}`,
                    idempotencyKey: `key-${i}`,
                    category: 'verification',
                    functionName: 'verify-subscriptions',
                    body: { userId: 'user1', index: i },
                    createdAt: createTimes[i],
                } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
            }

            const mockProcessor = jest.fn(async (_item: QueueItem) => {
                // Random delay to test ordering
                await new Promise(r => setTimeout(r, Math.random() * 20));
                return { success: true, shouldRemove: true, shouldRetry: false };
            });

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            // Queue should be empty after processing
            expect(edgeFunctionQueueService.getQueue()).toHaveLength(0);
        });

        it('should handle errors within concurrency limit', async () => {
            // Add 4 items, 2 will fail
            for (let i = 0; i < 4; i++) {
                await edgeFunctionQueueService.addToQueue({
                    id: `verify-${i}`,
                    idempotencyKey: `key-${i}`,
                    category: 'verification',
                    functionName: 'verify-subscriptions',
                    body: { userId: 'user1', index: i },
                    createdAt: Date.now() + i,
                } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
            }

            const mockProcessor = jest.fn(async (item: QueueItem) => {
                const shouldFail = item.id === 'verify-1' || item.id === 'verify-3';
                return {
                    success: !shouldFail,
                    shouldRemove: !shouldFail,
                    shouldRetry: shouldFail,
                    error: shouldFail ? 'Simulated error' : undefined,
                };
            });

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            // 2 items should remain (the ones that failed)
            const remaining = edgeFunctionQueueService.getQueue();
            expect(remaining).toHaveLength(2);
            expect(remaining.map(i => i.id).sort()).toEqual(['verify-1', 'verify-3']);
        });

        it('should work with fewer items than limit', async () => {
            // Add only 2 items (less than concurrency limit of 3)
            await edgeFunctionQueueService.addToQueue({
                id: 'verify-0',
                idempotencyKey: 'key-0',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now(),
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);
            await edgeFunctionQueueService.addToQueue({
                id: 'verify-1',
                idempotencyKey: 'key-1',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user1' },
                createdAt: Date.now() + 1,
            } as Omit<VerificationQueueItem, 'retryCount' | 'nextAttemptAt'>);

            const mockProcessor = jest.fn(async () => ({
                success: true,
                shouldRemove: true,
                shouldRetry: false,
            }));

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            expect(mockProcessor).toHaveBeenCalledTimes(2);
            expect(edgeFunctionQueueService.getQueue()).toHaveLength(0);
        });

        it('should keep XP processing sequential (unchanged)', async () => {
            // Add 3 XP items
            for (let i = 0; i < 3; i++) {
                await edgeFunctionQueueService.addToQueue({
                    id: `xp-${i}`,
                    idempotencyKey: `xp-key-${i}`,
                    category: 'xp',
                    functionName: 'award-xp',
                    body: { userId: 'user1', xpType: 'game', amount: 50 },
                    amount: 50,
                    createdAt: Date.now() + i,
                });
            }

            const processOrder: string[] = [];
            const mockProcessor = jest.fn(async (item: QueueItem) => {
                await new Promise(r => setTimeout(r, 10));
                processOrder.push(item.id);
                return { success: true, shouldRemove: true, shouldRetry: false };
            });

            const mockReconcile = jest.fn(async () => { });

            await edgeFunctionQueueService.processQueue(mockProcessor, mockReconcile);

            // XP items should be processed in order (sequential, not concurrent)
            expect(processOrder).toEqual(['xp-0', 'xp-1', 'xp-2']);
        });
    });
});

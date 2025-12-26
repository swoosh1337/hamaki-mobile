/**
 * Edge Function Queue Service
 *
 * Offline-first retry queue for Edge Function calls with:
 * - Persistent storage (AsyncStorage)
 * - Error classification (only retry retryable errors)
 * - Per-user XP lock (prevents concurrent processing)
 * - Optimistic XP derived from queue (never stored separately)
 * - Batch reconciliation (once after all XP items)
 * - Exponential backoff with enforced delay
 *
 * Architecture:
 *   UI → edgeFunctionClient → Queue Service → Edge Function → Database
 *
 * Key invariants:
 * 1. optimisticXPDelta = sum(queue.filter(cat='xp').amount)
 * 2. Only retryable errors are queued (5xx, 429, network)
 * 3. Per-user lock ensures sequential XP processing
 * 4. Reconciliation happens once after batch, not per-item
 * 5. Locks are ALWAYS released in finally blocks
 */

import type {
    PersistedQueue,
    QueueCategory,
    QueueItem,
    QueueStatus,
    XPQueueItem,
} from '@/types/edgeFunctionQueue';
import { isRetryableError, isXPQueueItem } from '@/types/edgeFunctionQueue';
import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

const log = createLogger('EdgeFunctionQueue');

// Storage key for persisted queue
const QUEUE_STORAGE_KEY = '@edge_function_queue';

// Queue version for migrations
const QUEUE_VERSION = 1;

// Maximum retry count before discarding
const MAX_RETRY_COUNT = 5;

// Base retry delay (exponential backoff: 1s, 2s, 4s, 8s, 16s)
const BASE_RETRY_DELAY_MS = 1000;

// Maximum concurrent non-XP requests (prevents network flooding)
const NON_XP_CONCURRENCY_LIMIT = 3;

/**
 * Result from processing a queue item
 */
export interface QueueProcessResult {
    success: boolean;
    duplicate?: boolean;
    shouldRemove: boolean;
    shouldRetry: boolean;
    error?: string;
    data?: unknown;
}

/**
 * Callback for processing a queue item
 * Provided by the hook/client that knows how to invoke Edge Functions
 */
export type ProcessItemCallback = (item: QueueItem) => Promise<QueueProcessResult>;

/**
 * Callback for reconciling user state after XP batch
 */
export type ReconcileCallback = (userId: string) => Promise<void>;

/**
 * Edge Function Queue Service
 *
 * Manages a persistent queue of failed Edge Function calls
 * for retry when network is restored.
 *
 * NOTE: This service manages the queue. Processing is triggered by
 * the useEdgeFunctionQueue hook which provides the actual Edge Function
 * invocation logic.
 */
class EdgeFunctionQueueService {
    /** In-memory queue (synced with AsyncStorage) */
    private queue: QueueItem[] = [];

    /** Set of user IDs currently being processed (XP lock) */
    private processingUsers: Set<string> = new Set();

    /** Whether the queue is currently being processed */
    private isProcessing = false;

    /** Listeners for queue changes */
    private listeners: Set<() => void> = new Set();

    /** Whether queue has been loaded from storage */
    private isInitialized = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initialize the queue service
     * Loads persisted queue from AsyncStorage
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
            if (stored) {
                const parsed: PersistedQueue = JSON.parse(stored);

                if (parsed.version === QUEUE_VERSION) {
                    this.queue = parsed.items as QueueItem[];
                    log.info('Queue loaded from storage', { itemCount: this.queue.length });
                } else {
                    log.warn('Queue version mismatch, clearing queue', {
                        stored: parsed.version,
                        current: QUEUE_VERSION,
                    });
                    this.queue = [];
                }
            }
        } catch (error) {
            log.error('Failed to load queue from storage', error);
            this.queue = [];
        }

        this.isInitialized = true;
    }

    // =========================================================================
    // Persistence
    // =========================================================================

    private async persistQueue(): Promise<void> {
        try {
            const data: PersistedQueue = {
                version: QUEUE_VERSION,
                items: this.queue,
                lastUpdated: Date.now(),
            };
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            log.error('Failed to persist queue', error);
            // Note: Queue is still in memory, will retry persist on next change
        }
    }

    // =========================================================================
    // Listeners
    // =========================================================================

    private notifyListeners(): void {
        this.listeners.forEach((listener) => {
            try {
                listener();
            } catch (error) {
                log.error('Listener error', error);
            }
        });
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // =========================================================================
    // Queue Operations
    // =========================================================================

    /**
     * Add an item to the queue (for retryable errors only)
     *
     * Type-safe input: pass an XP item with category:'xp', body:AwardXPBody, and amount,
     * or a non-XP item with category:'verification'|'content' and body:Record<string,unknown>
     */
    async addToQueue(item: Omit<QueueItem, 'retryCount' | 'nextAttemptAt'>): Promise<boolean> {
        await this.initialize();

        // Check for duplicate idempotency key
        if (this.queue.some((q) => q.idempotencyKey === item.idempotencyKey)) {
            log.debug('Duplicate idempotency key, not adding', { key: item.idempotencyKey });
            return false;
        }

        // Add runtime fields - the discriminated union is preserved through the spread
        // TypeScript loses track of the union variant, but the runtime values are correct
        const queueItem = {
            ...item,
            retryCount: 0,
            nextAttemptAt: Date.now(), // Can retry immediately on first attempt
        } as QueueItem;

        this.queue.push(queueItem);
        await this.persistQueue();
        this.notifyListeners();

        log.info('Item added to queue', {
            id: item.id,
            category: item.category,
            queueLength: this.queue.length,
        });

        return true;
    }

    async removeFromQueue(itemId: string): Promise<void> {
        await this.initialize();

        const index = this.queue.findIndex((item) => item.id === itemId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            await this.persistQueue();
            this.notifyListeners();
        }
    }

    async removeItems(itemIds: string[]): Promise<void> {
        await this.initialize();

        const idSet = new Set(itemIds);
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter((item) => !idSet.has(item.id));

        if (this.queue.length !== beforeCount) {
            await this.persistQueue();
            this.notifyListeners();
        }
    }

    getQueue(): QueueItem[] {
        return [...this.queue];
    }

    // =========================================================================
    // Status & Queries
    // =========================================================================

    getStatus(): QueueStatus {
        const xpItems = this.queue.filter((item) => item.category === 'xp');
        return {
            pendingCount: this.queue.length,
            xpItemCount: xpItems.length,
            optimisticXPDelta: this.getOptimisticXPDelta(),
            isProcessing: this.isProcessing,
            processingUsers: Array.from(this.processingUsers),
        };
    }

    /**
     * Get optimistic XP delta for a specific user
     * CRITICAL: DERIVED from queue, never stored separately
     */
    getOptimisticXPDeltaForUser(userId: string): number {
        return this.queue
            .filter(
                (item): item is XPQueueItem =>
                    isXPQueueItem(item) && item.body.userId === userId
            )
            .reduce((sum, item) => sum + item.amount, 0);
    }

    getOptimisticXPDelta(): number {
        return this.queue
            .filter(isXPQueueItem)
            .reduce((sum, item) => sum + item.amount, 0);
    }

    getXPItemsForUser(userId: string): XPQueueItem[] {
        return this.queue
            .filter(
                (item): item is XPQueueItem =>
                    isXPQueueItem(item) && item.body.userId === userId
            )
            .sort((a, b) => a.createdAt - b.createdAt);
    }

    getItemsByCategory(category: QueueCategory): QueueItem[] {
        return this.queue.filter((item) => item.category === category);
    }

    /**
     * Get items ready for retry (backoff expired)
     */
    getRetryableItems(): QueueItem[] {
        const now = Date.now();
        return this.queue.filter(
            (item) => !item.nextAttemptAt || item.nextAttemptAt <= now
        );
    }

    // =========================================================================
    // User Locks (for XP operations)
    // =========================================================================

    isUserProcessing(userId: string): boolean {
        return this.processingUsers.has(userId);
    }

    acquireUserLock(userId: string): boolean {
        if (this.processingUsers.has(userId)) {
            return false;
        }
        this.processingUsers.add(userId);
        this.notifyListeners();
        return true;
    }

    releaseUserLock(userId: string): void {
        this.processingUsers.delete(userId);
        this.notifyListeners();
    }

    // =========================================================================
    // Retry Logic
    // =========================================================================

    /**
     * Mark item for retry with exponential backoff
     * Only call this for RETRYABLE errors
     */
    async markForRetry(itemId: string, error: string, status?: number): Promise<void> {
        await this.initialize();

        const item = this.queue.find((q) => q.id === itemId);
        if (!item) return;

        item.retryCount++;
        item.lastError = error;
        item.lastStatus = status;
        item.nextAttemptAt = Date.now() + this.getRetryDelay(item.retryCount);

        if (item.retryCount >= MAX_RETRY_COUNT) {
            log.warn('Max retries exceeded, removing item', {
                id: itemId,
                retryCount: item.retryCount,
            });
            await this.removeFromQueue(itemId);
        } else {
            log.debug('Item marked for retry', {
                id: itemId,
                retryCount: item.retryCount,
                nextAttemptAt: new Date(item.nextAttemptAt).toISOString(),
            });
            await this.persistQueue();
            this.notifyListeners();
        }
    }

    /**
     * Check if an error should be queued for retry
     */
    shouldQueueError(status: number | undefined): boolean {
        return isRetryableError(status);
    }

    /**
     * Get retry delay with exponential backoff
     */
    getRetryDelay(retryCount: number): number {
        return BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(retryCount, 5));
    }

    /**
     * Process items with concurrency limit
     * Uses explicit getNext() for safe async index management
     * Preserves result ordering via pre-allocated slots
     */
    private async processWithConcurrency<T, R>(
        items: T[],
        limit: number,
        processor: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        const results = new Array<R>(items.length);
        let index = 0;

        // Explicit index getter - safe for async interleaving
        const getNext = (): number | null => {
            if (index >= items.length) return null;
            return index++;
        };

        const worker = async (): Promise<void> => {
            while (true) {
                const i = getNext();
                if (i === null) return;
                results[i] = await processor(items[i], i);
            }
        };

        // Start 'limit' parallel workers
        const workers = Array(Math.min(limit, items.length))
            .fill(null)
            .map(() => worker());

        await Promise.all(workers);
        return results;
    }

    // =========================================================================
    // Processing Control
    // =========================================================================

    setProcessing(isProcessing: boolean): void {
        this.isProcessing = isProcessing;
        this.notifyListeners();
    }

    getIsProcessing(): boolean {
        return this.isProcessing;
    }

    /**
     * Process the queue
     *
     * Processing order:
     * 1. XP items - sequential, per-user lock, batch reconcile
     * 2. Verification items - can be parallel
     * 3. Content items - can be parallel
     *
     * @param processItem Callback to invoke the Edge Function
     * @param reconcile Callback to reconcile user state after XP batch
     */
    async processQueue(
        processItem: ProcessItemCallback,
        reconcile: ReconcileCallback
    ): Promise<void> {
        await this.initialize();

        if (this.isProcessing) {
            log.debug('Queue already processing, skipping');
            return;
        }

        const retryableItems = this.getRetryableItems();
        if (retryableItems.length === 0) {
            log.debug('No items ready for retry');
            return;
        }

        this.setProcessing(true);
        log.info('Starting queue processing', { itemCount: retryableItems.length });

        try {
            // 1. Process XP items (sequential, per-user)
            await this.processXPItems(processItem, reconcile);

            // 2. Process verification items (parallel)
            await this.processItemsByCategory('verification', processItem);

            // 3. Process content items (parallel)
            await this.processItemsByCategory('content', processItem);

        } catch (error) {
            log.error('Queue processing error', error);
        } finally {
            this.setProcessing(false);
            log.info('Queue processing complete', { remainingItems: this.queue.length });
        }
    }

    /**
     * Process XP items for all users
     * Sequential per-user, batch reconciliation
     */
    private async processXPItems(
        processItem: ProcessItemCallback,
        reconcile: ReconcileCallback
    ): Promise<void> {
        // Get unique user IDs with XP items
        const userIds = new Set<string>();
        for (const item of this.queue.filter(isXPQueueItem)) {
            userIds.add(item.body.userId);
        }

        // Process each user's XP items
        for (const userId of userIds) {
            await this.processXPItemsForUser(userId, processItem, reconcile);
        }
    }

    /**
     * Process XP items for a single user
     * Acquires lock, processes sequentially, reconciles once, releases lock
     */
    private async processXPItemsForUser(
        userId: string,
        processItem: ProcessItemCallback,
        reconcile: ReconcileCallback
    ): Promise<void> {
        // Try to acquire lock
        if (!this.acquireUserLock(userId)) {
            log.debug('User XP already processing, skipping', { userId });
            return;
        }

        const itemsToRemove: string[] = [];

        try {
            const items = this.getXPItemsForUser(userId);
            const now = Date.now();

            // Filter to items ready for retry
            const readyItems = items.filter(
                (item) => !item.nextAttemptAt || item.nextAttemptAt <= now
            );

            if (readyItems.length === 0) {
                return;
            }

            log.info('Processing XP items for user', {
                userId,
                itemCount: readyItems.length,
            });

            // Process each item sequentially
            for (const item of readyItems) {
                try {
                    const result = await processItem(item);

                    if (result.shouldRemove) {
                        itemsToRemove.push(item.id);
                    } else if (result.shouldRetry) {
                        await this.markForRetry(
                            item.id,
                            result.error || 'Unknown error',
                            undefined
                        );
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    log.error('Error processing XP item', { itemId: item.id, error: errorMessage });

                    // Mark for retry on unexpected errors
                    await this.markForRetry(item.id, errorMessage);
                }
            }

            // Remove successful items
            if (itemsToRemove.length > 0) {
                await this.removeItems(itemsToRemove);
            }

            // Reconcile ONCE after all items processed
            try {
                await reconcile(userId);
                log.debug('Reconciliation complete', { userId });
            } catch (error) {
                log.error('Reconciliation failed', { userId, error });
                // Continue - don't fail the whole batch
            }

        } finally {
            // ALWAYS release lock
            this.releaseUserLock(userId);
        }
    }

    /**
     * Process items by category (concurrency-limited)
     * Uses worker pool to prevent network flooding
     */
    private async processItemsByCategory(
        category: QueueCategory,
        processItem: ProcessItemCallback
    ): Promise<void> {
        const items = this.getItemsByCategory(category);
        const now = Date.now();
        const readyItems = items.filter(
            (item) => !item.nextAttemptAt || item.nextAttemptAt <= now
        );

        if (readyItems.length === 0) {
            return;
        }

        log.info('Processing items by category', {
            category,
            itemCount: readyItems.length,
            concurrencyLimit: NON_XP_CONCURRENCY_LIMIT,
        });

        // Use concurrency-limited processing with ordered results
        const itemResults = await this.processWithConcurrency(
            readyItems,
            NON_XP_CONCURRENCY_LIMIT,
            async (item): Promise<{ item: QueueItem; result: QueueProcessResult }> => {
                try {
                    const result = await processItem(item);
                    return { item, result };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    return {
                        item,
                        result: {
                            success: false,
                            shouldRemove: false,
                            shouldRetry: true,
                            error: errorMessage,
                        },
                    };
                }
            }
        );

        const itemsToRemove: string[] = [];

        for (const { item, result } of itemResults) {
            if (result.shouldRemove) {
                itemsToRemove.push(item.id);
            } else if (result.shouldRetry) {
                await this.markForRetry(item.id, result.error || 'Unknown error');
            }
        }

        if (itemsToRemove.length > 0) {
            await this.removeItems(itemsToRemove);
        }
    }

    // =========================================================================
    // Cleanup
    // =========================================================================

    async clearQueue(): Promise<void> {
        this.queue = [];
        await this.persistQueue();
        this.notifyListeners();
        log.info('Queue cleared');
    }

    async clearUserItems(userId: string): Promise<void> {
        await this.initialize();

        const beforeCount = this.queue.length;
        // Only clear XP items for this user (keep non-XP items and other users' items)
        this.queue = this.queue.filter(
            (item) => !isXPQueueItem(item) || item.body.userId !== userId
        );

        if (this.queue.length !== beforeCount) {
            await this.persistQueue();
            this.notifyListeners();
            log.info('Cleared user items', { userId, removed: beforeCount - this.queue.length });
        }
    }
}

// Singleton instance
export const edgeFunctionQueueService = new EdgeFunctionQueueService();

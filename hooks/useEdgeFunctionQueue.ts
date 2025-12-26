/**
 * useEdgeFunctionQueue Hook
 *
 * React hook for the Edge Function retry queue system.
 * Provides:
 * - Auto-processing on network restore and app foreground
 * - Optimistic XP delta for UI display
 * - Queue status for debugging/UI
 *
 * Architecture:
 *   UI → useEdgeFunctionQueue → edgeFunctionQueueService → Edge Functions
 *
 * Usage:
 * ```typescript
 * const { optimisticXPDelta, queueStatus, processQueue } = useEdgeFunctionQueue({
 *   userId: userProfile.id,
 *   onServerXPUpdate: (xp, rank) => updateUserProfile({ xp_points: xp }),
 * });
 *
 * // Display XP with optimistic delta
 * const displayXP = serverXP + optimisticXPDelta;
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { createLogger } from '@/utils/logger';
import {
    edgeFunctionQueueService,
    type QueueProcessResult,
} from '@/services/queue';
import type { QueueStatus, QueueItem } from '@/types/edgeFunctionQueue';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
import type { AwardXPResult } from '@/types/leaderboard';
import { leaderboardService } from '@/services/supabase/leaderboardService';

const log = createLogger('Hook:EdgeFunctionQueue');

interface UseEdgeFunctionQueueOptions {
    /** User ID for optimistic XP calculation */
    userId?: string;
    /** Auto-process queue on mount and network/foreground changes */
    autoProcess?: boolean;
    /** Callback when server XP is updated (for reconciliation) */
    onServerXPUpdate?: (newXP: number, rank: number) => void;
}

interface UseEdgeFunctionQueueReturn {
    /** Optimistic XP delta from queued items for this user */
    optimisticXPDelta: number;
    /** Total optimistic XP delta across all users */
    totalOptimisticXPDelta: number;
    /** Current queue status */
    queueStatus: QueueStatus;
    /** Whether queue is currently processing */
    isProcessing: boolean;
    /** Manually trigger queue processing */
    processQueue: () => Promise<void>;
}

/**
 * Hook for managing Edge Function retry queue
 */
export function useEdgeFunctionQueue(
    options: UseEdgeFunctionQueueOptions = {}
): UseEdgeFunctionQueueReturn {
    const { userId, autoProcess = true, onServerXPUpdate } = options;

    const [queueStatus, setQueueStatus] = useState<QueueStatus>({
        pendingCount: 0,
        xpItemCount: 0,
        optimisticXPDelta: 0,
        isProcessing: false,
        processingUsers: [],
    });

    // Refs for callbacks to avoid stale closures
    const onServerXPUpdateRef = useRef(onServerXPUpdate);
    onServerXPUpdateRef.current = onServerXPUpdate;

    // Track if we're mounted
    const isMountedRef = useRef(true);

    // Local in-flight guard to prevent redundant processQueue calls
    // This is an OPTIMIZATION only - the queue service has its own guard
    const isProcessingLocalRef = useRef(false);

    /**
     * Update queue status from service
     */
    const updateStatus = useCallback(() => {
        if (isMountedRef.current) {
            setQueueStatus(edgeFunctionQueueService.getStatus());
        }
    }, []);

    /**
     * Process an XP queue item
     * Returns typed AwardXPResult and handles duplicate logic
     */
    const processXPItem = useCallback(async (item: QueueItem): Promise<QueueProcessResult> => {
        log.debug('Processing XP item', { id: item.id });

        try {
            const result = await invokeEdgeFunction<AwardXPResult>({
                functionName: item.functionName,
                body: {
                    ...item.body,
                    idempotencyKey: item.idempotencyKey,
                },
                silentFail: false,
            });

            if (result.success && result.data) {
                log.info('XP item processed successfully', {
                    id: item.id,
                    duplicate: result.data.duplicate,
                    newXP: result.data.new_total_xp,
                });

                return {
                    success: true,
                    duplicate: result.data.duplicate,
                    shouldRemove: true,
                    shouldRetry: false,
                    data: result.data,
                };
            } else {
                // Use actual status from result for retry classification
                const isRetryable = edgeFunctionQueueService.shouldQueueError(result.status);

                log.warn('XP item failed', {
                    id: item.id,
                    status: result.status,
                    isRetryable,
                    error: result.error,
                });

                return {
                    success: false,
                    shouldRemove: !isRetryable,
                    shouldRetry: isRetryable,
                    error: result.error || 'Unknown error',
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Error processing XP item', { id: item.id, error: errorMessage });

            // Network errors are retryable (status 0)
            return {
                success: false,
                shouldRemove: false,
                shouldRetry: true,
                error: errorMessage,
            };
        }
    }, []);

    /**
     * Process a non-XP queue item (verification, content)
     * Generic success/failure handling, no duplicate semantics
     */
    const processGenericItem = useCallback(async (item: QueueItem): Promise<QueueProcessResult> => {
        log.debug('Processing generic item', { id: item.id, category: item.category });

        try {
            const result = await invokeEdgeFunction<{ success: boolean; error?: string }>({
                functionName: item.functionName,
                body: {
                    ...item.body,
                    idempotencyKey: item.idempotencyKey,
                },
                silentFail: false,
            });

            if (result.success && result.data?.success) {
                log.info('Generic item processed successfully', { id: item.id });

                return {
                    success: true,
                    shouldRemove: true,
                    shouldRetry: false,
                    data: result.data,
                };
            } else {
                const isRetryable = edgeFunctionQueueService.shouldQueueError(result.status);

                log.warn('Generic item failed', {
                    id: item.id,
                    status: result.status,
                    isRetryable,
                });

                return {
                    success: false,
                    shouldRemove: !isRetryable,
                    shouldRetry: isRetryable,
                    error: result.error || result.data?.error || 'Unknown error',
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Error processing generic item', { id: item.id, error: errorMessage });

            return {
                success: false,
                shouldRemove: false,
                shouldRetry: true,
                error: errorMessage,
            };
        }
    }, []);

    /**
     * Process a single queue item - routes to appropriate handler by category
     */
    const processItem = useCallback(async (item: QueueItem): Promise<QueueProcessResult> => {
        if (item.category === 'xp') {
            return processXPItem(item);
        } else {
            return processGenericItem(item);
        }
    }, [processXPItem, processGenericItem]);

    /**
     * Reconcile user state after XP batch processing
     * Fetches authoritative XP from server
     */
    const reconcile = useCallback(async (targetUserId: string): Promise<void> => {
        log.debug('Reconciling user state', { userId: targetUserId });

        try {
            const status = await leaderboardService.getMyLeaderboardStatus(targetUserId);
            if (status && onServerXPUpdateRef.current) {
                onServerXPUpdateRef.current(status.xp.total, status.personalRank);
                log.info('Reconciliation complete', {
                    userId: targetUserId,
                    xp: status.xp.total,
                    rank: status.personalRank,
                });
            }
        } catch (error) {
            log.error('Reconciliation failed', { userId: targetUserId, error });
            // Don't throw - reconciliation failure shouldn't break processing
        }
    }, []);

    /**
     * Process the queue with local guard
     */
    const processQueue = useCallback(async (): Promise<void> => {
        // Local guard to prevent redundant calls from this hook instance
        // This is an optimization - the queue service has its own guard
        if (isProcessingLocalRef.current) {
            log.debug('processQueue already in flight (local guard), skipping');
            return;
        }

        isProcessingLocalRef.current = true;

        try {
            await edgeFunctionQueueService.processQueue(processItem, reconcile);
        } finally {
            isProcessingLocalRef.current = false;
        }
    }, [processItem, reconcile]);

    // Initialize queue service and subscribe to changes
    useEffect(() => {
        isMountedRef.current = true;

        const init = async () => {
            await edgeFunctionQueueService.initialize();
            updateStatus();
        };

        init();

        // Subscribe to queue changes
        const unsubscribe = edgeFunctionQueueService.subscribe(updateStatus);

        return () => {
            isMountedRef.current = false;
            unsubscribe();
        };
    }, [updateStatus]);

    // App state monitoring (foreground/background)
    // Process queue when app comes to foreground
    useEffect(() => {
        if (!autoProcess) return;

        const handleAppStateChange = (nextState: AppStateStatus) => {
            if (nextState === 'active') {
                log.info('App foregrounded, processing queue');
                processQueue();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [autoProcess, processQueue]);

    // Process queue on mount if autoProcess is enabled
    // Intentionally limited deps - only want to run on mount
    useEffect(() => {
        if (autoProcess) {
            processQueue();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoProcess]);

    // Calculate optimistic XP delta for this user
    const optimisticXPDelta = userId
        ? edgeFunctionQueueService.getOptimisticXPDeltaForUser(userId)
        : 0;

    return {
        optimisticXPDelta,
        totalOptimisticXPDelta: queueStatus.optimisticXPDelta,
        queueStatus,
        isProcessing: queueStatus.isProcessing,
        processQueue,
    };
}

// Export types
export type { UseEdgeFunctionQueueOptions, UseEdgeFunctionQueueReturn };

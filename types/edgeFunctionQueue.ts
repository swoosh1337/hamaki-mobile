/**
 * Edge Function Queue Types
 *
 * Types for the offline-first retry queue system that ensures
 * eventual consistency for XP and similar operations.
 *
 * Key principles:
 * 1. Optimistic XP is DERIVED from queue, never stored separately
 * 2. Only retry retryable errors (5xx, 429, network)
 * 3. Database-backed idempotency (not in-memory)
 * 4. Per-user XP lock prevents concurrent processing
 */

/**
 * Queue item categories determine processing behavior
 *
 * - xp: Sequential processing with per-user lock, batch reconciliation
 * - verification: Can be processed in parallel (subscriptions, likes)
 * - content: Can be processed in parallel (posts, comments)
 */
export type QueueCategory = 'xp' | 'verification' | 'content';

/**
 * XP types for the award-xp Edge Function
 */
export type XPType = 'game' | 'subscription' | 'video_like';

/**
 * Body for award-xp Edge Function calls
 */
export interface AwardXPBody {
    userId: string;
    xpType: XPType;
    amount: number;
    gameId?: string;
    sessionId?: string;
    idempotencyKey?: string;
}

/**
 * Base fields shared by all queue items
 */
interface QueueItemBase {
    /** Unique ID for this queue item (UUID) */
    id: string;

    /**
     * Idempotency key for deduplication
     * Format for XP: award-xp:{userId}:{gameId}:{sessionId}:{amount}
     */
    idempotencyKey: string;

    /** Edge Function name to call */
    functionName: string;

    /** When the item was queued (Unix timestamp ms) */
    createdAt: number;

    /** Number of retry attempts so far */
    retryCount: number;

    /** Last error message (for debugging) */
    lastError?: string;

    /** HTTP status of last failure (for debugging) */
    lastStatus?: number;

    /** Earliest time this item can be retried (backoff enforcement) */
    nextAttemptAt?: number;
}

/**
 * XP queue item - sequential processing with per-user lock
 */
export interface XPQueueItem extends QueueItemBase {
    category: 'xp';
    body: AwardXPBody;
    /** XP amount for optimistic delta calculation */
    amount: number;
}

/**
 * Verification queue item - parallel processing
 */
export interface VerificationQueueItem extends QueueItemBase {
    category: 'verification';
    body: Record<string, unknown>;
    amount?: never;
}

/**
 * Content queue item - parallel processing
 */
export interface ContentQueueItem extends QueueItemBase {
    category: 'content';
    body: Record<string, unknown>;
    amount?: never;
}

/**
 * Discriminated union of all queue item types
 * TypeScript narrows the body type based on category
 */
export type QueueItem = XPQueueItem | VerificationQueueItem | ContentQueueItem;

/**
 * Type guard to check if a queue item is an XP item
 */
export function isXPQueueItem(item: QueueItem): item is XPQueueItem {
    return item.category === 'xp';
}

/**
 * Queue persistence format for AsyncStorage
 */
export interface PersistedQueue {
    version: number;
    items: QueueItem[];
    lastUpdated: number;
}

/**
 * Queue processing status
 */
export interface QueueStatus {
    /** Number of items in queue */
    pendingCount: number;
    /** Number of XP items in queue */
    xpItemCount: number;
    /** Total optimistic XP delta from queued items */
    optimisticXPDelta: number;
    /** Whether queue is currently being processed */
    isProcessing: boolean;
    /** User IDs currently being processed (XP lock) */
    processingUsers: string[];
}

/**
 * Result from processing a queue item
 */
export interface QueueProcessResult {
    /** Whether the item was processed successfully */
    success: boolean;
    /** Whether this was a duplicate (idempotency) */
    duplicate?: boolean;
    /** Should the item be removed from queue? */
    shouldRemove: boolean;
    /** Should the item be retried later? */
    shouldRetry: boolean;
    /** Error message if failed */
    error?: string;
    /** Response data from Edge Function */
    data?: unknown;
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * HTTP status codes that should NOT be retried (permanent errors)
 */
const PERMANENT_ERROR_CODES = new Set([
    400, // Bad Request - invalid payload
    401, // Unauthorized - invalid/expired token
    403, // Forbidden - insufficient permissions
    404, // Not Found - resource doesn't exist
    422, // Unprocessable Entity - validation failed
]);

/**
 * Determines if an error should be retried
 *
 * Retryable errors:
 * - 5xx: Server errors (temporary)
 * - 429: Rate limiting (temporary)
 * - 0/undefined: Network offline or timeout
 *
 * Non-retryable (permanent) errors:
 * - 400: Bad Request
 * - 401: Unauthorized
 * - 403: Forbidden
 * - 404: Not Found
 * - 422: Unprocessable Entity
 *
 * @param status HTTP status code (0 or undefined = network error)
 * @returns true if the error should be retried
 */
export function isRetryableError(status: number | undefined): boolean {
    // Network offline or timeout (status is 0 or undefined)
    if (!status || status === 0) {
        return true;
    }

    // Server errors (5xx) are retryable
    if (status >= 500) {
        return true;
    }

    // Rate limiting is retryable
    if (status === 429) {
        return true;
    }

    // Permanent errors should not be retried
    if (PERMANENT_ERROR_CODES.has(status)) {
        return false;
    }

    // Unknown status - default to not retry
    return false;
}

/**
 * Generates an idempotency key for XP awards
 *
 * Format: award-xp:{userId}:{gameId}:{sessionId}:{amount}
 *
 * The amount is included to distinguish multiple awards in the same session.
 * The sessionId ensures different play sessions are distinct.
 *
 * @param userId User receiving XP
 * @param gameId Game awarding XP (e.g., 'nopogod', 'hammock-jump')
 * @param sessionId Unique session/play ID
 * @param amount XP amount being awarded
 */
export function generateXPIdempotencyKey(
    userId: string,
    gameId: string,
    sessionId: string,
    amount: number
): string {
    return `award-xp:${userId}:${gameId}:${sessionId}:${amount}`;
}

/**
 * Generates a unique session ID for a game play
 * Uses timestamp + random suffix for uniqueness
 */
export function generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}

/**
 * Test Suite for Edge Function Queue Types
 *
 * Tests cover:
 * - Error classification (isRetryableError)
 * - Idempotency key generation
 * - Session ID generation
 * - Type guards
 */

import { describe, expect, it } from '@jest/globals';
import {
    isRetryableError,
    isXPQueueItem,
    generateXPIdempotencyKey,
    generateSessionId,
    type QueueItem,
    type XPQueueItem,
    type VerificationQueueItem,
} from '@/types/edgeFunctionQueue';

describe('Edge Function Queue Types', () => {
    describe('isRetryableError', () => {
        describe('retryable errors (should return true)', () => {
            it('should return true for network errors (status 0)', () => {
                expect(isRetryableError(0)).toBe(true);
            });

            it('should return true for undefined status (network error)', () => {
                expect(isRetryableError(undefined)).toBe(true);
            });

            it('should return true for 500 Internal Server Error', () => {
                expect(isRetryableError(500)).toBe(true);
            });

            it('should return true for 502 Bad Gateway', () => {
                expect(isRetryableError(502)).toBe(true);
            });

            it('should return true for 503 Service Unavailable', () => {
                expect(isRetryableError(503)).toBe(true);
            });

            it('should return true for 504 Gateway Timeout', () => {
                expect(isRetryableError(504)).toBe(true);
            });

            it('should return true for 429 Too Many Requests (rate limit)', () => {
                expect(isRetryableError(429)).toBe(true);
            });
        });

        describe('permanent errors (should return false)', () => {
            it('should return false for 400 Bad Request', () => {
                expect(isRetryableError(400)).toBe(false);
            });

            it('should return false for 401 Unauthorized', () => {
                expect(isRetryableError(401)).toBe(false);
            });

            it('should return false for 403 Forbidden', () => {
                expect(isRetryableError(403)).toBe(false);
            });

            it('should return false for 404 Not Found', () => {
                expect(isRetryableError(404)).toBe(false);
            });

            it('should return false for 422 Unprocessable Entity', () => {
                expect(isRetryableError(422)).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('should return false for 200 OK', () => {
                expect(isRetryableError(200)).toBe(false);
            });

            it('should return false for 201 Created', () => {
                expect(isRetryableError(201)).toBe(false);
            });

            it('should return false for 204 No Content', () => {
                expect(isRetryableError(204)).toBe(false);
            });

            it('should return false for 301 redirect', () => {
                expect(isRetryableError(301)).toBe(false);
            });

            it('should return false for unknown 4xx status', () => {
                expect(isRetryableError(418)).toBe(false); // I'm a teapot
            });
        });
    });

    describe('generateXPIdempotencyKey', () => {
        it('should generate correct format', () => {
            const key = generateXPIdempotencyKey('user123', 'nopogod', 'session456', 50);
            expect(key).toBe('award-xp:user123:nopogod:session456:50');
        });

        it('should generate unique keys for different users', () => {
            const key1 = generateXPIdempotencyKey('user1', 'nopogod', 'session', 50);
            const key2 = generateXPIdempotencyKey('user2', 'nopogod', 'session', 50);
            expect(key1).not.toBe(key2);
        });

        it('should generate unique keys for different games', () => {
            const key1 = generateXPIdempotencyKey('user', 'nopogod', 'session', 50);
            const key2 = generateXPIdempotencyKey('user', 'othergame', 'session', 50);
            expect(key1).not.toBe(key2);
        });

        it('should generate unique keys for different sessions', () => {
            const key1 = generateXPIdempotencyKey('user', 'nopogod', 'session1', 50);
            const key2 = generateXPIdempotencyKey('user', 'nopogod', 'session2', 50);
            expect(key1).not.toBe(key2);
        });

        it('should generate unique keys for different amounts', () => {
            const key1 = generateXPIdempotencyKey('user', 'nopogod', 'session', 50);
            const key2 = generateXPIdempotencyKey('user', 'nopogod', 'session', 100);
            expect(key1).not.toBe(key2);
        });
    });

    describe('generateSessionId', () => {
        it('should generate a non-empty string', () => {
            const sessionId = generateSessionId();
            expect(sessionId).toBeTruthy();
            expect(typeof sessionId).toBe('string');
        });

        it('should contain timestamp', () => {
            const before = Date.now();
            const sessionId = generateSessionId();
            const after = Date.now();

            // Session ID format: timestamp-random
            const timestampPart = sessionId.split('-')[0];
            const timestamp = parseInt(timestampPart, 10);

            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('should generate unique IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateSessionId());
            }
            // All 100 should be unique
            expect(ids.size).toBe(100);
        });
    });

    describe('isXPQueueItem', () => {
        it('should return true for XP queue items', () => {
            const xpItem: XPQueueItem = {
                id: 'test-id',
                idempotencyKey: 'test-key',
                category: 'xp',
                functionName: 'award-xp',
                body: {
                    userId: 'user123',
                    xpType: 'game',
                    amount: 50,
                },
                amount: 50,
                createdAt: Date.now(),
                retryCount: 0,
            };

            expect(isXPQueueItem(xpItem)).toBe(true);
        });

        it('should return false for verification queue items', () => {
            const verificationItem: VerificationQueueItem = {
                id: 'test-id',
                idempotencyKey: 'test-key',
                category: 'verification',
                functionName: 'verify-subscriptions',
                body: { userId: 'user123' },
                createdAt: Date.now(),
                retryCount: 0,
            };

            expect(isXPQueueItem(verificationItem)).toBe(false);
        });

        it('should return false for content queue items', () => {
            const contentItem: QueueItem = {
                id: 'test-id',
                idempotencyKey: 'test-key',
                category: 'content',
                functionName: 'sync-content',
                body: { contentId: 'content123' },
                createdAt: Date.now(),
                retryCount: 0,
            };

            expect(isXPQueueItem(contentItem)).toBe(false);
        });

        it('should enable type narrowing', () => {
            const item: QueueItem = {
                id: 'test-id',
                idempotencyKey: 'test-key',
                category: 'xp',
                functionName: 'award-xp',
                body: {
                    userId: 'user123',
                    xpType: 'game',
                    amount: 50,
                },
                amount: 50,
                createdAt: Date.now(),
                retryCount: 0,
            };

            if (isXPQueueItem(item)) {
                // TypeScript should allow accessing body.userId directly
                expect(item.body.userId).toBe('user123');
                expect(item.amount).toBe(50);
            } else {
                // This branch should not execute
                expect(true).toBe(false);
            }
        });
    });
});

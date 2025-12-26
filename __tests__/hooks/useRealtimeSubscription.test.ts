/**
 * useRealtimeSubscription Hook Tests
 *
 * Tests cover:
 * - Subscription setup and cleanup
 * - Callback invocation on events
 * - Filtering support
 * - Enable/disable toggle
 * - Convenience hooks (insert, update, delete)
 */

import {
    useRealtimeDelete,
    useRealtimeInsert,
    useRealtimeSubscription,
    useRealtimeUpdate,
} from '@/hooks/useRealtimeSubscription';
import { renderHook } from '@testing-library/react-native';

// Mock supabase client - define mocks INSIDE factory to avoid hoisting issues
jest.mock('@/services/supabase', () => {
    const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
    const mockSubscribe = jest.fn().mockImplementation((callback) => {
        // Simulate successful subscription
        setTimeout(() => callback('SUBSCRIBED', null), 0);
        return { unsubscribe: mockUnsubscribe };
    });

    const mockOn = jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
    });

    const mockChannel = jest.fn().mockReturnValue({
        on: mockOn,
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
    });

    return {
        supabase: {
            channel: mockChannel,
        },
        // Export for test access
        __mockChannel: mockChannel,
        __mockOn: mockOn,
        __mockSubscribe: mockSubscribe,
        __mockUnsubscribe: mockUnsubscribe,
    };
});

// Mock logger
jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Get access to mock functions from the module
const { __mockChannel, __mockOn, __mockSubscribe, __mockUnsubscribe } = require('@/services/supabase');

// Create aliases for easier use in tests
const mockChannel = __mockChannel;
const mockOn = __mockOn;
const mockSubscribe = __mockSubscribe;
const mockUnsubscribe = __mockUnsubscribe;

// Helper function to reset all mocks with proper return values
function resetMocks() {
    jest.clearAllMocks();

    // Re-establish mock return values after clearAllMocks
    mockUnsubscribe.mockResolvedValue(undefined);
    mockSubscribe.mockImplementation((callback: (status: string, error: unknown) => void) => {
        setTimeout(() => callback('SUBSCRIBED', null), 0);
        return { unsubscribe: mockUnsubscribe };
    });
    mockOn.mockReturnValue({
        subscribe: mockSubscribe,
    });
    mockChannel.mockReturnValue({
        on: mockOn,
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
    });
}

describe('useRealtimeSubscription', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('subscription setup', () => {
        it('should create a channel with correct name', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                })
            );

            expect(mockChannel).toHaveBeenCalledWith(
                expect.stringContaining('realtime:public:test_table')
            );
        });

        it('should include schema in channel name', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    schema: 'custom_schema',
                    onPayload,
                })
            );

            expect(mockChannel).toHaveBeenCalledWith(
                expect.stringContaining('realtime:custom_schema:test_table')
            );
        });

        it('should include filter in channel name', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    filter: 'user_id=eq.123',
                    onPayload,
                })
            );

            expect(mockChannel).toHaveBeenCalledWith(
                expect.stringContaining('user_id=eq.123')
            );
        });

        it('should setup postgres_changes listener', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    event: 'INSERT',
                    onPayload,
                })
            );

            expect(mockOn).toHaveBeenCalledWith(
                'postgres_changes',
                expect.objectContaining({
                    event: 'INSERT',
                    schema: 'public',
                    table: 'test_table',
                }),
                expect.any(Function)
            );
        });

        it('should default to * event', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                })
            );

            expect(mockOn).toHaveBeenCalledWith(
                'postgres_changes',
                expect.objectContaining({
                    event: '*',
                }),
                expect.any(Function)
            );
        });
    });

    describe('subscription cleanup', () => {
        it('should call unsubscribe on unmount', () => {
            const onPayload = jest.fn();

            const { unmount } = renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                })
            );

            unmount();

            expect(mockUnsubscribe).toHaveBeenCalled();
        });

        it('should resubscribe when table changes', () => {
            const onPayload = jest.fn();

            const { rerender } = renderHook(
                ({ table }: { table: string }) =>
                    useRealtimeSubscription({
                        table,
                        onPayload,
                    }),
                { initialProps: { table: 'table_a' } }
            );

            expect(mockChannel).toHaveBeenCalledTimes(1);

            rerender({ table: 'table_b' });

            // Should unsubscribe from old and subscribe to new
            expect(mockUnsubscribe).toHaveBeenCalled();
            expect(mockChannel).toHaveBeenCalledTimes(2);
        });
    });

    describe('enabled toggle', () => {
        it('should not subscribe when disabled', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                    enabled: false,
                })
            );

            expect(mockChannel).not.toHaveBeenCalled();
        });

        it('should subscribe when enabled changes to true', () => {
            const onPayload = jest.fn();

            const { rerender } = renderHook(
                ({ enabled }: { enabled: boolean }) =>
                    useRealtimeSubscription({
                        table: 'test_table',
                        onPayload,
                        enabled,
                    }),
                { initialProps: { enabled: false } }
            );

            expect(mockChannel).not.toHaveBeenCalled();

            rerender({ enabled: true });

            expect(mockChannel).toHaveBeenCalled();
        });

        it('should unsubscribe when enabled changes to false', () => {
            const onPayload = jest.fn();

            const { rerender } = renderHook(
                ({ enabled }: { enabled: boolean }) =>
                    useRealtimeSubscription({
                        table: 'test_table',
                        onPayload,
                        enabled,
                    }),
                { initialProps: { enabled: true } }
            );

            rerender({ enabled: false });

            expect(mockUnsubscribe).toHaveBeenCalled();
        });
    });

    describe('callback invocation', () => {
        it('should call onPayload when event received', () => {
            const onPayload = jest.fn();
            type PayloadCallback = (payload: unknown) => void;
            let capturedCallback: PayloadCallback | null = null;

            mockOn.mockImplementation((_: string, __: unknown, callback: PayloadCallback) => {
                capturedCallback = callback;
                return { subscribe: mockSubscribe };
            });

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                })
            );

            // Simulate receiving a payload
            const mockPayload = {
                eventType: 'INSERT',
                new: { id: '123', name: 'Test' },
                old: {},
                commit_timestamp: '2025-01-01T00:00:00Z',
                schema: 'public',
                table: 'test_table',
                errors: null,
            };

            if (capturedCallback) {
                (capturedCallback as PayloadCallback)(mockPayload);
            }

            expect(onPayload).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'INSERT',
                    new: { id: '123', name: 'Test' },
                })
            );
        });

        it('should not re-subscribe when only callback changes', () => {
            const onPayload1 = jest.fn();
            const onPayload2 = jest.fn();

            type OnPayloadFn = (payload: unknown) => void;
            const { rerender } = renderHook(
                ({ onPayload }: { onPayload: OnPayloadFn }) =>
                    useRealtimeSubscription({
                        table: 'test_table',
                        onPayload,
                    }),
                { initialProps: { onPayload: onPayload1 as OnPayloadFn } }
            );

            const initialCallCount = mockChannel.mock.calls.length;

            rerender({ onPayload: onPayload2 as OnPayloadFn });

            // Should not have created a new channel
            expect(mockChannel).toHaveBeenCalledTimes(initialCallCount);
        });
    });

    describe('filter support', () => {
        it('should pass filter to subscription config', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    filter: 'user_id=eq.abc-123',
                    onPayload,
                })
            );

            expect(mockOn).toHaveBeenCalledWith(
                'postgres_changes',
                expect.objectContaining({
                    filter: 'user_id=eq.abc-123',
                }),
                expect.any(Function)
            );
        });

        it('should not include filter when not provided', () => {
            const onPayload = jest.fn();

            renderHook(() =>
                useRealtimeSubscription({
                    table: 'test_table',
                    onPayload,
                })
            );

            const callArgs = mockOn.mock.calls[0][1];
            expect(callArgs.filter).toBeUndefined();
        });
    });
});

describe('useRealtimeInsert', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('should subscribe with INSERT event', () => {
        const onInsert = jest.fn();

        renderHook(() => useRealtimeInsert('test_table', onInsert));

        expect(mockOn).toHaveBeenCalledWith(
            'postgres_changes',
            expect.objectContaining({
                event: 'INSERT',
            }),
            expect.any(Function)
        );
    });

    it('should call onInsert with new record', () => {
        const onInsert = jest.fn();
        type PayloadCallback = (payload: unknown) => void;
        let capturedCallback: PayloadCallback | null = null;

        mockOn.mockImplementation((_: string, __: unknown, callback: PayloadCallback) => {
            capturedCallback = callback;
            return { subscribe: mockSubscribe };
        });

        renderHook(() => useRealtimeInsert('test_table', onInsert));

        if (capturedCallback) {
            (capturedCallback as PayloadCallback)({
                eventType: 'INSERT',
                new: { id: '123', name: 'New Record' },
                old: {},
                commit_timestamp: '2025-01-01T00:00:00Z',
                schema: 'public',
                table: 'test_table',
                errors: null,
            });
        }

        expect(onInsert).toHaveBeenCalledWith({ id: '123', name: 'New Record' });
    });
});

describe('useRealtimeUpdate', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('should subscribe with UPDATE event', () => {
        const onUpdate = jest.fn();

        renderHook(() => useRealtimeUpdate('test_table', onUpdate));

        expect(mockOn).toHaveBeenCalledWith(
            'postgres_changes',
            expect.objectContaining({
                event: 'UPDATE',
            }),
            expect.any(Function)
        );
    });

    it('should call onUpdate with new and old records', () => {
        const onUpdate = jest.fn();
        type PayloadCallback = (payload: unknown) => void;
        let capturedCallback: PayloadCallback | null = null;

        mockOn.mockImplementation((_: string, __: unknown, callback: PayloadCallback) => {
            capturedCallback = callback;
            return { subscribe: mockSubscribe };
        });

        renderHook(() => useRealtimeUpdate('test_table', onUpdate));

        if (capturedCallback) {
            (capturedCallback as PayloadCallback)({
                eventType: 'UPDATE',
                new: { id: '123', name: 'Updated' },
                old: { id: '123', name: 'Original' },
                commit_timestamp: '2025-01-01T00:00:00Z',
                schema: 'public',
                table: 'test_table',
                errors: null,
            });
        }

        expect(onUpdate).toHaveBeenCalledWith(
            { id: '123', name: 'Updated' },
            { id: '123', name: 'Original' }
        );
    });
});

describe('useRealtimeDelete', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('should subscribe with DELETE event', () => {
        const onDelete = jest.fn();

        renderHook(() => useRealtimeDelete('test_table', onDelete));

        expect(mockOn).toHaveBeenCalledWith(
            'postgres_changes',
            expect.objectContaining({
                event: 'DELETE',
            }),
            expect.any(Function)
        );
    });

    it('should call onDelete with old record', () => {
        const onDelete = jest.fn();
        type PayloadCallback = (payload: unknown) => void;
        let capturedCallback: PayloadCallback | null = null;

        mockOn.mockImplementation((_: string, __: unknown, callback: PayloadCallback) => {
            capturedCallback = callback;
            return { subscribe: mockSubscribe };
        });

        renderHook(() => useRealtimeDelete('test_table', onDelete));

        if (capturedCallback) {
            (capturedCallback as PayloadCallback)({
                eventType: 'DELETE',
                new: {},
                old: { id: '123', name: 'Deleted Record' },
                commit_timestamp: '2025-01-01T00:00:00Z',
                schema: 'public',
                table: 'test_table',
                errors: null,
            });
        }

        expect(onDelete).toHaveBeenCalledWith({ id: '123', name: 'Deleted Record' });
    });
});

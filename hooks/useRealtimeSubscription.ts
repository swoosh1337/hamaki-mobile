/**
 * useRealtimeSubscription Hook
 *
 * Unified abstraction for Supabase Realtime subscriptions with:
 * - Proper cleanup with .unsubscribe() (not deprecated .removeChannel())
 * - Typed payloads
 * - Server-side filtering via filter param
 * - Enabled/disabled toggle
 *
 * Usage:
 * ```typescript
 * useRealtimeSubscription({
 *   table: 'leaderboard_refresh_events',
 *   event: 'INSERT',
 *   onPayload: (payload) => {
 *     console.log('New refresh event:', payload.new);
 *     refetchLeaderboard();
 *   },
 * });
 * ```
 */

import { supabase } from '@/services/supabase';
import { createLogger } from '@/utils/logger';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

const log = createLogger('Hook:RealtimeSubscription');

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * Payload structure from Supabase Realtime
 */
export interface RealtimePayload<T> {
    /** The type of change: INSERT, UPDATE, DELETE, or * */
    eventType: PostgresChangeEvent;
    /** The new record (for INSERT and UPDATE) */
    new: T;
    /** The old record (for UPDATE and DELETE) */
    old: Partial<T>;
    /** Timestamp of the change */
    commit_timestamp: string;
    /** Schema name */
    schema: string;
    /** Table name */
    table: string;
    /** Error if any */
    errors: string[] | null;
}

/**
 * Options for useRealtimeSubscription hook
 */
export interface UseRealtimeOptions<T> {
    /** Table name to subscribe to */
    table: string;
    /** Schema name (default: 'public') */
    schema?: string;
    /** Server-side filter (e.g., 'user_id=eq.123') */
    filter?: string;
    /** Event type to listen for (default: '*' for all) */
    event?: PostgresChangeEvent;
    /** Callback when payload is received */
    onPayload: (payload: RealtimePayload<T>) => void;
    /** Whether subscription is enabled (default: true) */
    enabled?: boolean;
    /** Optional channel name suffix for uniqueness */
    channelSuffix?: string;
}

/**
 * Hook for subscribing to Supabase Realtime changes
 *
 * Features:
 * - Automatic cleanup on unmount
 * - Server-side filtering to reduce traffic
 * - Type-safe payloads
 * - Enable/disable toggle
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>(
    options: UseRealtimeOptions<T>
): void {
    const {
        table,
        schema = 'public',
        filter,
        event = '*',
        onPayload,
        enabled = true,
        channelSuffix,
    } = options;

    // Store callback in ref to avoid re-subscribing on callback changes
    const callbackRef = useRef(onPayload);
    callbackRef.current = onPayload;

    // Store channel reference for cleanup
    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        if (!enabled) {
            log.debug(`Subscription disabled for ${table}`);
            return;
        }

        // Generate unique channel name
        const channelName = `realtime:${schema}:${table}${filter ? `:${filter}` : ''}${channelSuffix ? `:${channelSuffix}` : ''}`;
        log.info(`Subscribing to ${channelName}, event=${event}`);

        // Build the subscription config
        const subscriptionConfig: {
            event: PostgresChangeEvent;
            schema: string;
            table: string;
            filter?: string;
        } = {
            event,
            schema,
            table,
        };

        // Add filter if provided
        if (filter) {
            subscriptionConfig.filter = filter;
        }

        // Create channel and subscribe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (supabase
            .channel(channelName) as any)
            .on(
                'postgres_changes',
                subscriptionConfig,
                (payload: RealtimePostgresChangesPayload<T>) => {
                    log.debug(`Received ${payload.eventType} on ${table}`, {
                        eventType: payload.eventType,
                        hasNew: !!payload.new,
                        hasOld: !!payload.old,
                    });

                    // Transform to our payload format
                    const transformedPayload: RealtimePayload<T> = {
                        eventType: payload.eventType as PostgresChangeEvent,
                        new: payload.new as T,
                        old: payload.old as Partial<T>,
                        commit_timestamp: payload.commit_timestamp,
                        schema: payload.schema,
                        table: payload.table,
                        errors: payload.errors,
                    };

                    callbackRef.current(transformedPayload);
                }
            )
            .subscribe((status: string, err?: Error) => {
                if (status === 'SUBSCRIBED') {
                    log.info(`Successfully subscribed to ${channelName}`);
                } else if (status === 'CHANNEL_ERROR') {
                    // Channel errors are common during network transitions (app background/foreground)
                    // Supabase client auto-retries, so this is a warning not an error
                    log.warn(`Channel reconnecting for ${channelName}`, err ? { error: err.message } : undefined);
                } else if (status === 'TIMED_OUT') {
                    log.warn(`Subscription timed out for ${channelName}`);
                } else {
                    log.debug(`Subscription status for ${channelName}: ${status}`);
                }
            });

        channelRef.current = channel;

        // Cleanup function
        return () => {
            log.info(`Unsubscribing from ${channelName}`);
            if (channelRef.current) {
                // Use unsubscribe() for proper cleanup (not deprecated removeChannel)
                channelRef.current.unsubscribe();
                channelRef.current = null;
            }
        };
    }, [table, schema, filter, event, enabled, channelSuffix]);
}

/**
 * Convenience hook for subscribing to INSERT events only
 */
export function useRealtimeInsert<T extends Record<string, unknown>>(
    table: string,
    onInsert: (record: T) => void,
    options?: Omit<UseRealtimeOptions<T>, 'table' | 'event' | 'onPayload'>
): void {
    useRealtimeSubscription<T>({
        ...options,
        table,
        event: 'INSERT',
        onPayload: (payload) => {
            if (payload.new) {
                onInsert(payload.new);
            }
        },
    });
}

/**
 * Convenience hook for subscribing to UPDATE events only
 */
export function useRealtimeUpdate<T extends Record<string, unknown>>(
    table: string,
    onUpdate: (newRecord: T, oldRecord: Partial<T>) => void,
    options?: Omit<UseRealtimeOptions<T>, 'table' | 'event' | 'onPayload'>
): void {
    useRealtimeSubscription<T>({
        ...options,
        table,
        event: 'UPDATE',
        onPayload: (payload) => {
            if (payload.new) {
                onUpdate(payload.new, payload.old);
            }
        },
    });
}

/**
 * Convenience hook for subscribing to DELETE events only
 */
export function useRealtimeDelete<T extends Record<string, unknown>>(
    table: string,
    onDelete: (deletedRecord: Partial<T>) => void,
    options?: Omit<UseRealtimeOptions<T>, 'table' | 'event' | 'onPayload'>
): void {
    useRealtimeSubscription<T>({
        ...options,
        table,
        event: 'DELETE',
        onPayload: (payload) => {
            if (payload.old) {
                onDelete(payload.old);
            }
        },
    });
}

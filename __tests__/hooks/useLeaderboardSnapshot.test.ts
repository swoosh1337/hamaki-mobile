/**
 * useLeaderboardSnapshot Hook Tests
 *
 * Tests cover:
 * - Initial fetch from service
 * - Staleness detection
 * - Manual refetch
 * - Error handling
 * - Periodic refresh interval
 * - App foreground refresh
 * - Realtime subscription
 */

import { useLeaderboardSnapshot } from '@/hooks/useLeaderboardSnapshot';
import { leaderboardService } from '@/services/supabase/leaderboardService';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Mock the leaderboardService
jest.mock('@/services/supabase/leaderboardService', () => ({
    leaderboardService: {
        getLeaderboardSnapshot: jest.fn(),
    },
}));

// Mock useRealtimeInsert
const mockRealtimeCallback = jest.fn();
jest.mock('@/hooks/useRealtimeSubscription', () => ({
    useRealtimeInsert: jest.fn((table, callback, options) => {
        // Store callback for testing
        mockRealtimeCallback.mockImplementation(callback);
    }),
}));

// Mock AppState - define mock function INSIDE factory
jest.mock('react-native', () => {
    const mockAppStateAddEventListener = jest.fn().mockReturnValue({ remove: jest.fn() });

    return {
        AppState: {
            addEventListener: mockAppStateAddEventListener,
            currentState: 'active',
        },
        // Export for test access
        __mockAppStateAddEventListener: mockAppStateAddEventListener,
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

const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;

// Get access to mock functions from the modules
const { __mockAppStateAddEventListener } = require('react-native');

describe('useLeaderboardSnapshot', () => {
    const mockSnapshot = {
        entries: [
            {
                userId: 'user-1',
                fullName: 'Top Player',
                avatarUrl: 'avatar1.jpg',
                totalXP: 5000,
                gameXP: 3000,
                subscriptionXP: 1500,
                videoLikeXP: 500,
                rank: 1,
            },
            {
                userId: 'user-2',
                fullName: 'Second Place',
                avatarUrl: null,
                totalXP: 4000,
                gameXP: 2500,
                subscriptionXP: 1000,
                videoLikeXP: 500,
                rank: 2,
            },
        ],
        fetchedAt: new Date(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Re-establish mock return values after clearAllMocks
        __mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });

        mockLeaderboardService.getLeaderboardSnapshot.mockResolvedValue(mockSnapshot);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initial state', () => {
        it('should start with empty entries when autoFetch is disabled', () => {
            const { result } = renderHook(() =>
                useLeaderboardSnapshot({ autoFetch: false })
            );

            expect(result.current.entries).toEqual([]);
            expect(result.current.lastUpdated).toBeNull();
            expect(result.current.isStale).toBe(true);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.authoritative).toBe(true);
        });

        it('should auto-fetch on mount', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledWith(100, 'monthly');
            expect(result.current.entries).toHaveLength(2);
            expect(result.current.entries[0].fullName).toBe('Top Player');
        });

        it('should use custom limit', async () => {
            const { result } = renderHook(() =>
                useLeaderboardSnapshot({ limit: 50 })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledWith(50, 'monthly');
        });
    });

    describe('staleness detection', () => {
        it('should be stale when lastUpdated is null', () => {
            const { result } = renderHook(() =>
                useLeaderboardSnapshot({ autoFetch: false })
            );

            expect(result.current.isStale).toBe(true);
        });

        it('should not be stale immediately after fetch', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.lastUpdated).not.toBeNull();
            });

            expect(result.current.isStale).toBe(false);
        });

        it('should become stale after threshold', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.lastUpdated).not.toBeNull();
            });

            expect(result.current.isStale).toBe(false);

            // Advance time past stale threshold (5 minutes)
            act(() => {
                jest.advanceTimersByTime(5 * 60 * 1000 + 1);
            });

            // Re-render to trigger isStale recalculation
            // Note: isStale is computed on render, so we need to check after time advances
            expect(result.current.isStale).toBe(true);
        });
    });

    describe('refetch', () => {
        it('should refetch snapshot when refetch called', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(1);

            // Update mock data
            mockLeaderboardService.getLeaderboardSnapshot.mockResolvedValue({
                entries: [{ ...mockSnapshot.entries[0], fullName: 'New Leader' }],
                fetchedAt: new Date(),
            });

            await act(async () => {
                await result.current.refetch();
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(2);
            expect(result.current.entries[0].fullName).toBe('New Leader');
        });

        it('should force refetch even when debounced', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Immediate refetch should work (force = true bypasses debounce)
            await act(async () => {
                await result.current.refetch();
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(2);
        });
    });

    describe('error handling', () => {
        it('should handle fetch errors', async () => {
            mockLeaderboardService.getLeaderboardSnapshot.mockRejectedValue(
                new Error('Network error')
            );

            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Network error');
            expect(result.current.entries).toEqual([]);
        });

        it('should allow retry after failure (no debounce lock)', async () => {
            mockLeaderboardService.getLeaderboardSnapshot
                .mockRejectedValueOnce(new Error('First failure'))
                .mockResolvedValue(mockSnapshot);

            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            // Immediate retry should work
            await act(async () => {
                await result.current.refetch();
            });

            expect(result.current.entries).toHaveLength(2);
            expect(result.current.error).toBeNull();
        });
    });

    describe('periodic refresh', () => {
        it('should refresh on interval when enabled', async () => {
            const { result } = renderHook(() =>
                useLeaderboardSnapshot({ enableInterval: true })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(1);

            // Advance past refresh interval (5 minutes)
            act(() => {
                jest.advanceTimersByTime(5 * 60 * 1000);
            });

            await waitFor(() => {
                expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(2);
            });
        });

        it('should not refresh on interval when disabled', async () => {
            const { result } = renderHook(() =>
                useLeaderboardSnapshot({ enableInterval: false })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            act(() => {
                jest.advanceTimersByTime(5 * 60 * 1000);
            });

            expect(mockLeaderboardService.getLeaderboardSnapshot).toHaveBeenCalledTimes(1);
        });
    });

    describe('authoritative flag', () => {
        it('should always have authoritative: true', async () => {
            const { result } = renderHook(() => useLeaderboardSnapshot());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.authoritative).toBe(true);
        });
    });

    describe('loading state', () => {
        it('should set loading while fetching', async () => {
            mockLeaderboardService.getLeaderboardSnapshot.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockSnapshot), 100))
            );

            const { result } = renderHook(() => useLeaderboardSnapshot());

            expect(result.current.isLoading).toBe(true);

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });
    });
});

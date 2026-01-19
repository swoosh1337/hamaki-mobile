/**
 * Preloading Tests for VideoLikesManager and ChannelSubscriptionManager
 * 
 * Tests that components correctly use initialStatuses prop to avoid loading state
 */

// Must mock before any imports
jest.mock('expo-linking', () => ({
    openURL: jest.fn(),
    canOpenURL: jest.fn().mockResolvedValue(true),
    createURL: jest.fn((path) => `test://auth/${path}`),
}));

jest.mock('@/hooks/useYouTubeVerification');
jest.mock('@/contexts/AuthContext');

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ChannelSubscriptionManager } from '@/components/subscriptions/ChannelSubscriptionManager';
import { VideoLikesManager } from '@/components/subscriptions/VideoLikesManager';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as useYouTubeVerificationModule from '@/hooks/useYouTubeVerification';
import type { SubscriptionStatus, VideoLikeStatus } from '@/types/youtube';

const mockUseYouTubeVerification = useYouTubeVerificationModule.useYouTubeVerification as jest.MockedFunction<typeof useYouTubeVerificationModule.useYouTubeVerification>;
const mockUseAuth = AuthContextModule.useAuth as jest.MockedFunction<typeof AuthContextModule.useAuth>;

describe('Component Preloading Tests', () => {
    const createMockVideoStatus = (overrides: Partial<VideoLikeStatus> = {}): VideoLikeStatus => ({
        channelKey: 'hamaki',
        channelName: 'HamaKi',
        latestVideoId: 'test123',
        videoTitle: 'Test Video Title',
        isLiked: false,
        xpAwarded: false,
        xpReward: 200,
        lastChecked: Date.now(),
        ...overrides,
    });

    const createMockSubStatus = (overrides: Partial<SubscriptionStatus> = {}): SubscriptionStatus => ({
        channelKey: 'hamaki',
        channelId: 'ch123',
        channelName: 'HamaKi',
        isSubscribed: true,
        xpReward: 1000,
        xpAwarded: true,
        lastChecked: Date.now(),
        ...overrides,
    });

    // Base mock return value with quota state properties
    const createBaseMockReturn = (overrides: Partial<ReturnType<typeof useYouTubeVerificationModule.useYouTubeVerification>> = {}) => ({
        videoLikeStatuses: [],
        isLoadingVideoLikes: false,
        videoLikeError: null,
        verifyVideoLikes: jest.fn(),
        totalVideoLikeXP: 500,
        earnedSubscriptionXP: 0,
        subscriptionStatuses: [],
        isLoadingSubscriptions: false,
        subscriptionError: null,
        verifySubscriptions: jest.fn(),
        totalSubscriptionXP: 0,
        pendingActionCount: 0,
        pendingSubscriptionCount: 0,
        pendingVideoLikeCount: 0,
        lastSubscriptionCheck: null,
        refreshAll: jest.fn(),
        reloadFromCache: jest.fn(),
        // Quota state properties
        isQuotaExhausted: false,
        quotaResetTimeRemaining: null,
        quotaExhaustedMessage: null,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock for useAuth
        mockUseAuth.mockReturnValue({
            userProfile: { id: 'user-1', google_id: 'g1', full_name: 'Test', email: 'test@test.com', xp_points: 0, youtube_subscribed: true, created_at: '', updated_at: '' },
            updateUserProfile: jest.fn(),
            signOut: jest.fn(),
            isLoading: false,
            isAuthenticated: true,
            isDemoMode: false,
            authMethod: 'google',
            hasActiveSubscription: false,
        } as any);
    });

    describe('VideoLikesManager Preloading', () => {
        it('should show initialStatuses immediately when hook has no data yet', () => {
            // Hook returns empty (still loading)
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                videoLikeStatuses: [], // Hook hasn't loaded yet
                isLoadingVideoLikes: true,
            }));

            const initialStatuses = [
                createMockVideoStatus({ channelKey: 'hamaki', channelName: 'HamaKi', xpAwarded: true }),
                createMockVideoStatus({ channelKey: 'koro', channelName: 'Koro', xpAwarded: false }),
            ];

            render(<VideoLikesManager initialStatuses={initialStatuses} />);

            // Should show data from initialStatuses, not loading screen
            expect(screen.getByText('HamaKi')).toBeTruthy();
            expect(screen.getByText('Koro')).toBeTruthy();
            expect(screen.queryByText('Checking video likes...')).toBeNull();
        });

        it('should prefer hook data over initialStatuses when hook has loaded', () => {
            const hookStatuses = [
                createMockVideoStatus({ channelKey: 'hamaki', channelName: 'HamaKi Updated', xpAwarded: true }),
            ];

            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                videoLikeStatuses: hookStatuses, // Hook has data
            }));

            const initialStatuses = [
                createMockVideoStatus({ channelKey: 'hamaki', channelName: 'HamaKi Old', xpAwarded: false }),
            ];

            render(<VideoLikesManager initialStatuses={initialStatuses} />);

            // Should show hook data, not initialStatuses
            expect(screen.getByText('HamaKi Updated')).toBeTruthy();
            expect(screen.queryByText('HamaKi Old')).toBeNull();
        });

        it('should handle empty initialStatuses gracefully', () => {
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                isLoadingVideoLikes: true,
            }));

            render(<VideoLikesManager initialStatuses={[]} />);

            // Should show loading since both are empty
            expect(screen.getByText('Checking video likes...')).toBeTruthy();
        });

        it('should work without initialStatuses prop (backward compatibility)', () => {
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                videoLikeStatuses: [createMockVideoStatus({ channelName: 'From Hook' })],
            }));

            render(<VideoLikesManager />);

            expect(screen.getByText('From Hook')).toBeTruthy();
        });
    });

    describe('ChannelSubscriptionManager Preloading', () => {
        it('should show initialStatuses immediately when hook has no data yet', () => {
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                isLoadingSubscriptions: true,
                totalSubscriptionXP: 3100,
            }));

            const initialStatuses = [
                createMockSubStatus({ channelKey: 'hamaki', channelName: 'HamaKi', xpAwarded: true }),
                createMockSubStatus({ channelKey: 'miro', channelName: 'Miro', xpAwarded: false }),
            ];

            render(<ChannelSubscriptionManager initialStatuses={initialStatuses} />);

            // Should show data from initialStatuses
            expect(screen.getByText('HamaKi')).toBeTruthy();
            expect(screen.getByText('Miro')).toBeTruthy();
        });

        it('should prefer hook data over initialStatuses when hook has loaded', () => {
            const hookStatuses = [
                createMockSubStatus({ channelKey: 'hamaki', channelName: 'HamaKi Updated', xpAwarded: true }),
            ];

            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                earnedSubscriptionXP: 1000,
                subscriptionStatuses: hookStatuses, // Hook has data
                totalSubscriptionXP: 3100,
            }));

            const initialStatuses = [
                createMockSubStatus({ channelKey: 'hamaki', channelName: 'HamaKi Old', xpAwarded: false }),
            ];

            render(<ChannelSubscriptionManager initialStatuses={initialStatuses} />);

            // Should show hook data
            expect(screen.getByText('HamaKi Updated')).toBeTruthy();
            expect(screen.queryByText('HamaKi Old')).toBeNull();
        });

        it('should work without initialStatuses prop (backward compatibility)', () => {
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn({
                earnedSubscriptionXP: 1000,
                subscriptionStatuses: [createMockSubStatus({ channelName: 'From Hook' })],
                totalSubscriptionXP: 3100,
            }));

            render(<ChannelSubscriptionManager />);

            expect(screen.getByText('From Hook')).toBeTruthy();
        });
    });

    describe('XP Calculation with Preloaded Data', () => {
        it('should calculate earned XP correctly from initialStatuses', () => {
            mockUseYouTubeVerification.mockReturnValue(createBaseMockReturn());

            const initialStatuses = [
                createMockVideoStatus({ xpReward: 200, xpAwarded: true }),
                createMockVideoStatus({ channelKey: 'koro', xpReward: 100, xpAwarded: true }),
                createMockVideoStatus({ channelKey: 'miro', xpReward: 100, xpAwarded: false }),
            ];

            render(<VideoLikesManager initialStatuses={initialStatuses} />);

            // Should show 300 XP earned (200 + 100, not the unawardedone)
            expect(screen.getByText('300')).toBeTruthy();
        });
    });
});

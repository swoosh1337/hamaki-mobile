/**
 * ChannelSubscriptionManager Component Tests
 *
 * Tests for the channel subscription management UI component
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

// Mock dependencies BEFORE importing component
jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

// Define mock data and functions that will be used in mocks
const mockVerifySubscriptions = jest.fn();
const mockUpdateUserProfile = jest.fn();

const mockSubscriptionStatuses = [
    {
        channelKey: 'hamaki',
        channelId: 'UC_hamaki_id',
        channelName: 'HamaKi',
        isSubscribed: true,
        xpReward: 1000,
        xpAwarded: true,
        lastChecked: Date.now(),
    },
    {
        channelKey: 'miro',
        channelId: 'UC_miro_id',
        channelName: 'Miro',
        isSubscribed: false,
        xpReward: 700,
        xpAwarded: false,
        lastChecked: Date.now(),
    },
    {
        channelKey: 'bastos',
        channelId: 'UC_bastos_id',
        channelName: 'Basto',
        isSubscribed: true,
        xpReward: 700,
        xpAwarded: true,
        lastChecked: Date.now(),
    },
    {
        channelKey: 'koro',
        channelId: 'UC_koro_id',
        channelName: 'Koro',
        isSubscribed: false,
        xpReward: 700,
        xpAwarded: false,
        lastChecked: Date.now(),
    },
];

// Mock function that can be overridden in tests
const mockUseYouTubeVerification = jest.fn((): {
    subscriptionStatuses: typeof mockSubscriptionStatuses;
    isLoadingSubscriptions: boolean;
    subscriptionError: string | null;
    verifySubscriptions: typeof mockVerifySubscriptions;
    lastSubscriptionCheck: Date | null;
    totalSubscriptionXP: number;
    earnedSubscriptionXP: number;
} => ({
    subscriptionStatuses: mockSubscriptionStatuses,
    isLoadingSubscriptions: false,
    subscriptionError: null,
    verifySubscriptions: mockVerifySubscriptions,
    lastSubscriptionCheck: new Date(),
    totalSubscriptionXP: 3100,
    earnedSubscriptionXP: 1700,
}));

// Use getter pattern to avoid Jest hoisting issues
jest.mock('@/contexts/AuthContext', () => ({
    get useAuth() {
        return () => ({
            userProfile: { id: 'user-123', google_id: 'google-123' },
            updateUserProfile: mockUpdateUserProfile,
        });
    },
}));

jest.mock('@/hooks/useYouTubeVerification', () => ({
    get useYouTubeVerification() {
        return mockUseYouTubeVerification;
    },
}));

jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Spy on Alert
const alertSpy = jest.spyOn(Alert, 'alert');

// Import after mocks are set up
import { ChannelSubscriptionManager } from '@/components/subscriptions/ChannelSubscriptionManager';

describe('ChannelSubscriptionManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock to default behavior
        mockUseYouTubeVerification.mockReturnValue({
            subscriptionStatuses: mockSubscriptionStatuses,
            isLoadingSubscriptions: false,
            subscriptionError: null,
            verifySubscriptions: mockVerifySubscriptions,
            lastSubscriptionCheck: new Date(),
            totalSubscriptionXP: 3100,
            earnedSubscriptionXP: 1700,
        });
    });

    describe('Rendering', () => {
        it('should render all 4 channel cards', () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            expect(getByText('HamaKi')).toBeTruthy();
            expect(getByText('Miro')).toBeTruthy();
            expect(getByText('Basto')).toBeTruthy();
            expect(getByText('Koro')).toBeTruthy();
        });

        it('should render stats card with correct values', () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            // Subscribed count
            expect(getByText('2/4')).toBeTruthy();

            // Earned XP
            expect(getByText('1700')).toBeTruthy();

            // Total XP
            expect(getByText('3100')).toBeTruthy();
        });

        it('should show XP reward badges on channel cards', () => {
            const { getByText, getAllByText } = render(<ChannelSubscriptionManager />);

            expect(getByText('+1000')).toBeTruthy();
            // Multiple channels have +700 XP reward
            expect(getAllByText('+700')).toHaveLength(3);
        });

        it('should render verify button', () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            expect(getByText('დაადასტურე გამოწერა')).toBeTruthy();
        });

        it('should show "XP მიღებულია" badge for awarded channels', () => {
            const { getAllByText } = render(<ChannelSubscriptionManager />);

            // Should have 2 XP claimed badges (hamaki and bastos)
            const badges = getAllByText('XP მიღებულია');
            expect(badges).toHaveLength(2);
        });
    });

    describe('Subscription Status Display', () => {
        it('should show "გამოწერილია" indicator for subscribed channels', () => {
            const { getAllByText } = render(<ChannelSubscriptionManager />);

            // HamaKi and Bastos are subscribed
            const subscribedIndicators = getAllByText('გამოწერილია');
            expect(subscribedIndicators).toHaveLength(2);
        });

        it('should show "Subscribe" button for unsubscribed channels', () => {
            const { getAllByText } = render(<ChannelSubscriptionManager />);

            // Miro and Koro are not subscribed
            const subscribeButtons = getAllByText('Subscribe');
            expect(subscribeButtons).toHaveLength(2);
        });
    });

    describe('Loading State', () => {
        it('should show loading indicator when loading', () => {
            mockUseYouTubeVerification.mockReturnValueOnce({
                subscriptionStatuses: [],
                isLoadingSubscriptions: true,
                subscriptionError: null,
                verifySubscriptions: mockVerifySubscriptions,
                lastSubscriptionCheck: null,
                totalSubscriptionXP: 3100,
                earnedSubscriptionXP: 0,
            });

            const { getByText, UNSAFE_getByType } = render(<ChannelSubscriptionManager />);

            expect(getByText('მიმდინარეობის შემოწმება...')).toBeTruthy();

            const ActivityIndicator = require('react-native').ActivityIndicator;
            expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
        });
    });

    describe('Verify Subscriptions', () => {
        it('should call verifySubscriptions when verify button is pressed', async () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            const verifyButton = getByText('დაადასტურე გამოწერა');
            fireEvent.press(verifyButton);

            await waitFor(() => {
                expect(mockVerifySubscriptions).toHaveBeenCalled();
            });
        });

        it('should show success alert after verification', async () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            mockVerifySubscriptions.mockResolvedValueOnce(undefined);

            const verifyButton = getByText('დაადასტურე გამოწერა');
            fireEvent.press(verifyButton);

            await waitFor(() => {
                expect(Alert.alert).toHaveBeenCalledWith(
                    'ვერიფიკაცია დასრულდა',
                    expect.any(String),
                    expect.any(Array)
                );
            });
        });
    });

    describe('Subscribe Button', () => {
        it('should render Subscribe buttons for unsubscribed channels', () => {
            const { getAllByText } = render(<ChannelSubscriptionManager />);

            const subscribeButtons = getAllByText('Subscribe');
            expect(subscribeButtons).toHaveLength(2); // Miro and Koro
        });
    });

    describe('XP Deduplication Display', () => {
        it('should correctly display awarded vs not-awarded state', () => {
            const { getAllByText, queryByText } = render(<ChannelSubscriptionManager />);

            // Awarded channels show badge
            const awardedBadges = getAllByText('XP მიღებულია');
            expect(awardedBadges).toHaveLength(2);

            // Total earned XP should reflect only awarded channels (1000 + 700)
            expect(queryByText('1700')).toBeTruthy();
        });

        it('should show subscription status even if XP was already awarded', () => {
            // This tests the scenario where user unsubscribed but XP is still marked as awarded
            const unsubWithXPMock = [
                {
                    channelKey: 'hamaki',
                    channelId: 'UC_hamaki_id',
                    channelName: 'HamaKi',
                    isSubscribed: false, // Now unsubscribed
                    xpReward: 1000,
                    xpAwarded: true, // But still marked as awarded
                    lastChecked: Date.now(),
                },
            ];

            mockUseYouTubeVerification.mockReturnValueOnce({
                subscriptionStatuses: unsubWithXPMock,
                isLoadingSubscriptions: false,
                subscriptionError: null,
                verifySubscriptions: mockVerifySubscriptions,
                lastSubscriptionCheck: new Date(),
                totalSubscriptionXP: 1000,
                earnedSubscriptionXP: 1000,
            });

            const { getByText } = render(<ChannelSubscriptionManager />);

            // Even though unsubscribed, should still show XP awarded badge
            expect(getByText('XP მიღებულია')).toBeTruthy();
        });
    });

    describe('Last Verification Timestamp', () => {
        it('should display last verification timestamp', () => {
            const { getByText } = render(<ChannelSubscriptionManager />);

            expect(getByText(/Last verified:/)).toBeTruthy();
        });

        it('should not show timestamp if never verified', () => {
            mockUseYouTubeVerification.mockReturnValueOnce({
                subscriptionStatuses: mockSubscriptionStatuses,
                isLoadingSubscriptions: false,
                subscriptionError: null,
                verifySubscriptions: mockVerifySubscriptions,
                lastSubscriptionCheck: null, // Never verified
                totalSubscriptionXP: 3100,
                earnedSubscriptionXP: 0,
            });

            const { queryByText } = render(<ChannelSubscriptionManager />);

            expect(queryByText(/Last verified:/)).toBeNull();
        });
    });

    describe('Error Handling', () => {
        it('should show error alert when verification fails', async () => {
            mockVerifySubscriptions.mockRejectedValueOnce(new Error('API quota exceeded'));

            const { getByText } = render(<ChannelSubscriptionManager />);

            const verifyButton = getByText('დაადასტურე გამოწერა');
            fireEvent.press(verifyButton);

            await waitFor(() => {
                expect(Alert.alert).toHaveBeenCalledWith(
                    'ვერიფიკაცია ვერ მოხერხდა',
                    expect.any(String)
                );
            });
        });
    });
});

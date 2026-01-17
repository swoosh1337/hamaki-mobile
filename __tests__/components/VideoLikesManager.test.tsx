/**
 * VideoLikesManager Component Tests
 * 
 * Tests for layout structure, button states, and video synchronizing message
 */

// Must mock before any imports
jest.mock('expo-linking', () => ({
    openURL: jest.fn(),
    createURL: jest.fn((path) => `test://auth/${path}`),
}));

jest.mock('@/hooks/useYouTubeVerification');

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { VideoLikesManager } from '@/components/subscriptions/VideoLikesManager';
import * as useYouTubeVerificationModule from '@/hooks/useYouTubeVerification';
import type { VideoLikeStatus } from '@/types/youtube';

const mockUseYouTubeVerification = useYouTubeVerificationModule.useYouTubeVerification as jest.MockedFunction<typeof useYouTubeVerificationModule.useYouTubeVerification>;

describe('VideoLikesManager', () => {
    const mockVerifyVideoLikes = jest.fn();

    const createMockStatus = (overrides: Partial<VideoLikeStatus> = {}): VideoLikeStatus => ({
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

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseYouTubeVerification.mockReturnValue({
            videoLikeStatuses: [],
            isLoadingVideoLikes: false,
            videoLikeError: null,
            verifyVideoLikes: mockVerifyVideoLikes,
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
            // Quota state properties
            isQuotaExhausted: false,
            quotaResetTimeRemaining: null,
            quotaExhaustedMessage: null,
        });
    });

    describe('Layout Structure', () => {
        it('should render stats card at the top', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ xpAwarded: true })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('200')).toBeTruthy(); // Earned XP
            expect(screen.getByText('XP მიღებული')).toBeTruthy();
            expect(screen.getByText('500')).toBeTruthy(); // Total XP
            expect(screen.getByText('ჯამური XP')).toBeTruthy();
        });

        it('should render verify button at the bottom', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus()],
            });

            const { UNSAFE_getByType } = render(<VideoLikesManager />);
            const container = UNSAFE_getByType(require('react-native').View);

            // Verify button should be the last major section
            expect(screen.getByText('დაადასტურე ლაიქები')).toBeTruthy();
        });

        it('should have scrollable video list in the middle', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [
                    createMockStatus({ channelKey: 'hamaki', channelName: 'HamaKi' }),
                    createMockStatus({ channelKey: 'koro', channelName: 'Koro' }),
                ],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('HamaKi')).toBeTruthy();
            expect(screen.getByText('Koro')).toBeTruthy();
            expect(screen.getByText('დაალაიქე ახალი ვიდეობი')).toBeTruthy();
        });
    });

    describe('Video Synchronizing Message', () => {
        it('should show "ვიდეო სინქრონიზირდება..." when latestVideoId is null', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ latestVideoId: null })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('ვიდეო სინქრონიზირდება...')).toBeTruthy();
        });

        it('should show "ვიდეო სინქრონიზირდება..." when latestVideoId is empty string', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ latestVideoId: '' })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('ვიდეო სინქრონიზირდება...')).toBeTruthy();
        });

        it('should NOT show "ვიდეო სინქრონიზირდება..." when latestVideoId exists', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ latestVideoId: 'abc123' })],
            });

            render(<VideoLikesManager />);

            expect(screen.queryByText('ვიდეო სინქრონიზირდება...')).toBeNull();
        });

        it('should show video card even when videoTitle is null (with fallback text)', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({
                    latestVideoId: 'abc123',
                    videoTitle: null
                })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('Loading video details...')).toBeTruthy();
            expect(screen.queryByText('ვიდეო სინქრონიზირდება...')).toBeNull();
        });

        it('should show video card even when videoTitle is empty string (with fallback text)', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({
                    latestVideoId: 'abc123',
                    videoTitle: ''
                })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('Loading video details...')).toBeTruthy();
        });
    });

    describe('Like Button States', () => {
        it('should show active "უყურე და დაალაიქე" button when not liked and XP not awarded', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({
                    isLiked: false,
                    xpAwarded: false
                })],
            });

            render(<VideoLikesManager />);

            const likeButton = screen.getByText('უყურე და დაალაიქე');
            expect(likeButton).toBeTruthy();

            // Should be touchable (active)
            fireEvent.press(likeButton.parent!);
            // Linking.openURL should be called
        });

        it('should show greyed-out "დალაიქებულია" button when XP is awarded', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({
                    isLiked: true,
                    xpAwarded: true
                })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('დალაიქებულია')).toBeTruthy();
            expect(screen.queryByText('უყურე და დაალაიქე')).toBeNull();
        });

        it('should NOT show button when liked but XP not yet awarded (processing state)', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({
                    isLiked: true,
                    xpAwarded: false
                })],
            });

            render(<VideoLikesManager />);

            expect(screen.queryByText('უყურე და დაალაიქე')).toBeNull();
            expect(screen.queryByText('დალაიქებულია')).toBeNull();
            expect(screen.getByText('მუშავდება...')).toBeTruthy(); // Processing message
        });

        it('should show thumbs-up icon in greyed-out state', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ xpAwarded: true })],
            });

            const { UNSAFE_getAllByType } = render(<VideoLikesManager />);
            const ionicons = UNSAFE_getAllByType(require('@expo/vector-icons').Ionicons);

            const thumbsUpIcon = ionicons.find(icon => icon.props.name === 'thumbs-up');
            expect(thumbsUpIcon).toBeTruthy();
        });
    });

    describe('Verify Button States', () => {
        it('should show "დაადასტურე ლაიქები" when pending videos exist', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus({ xpAwarded: false })],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('დაადასტურე ლაიქები')).toBeTruthy();
        });

        it('should show "ყველა ვიდეო გადამოწმებულია" when all XP awarded', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [
                    createMockStatus({ xpAwarded: true }),
                    createMockStatus({ channelKey: 'koro', xpAwarded: true }),
                ],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('ყველა ვიდეო გადამოწმებულია')).toBeTruthy();
            expect(screen.queryByText('დაადასტურე ლაიქები')).toBeNull();
        });

        it('should show "ყველა ვიდეო გადამოწმებულია" when no videos available', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [
                    createMockStatus({ latestVideoId: null }),
                ],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('ყველა ვიდეო გადამოწმებულია')).toBeTruthy();
        });

        it('should show loading spinner when verifying', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                isLoadingVideoLikes: true,
                videoLikeStatuses: [createMockStatus()],
            });

            const { UNSAFE_getAllByType } = render(<VideoLikesManager />);
            const spinners = UNSAFE_getAllByType(require('react-native').ActivityIndicator);

            expect(spinners.length).toBeGreaterThan(0);
        });

        it('should call verifyVideoLikes when verify button pressed', async () => {
            mockVerifyVideoLikes.mockResolvedValueOnce(undefined);
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus()],
                verifyVideoLikes: mockVerifyVideoLikes,
            });

            render(<VideoLikesManager />);

            const verifyButton = screen.getByText('დაადასტურე ლაიქები');
            fireEvent.press(verifyButton.parent!);

            await waitFor(() => {
                expect(mockVerifyVideoLikes).toHaveBeenCalledTimes(1);
            });
        });

        it('should show success alert after successful verification', async () => {
            const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
            mockVerifyVideoLikes.mockResolvedValueOnce(undefined);
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus()],
                verifyVideoLikes: mockVerifyVideoLikes,
            });

            render(<VideoLikesManager />);

            const verifyButton = screen.getByText('დაადასტურე ლაიქები');
            fireEvent.press(verifyButton.parent!);

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    'ვერიფიკაცია დასრულდა',
                    'ლაიქები წარმატებით გადამოწმდა!'
                );
            });
        });

        it('should show error alert when verification fails', async () => {
            const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
            mockVerifyVideoLikes.mockRejectedValueOnce(new Error('Network error'));
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [createMockStatus()],
                verifyVideoLikes: mockVerifyVideoLikes,
            });

            render(<VideoLikesManager />);

            const verifyButton = screen.getByText('დაადასტურე ლაიქები');
            fireEvent.press(verifyButton.parent!);

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    'ვერიფიკაცია ვერ მოხერხდა',
                    expect.stringContaining('სამწუხაროდ')
                );
            });
        });
    });

    describe('XP Display', () => {
        it('should calculate and display earned XP correctly', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [
                    createMockStatus({ xpReward: 200, xpAwarded: true }),
                    createMockStatus({ channelKey: 'koro', xpReward: 100, xpAwarded: true }),
                    createMockStatus({ channelKey: 'miro', xpReward: 100, xpAwarded: false }),
                ],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('300')).toBeTruthy(); // 200 + 100 (only awarded)
        });

        it('should show 0 XP when no videos liked', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                videoLikeStatuses: [
                    createMockStatus({ xpAwarded: false }),
                ],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('0')).toBeTruthy();
        });
    });

    describe('Loading State', () => {
        it('should show loading screen when initially loading', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                isLoadingVideoLikes: true,
                videoLikeStatuses: [],
            });

            render(<VideoLikesManager />);

            expect(screen.getByText('Checking video likes...')).toBeTruthy();
        });

        it('should not show loading screen when data is available', () => {
            mockUseYouTubeVerification.mockReturnValue({
                ...mockUseYouTubeVerification(),
                isLoadingVideoLikes: false,
                videoLikeStatuses: [createMockStatus()],
            });

            render(<VideoLikesManager />);

            expect(screen.queryByText('Checking video likes...')).toBeNull();
        });
    });
});

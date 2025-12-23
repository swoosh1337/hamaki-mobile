/**
 * AuthContext Background Checks Tests
 */

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { sendSubscriptionVerificationNotification } from '@/utils/notifications';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// Mock the notifications module
jest.mock('@/utils/notifications', () => ({
  ...jest.requireActual('@/utils/notifications'),
  sendSubscriptionVerificationNotification: jest.fn().mockResolvedValue(undefined),
  initializeNotifications: jest.fn().mockResolvedValue(undefined),
  backgroundVideoCheck: jest.fn().mockResolvedValue(undefined),
}));

// Mock RememberMeModal component
jest.mock('@/components/ui/RememberMeModal', () => ({
  RememberMeModal: () => null,
}));

// Mock the channel subscriptions module
jest.mock('@/utils/channelSubscriptions', () => ({
  updateChannelSubscriptionsAndAwardXP: jest.fn(),
  checkAllChannelSubscriptions: jest.fn().mockResolvedValue({ hamaki: true }),
}));

// Mock the video likes module
jest.mock('@/utils/videoLikes', () => ({
  checkAndAwardVideoLikes: jest.fn().mockResolvedValue({ xpAwarded: 0 }),
}));

// Mock React Native modules - define inline to avoid hoisting issues
jest.mock('react-native', () => {
  const mockLinkingAddEventListener = jest.fn().mockReturnValue({ remove: jest.fn() });
  const mockLinkingGetInitialURL = jest.fn().mockResolvedValue(null);
  const mockAppStateAddEventListener = jest.fn().mockReturnValue({ remove: jest.fn() });

  return {
    AppState: {
      addEventListener: mockAppStateAddEventListener,
    },
    Linking: {
      getInitialURL: mockLinkingGetInitialURL,
      addEventListener: mockLinkingAddEventListener,
    },
    __mockLinkingAddEventListener: mockLinkingAddEventListener,
    __mockLinkingGetInitialURL: mockLinkingGetInitialURL,
    __mockAppStateAddEventListener: mockAppStateAddEventListener,
  };
});

// Mock logger
jest.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock analytics
jest.mock('@/utils/analytics', () => ({
  analytics: {
    setUserId: jest.fn(),
  },
}));

// Import mocked modules
import { updateChannelSubscriptionsAndAwardXP, checkAllChannelSubscriptions } from '@/utils/channelSubscriptions';
import { initializeNotifications, backgroundVideoCheck } from '@/utils/notifications';
import { checkAndAwardVideoLikes } from '@/utils/videoLikes';

// Define mock implementations
const mockAuthService = {
  authenticate: jest.fn(),
  handleMagicLinkCallback: jest.fn(),
  loadSavedSession: jest.fn(),
  triggerBackgroundVerification: jest.fn(),
  signOutSupabase: jest.fn(),
};

const mockTokenManager = {
  getStoredSession: jest.fn(),
  storeSession: jest.fn().mockResolvedValue(undefined),
  clearSession: jest.fn().mockResolvedValue(undefined),
  getValidAccessToken: jest.fn(),
};

const mockUserService = {
  getUserProfile: jest.fn(),
  upsertUserProfile: jest.fn(),
};

const mockRememberMeService = {
  getPreference: jest.fn(),
  setPreference: jest.fn().mockResolvedValue(undefined),
};

// Mock services
jest.mock('@/services/auth', () => ({
  get authService() {
    return mockAuthService;
  },
  get tokenManager() {
    return mockTokenManager;
  },
  get rememberMeService() {
    return mockRememberMeService;
  },
}));

jest.mock('@/services/supabase/userService', () => ({
  get userService() {
    return mockUserService;
  },
}));

jest.mock('@/services/supabase/client', () => {
  const mockFrom = jest.fn();
  const mockUnsubscribe = jest.fn();
  const mockOnAuthStateChange = jest.fn().mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });

  return {
    supabase: {
      auth: {
        onAuthStateChange: mockOnAuthStateChange,
        signOut: jest.fn(),
      },
      from: mockFrom,
    },
    __mockFrom: mockFrom,
    __mockOnAuthStateChange: mockOnAuthStateChange,
    __mockUnsubscribe: mockUnsubscribe,
  };
});

const mockSendNotification = sendSubscriptionVerificationNotification as jest.MockedFunction<
  typeof sendSubscriptionVerificationNotification
>;

// Get access to mock functions from modules
const { __mockFrom, __mockOnAuthStateChange, __mockUnsubscribe } = require('@/services/supabase/client');
const {
  __mockLinkingAddEventListener,
  __mockLinkingGetInitialURL,
  __mockAppStateAddEventListener,
} = require('react-native');

describe('AuthContext Background Checks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-establish mock return values after clearAllMocks
    __mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: __mockUnsubscribe } },
    });

    // Re-establish React Native mock return values
    __mockLinkingAddEventListener.mockReturnValue({ remove: jest.fn() });
    __mockLinkingGetInitialURL.mockResolvedValue(null);
    __mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });

    // Default: no saved session
    mockAuthService.loadSavedSession.mockResolvedValue({ success: false });

    // Re-establish tokenManager and rememberMeService mocks
    mockTokenManager.storeSession.mockResolvedValue(undefined);
    mockTokenManager.clearSession.mockResolvedValue(undefined);
    mockTokenManager.getValidAccessToken.mockResolvedValue('test-access-token');
    mockRememberMeService.setPreference.mockResolvedValue(undefined);

    // Re-establish notification mocks
    (initializeNotifications as jest.Mock).mockResolvedValue(undefined);
    (backgroundVideoCheck as jest.Mock).mockResolvedValue(undefined);
    (sendSubscriptionVerificationNotification as jest.Mock).mockResolvedValue(undefined);

    // Re-establish channel subscription mocks
    (checkAllChannelSubscriptions as jest.Mock).mockResolvedValue({ hamaki: true });

    // Re-establish other utility mocks
    (checkAndAwardVideoLikes as jest.Mock).mockResolvedValue({ xpAwarded: 0 });

    // Default Supabase from mock
    __mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
  });

  describe('Background Subscription Verification', () => {
    it('should send success notification when subscription is verified', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        google_id: 'google_123',
        youtube_subscribed: false,
      };

      // Mock successful authentication (subscriptions are checked in background, not during auth)
      mockAuthService.authenticate.mockResolvedValue({
        success: true,
        userData: { id: 'google_123', email: 'test@example.com' },
        isSubscribed: false,
        authMethod: 'google',
        tokenData: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        },
        allChannelSubscriptions: null, // Subscriptions checked in background
      });

      mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
      mockUserService.getUserProfile.mockResolvedValue(mockUser);

      // Mock background subscription check - returns subscribed
      (checkAllChannelSubscriptions as jest.Mock).mockResolvedValue({ hamaki: true });

      // Mock subscription verification success - XP awarded
      (updateChannelSubscriptionsAndAwardXP as jest.Mock).mockResolvedValue({
        totalXPAwarded: 500,
        updatedUser: { ...mockUser, xp_points: 500 },
      });

      mockSendNotification.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Sign in
      await act(async () => {
        await result.current.signIn();
      });

      // Wait for sign in to complete and modal to show
      await waitFor(() => {
        expect(result.current.showRememberMeModal).toBe(true);
      });

      // Finalize session with remember me
      await act(async () => {
        await result.current.finalizeSession(true);
      });

      // Wait for authentication to complete
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Wait for background checks to complete
      await waitFor(
        () => {
          expect(updateChannelSubscriptionsAndAwardXP).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Then check notification was sent
      expect(mockSendNotification).toHaveBeenCalledWith(true, 'HamaKi');
    });

    it('should send failure notification when subscription is not found', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        google_id: 'google_123',
        youtube_subscribed: false,
      };

      // Mock successful authentication (subscriptions are checked in background)
      mockAuthService.authenticate.mockResolvedValue({
        success: true,
        userData: { id: 'google_123', email: 'test@example.com' },
        isSubscribed: false,
        authMethod: 'google',
        tokenData: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        },
        allChannelSubscriptions: null, // Subscriptions checked in background
      });

      mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
      mockUserService.getUserProfile.mockResolvedValue(mockUser);

      // Mock background subscription check - returns NOT subscribed
      (checkAllChannelSubscriptions as jest.Mock).mockResolvedValue({ hamaki: false });

      // Mock subscription verification - no XP awarded
      (updateChannelSubscriptionsAndAwardXP as jest.Mock).mockResolvedValue({
        totalXPAwarded: 0,
        updatedUser: mockUser,
      });

      mockSendNotification.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Sign in
      await act(async () => {
        await result.current.signIn();
      });

      // Wait for sign in to complete and modal to show
      await waitFor(() => {
        expect(result.current.showRememberMeModal).toBe(true);
      });

      // Finalize session with remember me
      await act(async () => {
        await result.current.finalizeSession(true);
      });

      // Wait for authentication to complete
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Wait for background checks to complete
      await waitFor(
        () => {
          expect(mockSendNotification).toHaveBeenCalledWith(false, 'HamaKi');
        },
        { timeout: 3000 }
      );
    });

    it('should not send notification for magic link users', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        google_id: 'magic_123',
        youtube_subscribed: false,
      };

      // Mock magic link authentication
      mockAuthService.handleMagicLinkCallback.mockResolvedValue({
        success: true,
        userData: { id: 'magic_123', email: 'test@example.com' },
        isSubscribed: false,
        authMethod: 'magic_link',
        tokenData: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        },
      });

      mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
      mockUserService.getUserProfile.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Handle magic link callback - simulate with tokens in URL
      await act(async () => {
        await result.current.handleDeepLink('test://callback?access_token=test&refresh_token=test');
      });

      // Wait for modal to show
      await waitFor(() => {
        expect(result.current.showRememberMeModal).toBe(true);
      });

      // Finalize session with remember me
      await act(async () => {
        await result.current.finalizeSession(true);
      });

      // Wait for authentication to complete
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Should not send notification for magic link users
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should handle background check errors gracefully', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        google_id: 'google_123',
        youtube_subscribed: false,
      };

      // Mock successful authentication (subscriptions checked in background)
      mockAuthService.authenticate.mockResolvedValue({
        success: true,
        userData: { id: 'google_123', email: 'test@example.com' },
        isSubscribed: false,
        authMethod: 'google',
        tokenData: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        },
        allChannelSubscriptions: null, // Subscriptions checked in background
      });

      mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
      mockUserService.getUserProfile.mockResolvedValue(mockUser);

      // Mock background subscription check
      (checkAllChannelSubscriptions as jest.Mock).mockResolvedValue({ hamaki: true });

      // Mock subscription verification error
      (updateChannelSubscriptionsAndAwardXP as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Sign in
      await act(async () => {
        await result.current.signIn();
      });

      // Wait for modal to show
      await waitFor(() => {
        expect(result.current.showRememberMeModal).toBe(true);
      });

      // Finalize session with remember me
      await act(async () => {
        await result.current.finalizeSession(true);
      });

      // Wait for authentication to complete - the key assertion is that auth succeeds
      // even when background checks fail
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Give background checks time to run and fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash and should not send notification on error
      // The key test is that the app didn't crash and auth completed successfully
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should update user profile after background checks award XP', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        google_id: 'google_123',
        xp_points: 0,
        youtube_subscribed: false,
      };

      const updatedUser = {
        ...mockUser,
        xp_points: 500,
      };

      // Mock successful authentication (subscriptions checked in background)
      mockAuthService.authenticate.mockResolvedValue({
        success: true,
        userData: { id: 'google_123', email: 'test@example.com' },
        isSubscribed: false,
        authMethod: 'google',
        tokenData: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        },
        allChannelSubscriptions: null, // Subscriptions checked in background
      });

      mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
      mockUserService.getUserProfile
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      // Mock background subscription check
      (checkAllChannelSubscriptions as jest.Mock).mockResolvedValue({ hamaki: true });

      // Mock subscription verification success - XP awarded
      (updateChannelSubscriptionsAndAwardXP as jest.Mock).mockResolvedValue({
        totalXPAwarded: 500,
        updatedUser,
      });

      mockSendNotification.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Sign in
      await act(async () => {
        await result.current.signIn();
      });

      // Wait for modal to show
      await waitFor(() => {
        expect(result.current.showRememberMeModal).toBe(true);
      });

      // Finalize session with remember me
      await act(async () => {
        await result.current.finalizeSession(true);
      });

      // Wait for authentication to complete
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Wait for background checks to complete and XP to be updated
      await waitFor(
        () => {
          expect(result.current.userProfile?.xp_points).toBe(500);
        },
        { timeout: 3000 }
      );
    });
  });
});

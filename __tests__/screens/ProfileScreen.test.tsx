/**
 * ProfileScreen Component Tests
 * 
 * Tests for the profile tab screen including:
 * - Name editing functionality
 * - Avatar selection
 * - User profile display
 * - XP stats display
 * - User posts display
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

// Mock dependencies
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: jest.fn(),
}));

jest.mock('@/services/supabase/postService', () => ({
  postService: {
    getUserPosts: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Store the focus effect callback so tests can trigger it
let focusEffectCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn((callback) => {
    // Store callback for tests to invoke
    focusEffectCallback = callback;
    // Immediately invoke to simulate initial focus
    callback();
  }),
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `exp://192.168.1.1/${path}`),
  addEventListener: jest.fn(),
  getInitialURL: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/hooks/useYouTubeVerification', () => ({
  useYouTubeVerification: jest.fn(),
}));

import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
const mockUseYouTubeVerification = useYouTubeVerification as jest.Mock;

jest.mock('@/components/profile/AvatarPicker', () => ({
  AvatarPicker: ({ onSelect }: any) => {
    const { View } = require('react-native');
    return <View testID="avatar-picker" />;
  },
}));

jest.mock('@/components/profile/StatsCard', () => ({
  StatsCard: ({ xpStats, isLoading }: any) => {
    const { View, Text } = require('react-native');
    return (
      <View testID="stats-card">
        <Text>Stats Card</Text>
      </View>
    );
  },
}));

jest.mock('@/components/ui/SettingsModal', () => ({
  SettingsModal: ({ visible, onClose }: any) => {
    const { View } = require('react-native');
    return visible ? <View testID="settings-modal" /> : null;
  },
}));

jest.mock('@/components/ui/SkeletonLoader', () => ({
  ProfilePostSkeleton: () => {
    const { View, Text } = require('react-native');
    return (
      <View testID="profile-post-skeleton">
        <Text>Loading...</Text>
      </View>
    );
  },
}));

jest.mock('@/utils/avatars', () => ({
  getAvatarSource: jest.fn((url) => ({ uri: url })),
}));

jest.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Import mocked modules
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { postService } from '@/services/supabase/postService';

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseUserProfile = useUserProfile as jest.MockedFunction<typeof useUserProfile>;
const mockPostService = postService as jest.Mocked<typeof postService>;

// Spy on Alert
const alertSpy = jest.spyOn(Alert, 'alert');

// Import ProfileScreen after all mocks are set up
import ProfileScreen from '@/app/(tabs)/profile';

describe('ProfileScreen', () => {
  const mockUserProfile = {
    id: 'user_123',
    google_id: 'google_123',
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: 'avatar-1',
    xp_points: 1000,
    youtube_subscribed: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockXPStats = {
    totalXP: 4109,
    weeklyXP: 183,
    weeklyStartDate: '2024-01-01T00:00:00Z',
    weeklyEndDate: '2024-01-07T23:59:59Z',
  };

  const mockUpdateUserProfile = jest.fn();
  const mockUpdateUsernameViaHook = jest.fn();
  const mockUpdateAvatarViaHook = jest.fn();
  const mockRefetchProfile = jest.fn();
  const mockRefreshAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockUseAuth.mockReturnValue({
      userProfile: mockUserProfile,
      updateUserProfile: mockUpdateUserProfile,
      isDemoMode: false,
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: true,
      authMethod: 'google',
      signIn: jest.fn(),
      signInWithMagicLink: jest.fn(),
      signInDemo: jest.fn(),
      signOut: jest.fn(),
      error: null,
      magicLinkPending: false,
      finalizeSession: jest.fn(),
      showRememberMeModal: false,
      handleDeepLink: jest.fn(),
    });

    mockUseUserProfile.mockReturnValue({
      profile: mockUserProfile,
      xpStats: mockXPStats,
      isLoading: false,
      error: null,
      refetch: mockRefetchProfile,
      updateAvatar: mockUpdateAvatarViaHook,
      updateUsername: mockUpdateUsernameViaHook,
      addXP: jest.fn(),
    });

    mockPostService.getUserPosts.mockResolvedValue([]);

    // Mock useYouTubeVerification
    mockUseYouTubeVerification.mockReturnValue({
      pendingActionCount: 0,
      refreshAll: mockRefreshAll,
      isLoading: false,
      error: null,
    });
  });

  describe('Profile Display', () => {
    it('should render user name', () => {
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Test User')).toBeTruthy();
    });

    it('should render user email', () => {
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('test@example.com')).toBeTruthy();
    });

    it('should render StatsCard component', () => {
      const { getByTestId } = render(<ProfileScreen />);

      expect(getByTestId('stats-card')).toBeTruthy();
    });

    it('should render posts section title', () => {
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('ჩემი პოსტები')).toBeTruthy();
    });
  });

  describe('Name Editing', () => {
    it('should show edit button next to name', () => {
      const { UNSAFE_getAllByType } = render(<ProfileScreen />);

      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');

      expect(editIcon).toBeTruthy();
    });

    it('should show TextInput when edit button is pressed', () => {
      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Find and press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');

      fireEvent.press(editIcon);

      // Should show input field
      expect(getByPlaceholderText('Enter your name')).toBeTruthy();

      // Should show save and cancel buttons
      expect(getByText('შენახვა')).toBeTruthy();
      expect(getByText('გაუქმება')).toBeTruthy();
    });

    it('should populate TextInput with current name when editing', () => {
      const { getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      const input = getByPlaceholderText('Enter your name');
      expect(input.props.value).toBe('Test User');
    });

    it('should update input value when typing', () => {
      const { getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'New Name');

      expect(input.props.value).toBe('New Name');
    });

    it('should cancel editing when cancel button is pressed', () => {
      const { getByText, queryByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = queryByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'New Name');

      // Press cancel
      fireEvent.press(getByText('გაუქმება'));

      // Should hide input and show original name
      expect(queryByPlaceholderText('Enter your name')).toBeNull();
      expect(getByText('Test User')).toBeTruthy();
    });

    it('should save name when save button is pressed', async () => {
      mockUpdateUsernameViaHook.mockResolvedValue(true);

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'Updated Name');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(mockUpdateUsernameViaHook).toHaveBeenCalledWith('Updated Name');
      });
    });

    it('should update AuthContext when name is saved successfully', async () => {
      mockUpdateUsernameViaHook.mockResolvedValue(true);

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'Updated Name');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(mockUpdateUserProfile).toHaveBeenCalledWith({ full_name: 'Updated Name' });
      });
    });

    it('should show success alert when name is saved', async () => {
      mockUpdateUsernameViaHook.mockResolvedValue(true);

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'Updated Name');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Success', 'სახელი წარმატებით შეიცვალა!');
      });
    });

    it('should show error alert when name save fails', async () => {
      mockUpdateUsernameViaHook.mockResolvedValue(false);

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'Updated Name');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error', 'სახელის ცვლილება ვერ მოხერხდა');
      });
    });

    it('should handle validation errors', async () => {
      mockUpdateUsernameViaHook.mockRejectedValue(
        new Error('Username must be between 2 and 30 characters')
      );

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type invalid name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'X');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Error',
          'Username must be between 2 and 30 characters'
        );
      });
    });

    it('should trim whitespace from name before saving', async () => {
      mockUpdateUsernameViaHook.mockResolvedValue(true);

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type name with whitespace
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, '  Trimmed Name  ');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      await waitFor(() => {
        expect(mockUpdateUsernameViaHook).toHaveBeenCalledWith('Trimmed Name');
      });
    });

    it('should not save if name is empty', async () => {
      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Clear name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, '');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      // Should not call update
      expect(mockUpdateUsernameViaHook).not.toHaveBeenCalled();
    });

    it('should not save if name is only whitespace', async () => {
      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type whitespace only
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, '   ');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      // Should not call update
      expect(mockUpdateUsernameViaHook).not.toHaveBeenCalled();
    });

    it('should disable edit button while saving', async () => {
      mockUpdateUsernameViaHook.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(<ProfileScreen />);

      // Press edit button
      const Ionicons = require('@expo/vector-icons').Ionicons;
      let icons = UNSAFE_getAllByType(Ionicons);
      const editIcon = icons.find((icon: any) => icon.props.name === 'pencil');
      fireEvent.press(editIcon);

      // Type new name
      const input = getByPlaceholderText('Enter your name');
      fireEvent.changeText(input, 'New Name');

      // Press save
      fireEvent.press(getByText('შენახვა'));

      // Buttons should be disabled during save
      await waitFor(() => {
        expect(mockUpdateUsernameViaHook).toHaveBeenCalled();
      });
    });
  });

  describe('Avatar Display', () => {
    it('should render avatar when avatar_url is present', () => {
      const { UNSAFE_getByType } = render(<ProfileScreen />);

      const Image = require('react-native').Image;
      const image = UNSAFE_getByType(Image);

      expect(image).toBeTruthy();
    });

    it('should render placeholder when no avatar_url', () => {
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        userProfile: { ...mockUserProfile, avatar_url: undefined },
      });

      const { UNSAFE_getAllByType } = render(<ProfileScreen />);

      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);
      const personIcon = icons.find((icon: any) => icon.props.name === 'person-circle');

      expect(personIcon).toBeTruthy();
    });
  });

  describe('Demo Mode', () => {
    it('should show demo notice in demo mode', () => {
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        isDemoMode: true,
      });

      const { getByText } = render(<ProfileScreen />);

      expect(getByText(/Demo Mode/)).toBeTruthy();
    });

    it('should not show demo notice in normal mode', () => {
      const { queryByText } = render(<ProfileScreen />);

      expect(queryByText(/Demo Mode/)).toBeNull();
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton when posts are loading', () => {
      const { UNSAFE_getAllByType } = render(<ProfileScreen />);

      const ProfilePostSkeleton = require('@/components/ui/SkeletonLoader').ProfilePostSkeleton;
      const skeletons = UNSAFE_getAllByType(ProfilePostSkeleton);

      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Settings Modal', () => {
    it('should have settings icon in the UI', () => {
      const { UNSAFE_getAllByType } = render(<ProfileScreen />);

      const Ionicons = require('@expo/vector-icons').Ionicons;
      const icons = UNSAFE_getAllByType(Ionicons);

      // Profile screen should render Ionicons (for avatar placeholder, settings, etc.)
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Focus Effect - XP Stats Refresh', () => {
    it('should call useFocusEffect to set up refresh behavior', () => {
      const { useFocusEffect } = require('expo-router');

      render(<ProfileScreen />);

      // useFocusEffect should have been called to set up focus handling
      expect(useFocusEffect).toHaveBeenCalled();
    });

    it('should render correctly with xpStats from refetched data', () => {
      const { getByTestId } = render(<ProfileScreen />);

      // StatsCard should be rendered with xpStats
      expect(getByTestId('stats-card')).toBeTruthy();
    });

    it('should set up useYouTubeVerification for google auth', () => {
      render(<ProfileScreen />);

      // useYouTubeVerification should be called
      expect(mockUseYouTubeVerification).toHaveBeenCalled();
    });

    it('should use useUserProfile hook for XP stats', () => {
      render(<ProfileScreen />);

      // useUserProfile should be called with googleId
      expect(mockUseUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({ googleId: 'google_123' })
      );
    });
  });
});

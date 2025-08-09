import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthNavigator } from '../../components/AuthNavigator';
import { useAuth } from '../../contexts/AuthContext';

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
  },
}));

// Mock AuthContext
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockRouter = require('expo-router').router;

describe('AuthNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not navigate when loading', () => {
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      isSubscribed: false,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    render(<AuthNavigator />);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should navigate to tabs when user is authenticated and subscribed', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: true,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('should navigate to auth when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      isSubscribed: false,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should navigate to auth when user is authenticated but not subscribed', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: false,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should render nothing (null)', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: true,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    const { toJSON } = render(<AuthNavigator />);

    // The component should render null
    expect(toJSON()).toBeNull();
  });

  it('should re-navigate when auth state changes', () => {
    // First render - loading state
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      isSubscribed: false,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    const { rerender } = render(<AuthNavigator />);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // Second render - authenticated and subscribed
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: true,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    rerender(<AuthNavigator />);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');

    // Third render - not subscribed anymore
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: false,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    rerender(<AuthNavigator />);
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should handle edge case where isAuthenticated is true but isSubscribed is undefined', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isSubscribed: undefined as any,
      userProfile: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      error: null,
    });

    render(<AuthNavigator />);

    // Should navigate to auth since isSubscribed is falsy
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });
});
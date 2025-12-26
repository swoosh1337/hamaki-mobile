import { render } from '@testing-library/react-native';
import React from 'react';
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

// Helper to create mock auth context with all required properties
const createMockAuthContext = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => ({
  isLoading: false,
  isAuthenticated: false,
  isSubscribed: false,
  userProfile: null,
  signIn: jest.fn().mockResolvedValue({ success: true }),
  signOut: jest.fn().mockResolvedValue(undefined),
  signInWithMagicLink: jest.fn().mockResolvedValue({ success: true }),
  signInDemo: jest.fn().mockResolvedValue(undefined),
  updateUserProfile: jest.fn(),
  isDemoMode: false,
  authMethod: null,
  error: null,
  magicLinkPending: false,
  finalizeSession: jest.fn().mockResolvedValue(true),
  showRememberMeModal: false,
  handleDeepLink: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('AuthNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not navigate when loading', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isLoading: true,
    }));

    render(<AuthNavigator />);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should navigate to tabs when user is authenticated and subscribed', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: true,
    }));

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('should navigate to auth when user is not authenticated', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: false,
    }));

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should navigate to auth when user is authenticated but not subscribed', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: false,
    }));

    render(<AuthNavigator />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should render nothing (null)', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: true,
    }));

    const { toJSON } = render(<AuthNavigator />);

    // The component should render null
    expect(toJSON()).toBeNull();
  });

  it('should re-navigate when auth state changes', () => {
    // First render - loading state
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isLoading: true,
    }));

    const { rerender } = render(<AuthNavigator />);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // Second render - authenticated and subscribed
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: true,
    }));

    rerender(<AuthNavigator />);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');

    // Third render - not subscribed anymore
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: false,
    }));

    rerender(<AuthNavigator />);
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('should handle edge case where isAuthenticated is true but isSubscribed is undefined', () => {
    mockUseAuth.mockReturnValue(createMockAuthContext({
      isAuthenticated: true,
      isSubscribed: undefined as any,
    }));

    render(<AuthNavigator />);

    // Should navigate to auth since isSubscribed is falsy
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });
});
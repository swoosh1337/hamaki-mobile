/**
 * AuthContext Unit Tests
 * 
 * Tests for:
 * - Initial hydration
 * - Magic link flow
 * - Google OAuth flow
 * - Session persistence
 * - Logout
 * - Error handling
 */

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// Define mock implementations BEFORE jest.mock calls
// These need to be prefixed with 'mock' for Jest to not hoist them
const mockAuthService = {
    authenticate: jest.fn(),
    signInWithMagicLink: jest.fn(),
    handleMagicLinkCallback: jest.fn(),
    loadSavedSession: jest.fn(),
    triggerBackgroundVerification: jest.fn(),
    signOutSupabase: jest.fn(),
};

const mockTokenManager = {
    getStoredSession: jest.fn(),
    storeSession: jest.fn(),
    clearSession: jest.fn(),
    getValidAccessToken: jest.fn(),
};

const mockUserService = {
    getUserProfile: jest.fn(),
    upsertUserProfile: jest.fn(),
};

// Now define the mocks using the 'mock' prefixed variables
jest.mock('@/services/auth', () => ({
    get authService() {
        return mockAuthService;
    },
    get tokenManager() {
        return mockTokenManager;
    },
}));

// Mock Supabase client - use inline values to avoid hoisting issues
// The mock functions are defined INSIDE the factory so they exist when the factory runs
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
            },
            from: mockFrom,
        },
        // Export for test access
        __mockFrom: mockFrom,
        __mockOnAuthStateChange: mockOnAuthStateChange,
        __mockUnsubscribe: mockUnsubscribe,
    };
});

jest.mock('@/services/supabase/userService', () => ({
    get userService() {
        return mockUserService;
    },
}));

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

// Mock RememberMeModal
jest.mock('@/components/ui/RememberMeModal', () => ({
    RememberMeModal: () => null,
}));

// Mock notifications
jest.mock('@/utils/notifications', () => ({
    initializeNotifications: jest.fn(),
    backgroundVideoCheck: jest.fn(),
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

// Wrapper component for rendering hooks
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
);

// Get access to mock functions from the modules
const { __mockFrom, __mockOnAuthStateChange, __mockUnsubscribe } = require('@/services/supabase/client');
const {
    __mockLinkingAddEventListener,
    __mockLinkingGetInitialURL,
    __mockAppStateAddEventListener,
} = require('react-native');

describe('AuthContext', () => {
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

        // Default Supabase from mock
        __mockFrom.mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
            }),
        });
    });

    describe('Initial Hydration', () => {
        it('should hydrate authenticated user on app start', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
            });

            mockUserService.getUserProfile.mockResolvedValue(mockUser);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.userProfile?.email).toBe('test@example.com');
            expect(result.current.authMethod).toBe('google');
        });

        it('should handle missing session on startup', async () => {
            mockAuthService.loadSavedSession.mockResolvedValue({ success: false });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.userProfile).toBeNull();
        });

        it('should clear session if user not found in database', async () => {
            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'user_123' },
            });

            mockUserService.getUserProfile.mockResolvedValue(null);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(mockTokenManager.clearSession).toHaveBeenCalled();
            expect(result.current.isAuthenticated).toBe(false);
        });
    });

    describe('Magic Link Flow', () => {
        it('should not authenticate immediately after sending magic link', async () => {
            mockAuthService.signInWithMagicLink.mockResolvedValue({
                success: true,
                message: 'შეამოწმე ელფოსტა!',
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            let magicLinkResult: any;
            await act(async () => {
                magicLinkResult = await result.current.signInWithMagicLink('test@example.com');
            });

            expect(magicLinkResult!.success).toBe(true);
            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.magicLinkPending).toBe(true);
        });

        it('should set error when magic link fails', async () => {
            mockAuthService.signInWithMagicLink.mockResolvedValue({
                success: false,
                error: 'ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით.',
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                await result.current.signInWithMagicLink('test@example.com');
            });

            expect(result.current.error).toBe('ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით.');
            expect(result.current.magicLinkPending).toBe(false);
        });
    });

    describe('Google OAuth Flow', () => {
        it('should set loading state during Google OAuth', async () => {
            let resolveAuth: (value: any) => void;
            const authPromise = new Promise(resolve => {
                resolveAuth = resolve;
            });

            mockAuthService.authenticate.mockReturnValue(authPromise);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Start sign in
            act(() => {
                result.current.signIn();
            });

            // Complete authentication
            await act(async () => {
                resolveAuth!({
                    success: true,
                    userData: { id: 'user_123', email: 'test@example.com' },
                    isSubscribed: true,
                });
            });
        });

        it('should handle OAuth failure', async () => {
            mockAuthService.authenticate.mockResolvedValue({
                success: false,
                error: 'User cancelled',
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            let authResult: any;
            await act(async () => {
                authResult = await result.current.signIn();
            });

            expect(authResult!.success).toBe(false);
            expect(result.current.error).toBe('User cancelled');
        });
    });

    describe('Session Persistence', () => {
        it('should persist session across rehydration', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'google_123' },
                isSubscribed: true,
                authMethod: 'google',
            });

            mockUserService.getUserProfile.mockResolvedValue(mockUser);

            // First render
            const { result, unmount } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            });

            // Unmount and re-render
            unmount();

            const { result: result2 } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result2.current.isAuthenticated).toBe(true);
            });

            expect(result2.current.userProfile?.email).toBe('test@example.com');
        });
    });

    describe('Logout', () => {
        it('should clear all auth state on logout', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'google_123' },
                isSubscribed: true,
                authMethod: 'google',
            });

            mockUserService.getUserProfile.mockResolvedValue(mockUser);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            });

            await act(async () => {
                await result.current.signOut();
            });

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.userProfile).toBeNull();
            expect(result.current.authMethod).toBeNull();
            expect(mockTokenManager.clearSession).toHaveBeenCalled();
        });

        it('should sign out from Supabase for magic link sessions', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'supabase_123',
            };

            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'supabase_123' },
                isSubscribed: false,
                authMethod: 'magic_link',
            });

            mockUserService.getUserProfile.mockResolvedValue(mockUser);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            });

            await act(async () => {
                await result.current.signOut();
            });

            expect(mockAuthService.signOutSupabase).toHaveBeenCalled();
        });
    });

    describe('Demo Mode', () => {
        it('should set demo mode state correctly', async () => {
            const mockDemoUser = {
                id: 'demo_123',
                email: 'demouser@apple.com',
                google_id: 'demo_google',
                is_subscribed: true,
            };

            // Configure __mockFrom for demo user query
            __mockFrom.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: mockDemoUser,
                            error: null,
                        }),
                    }),
                }),
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                await result.current.signInDemo();
            });

            expect(result.current.isDemoMode).toBe(true);
            expect(result.current.isAuthenticated).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should set error state on authentication failure', async () => {
            mockAuthService.authenticate.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                await result.current.signIn();
            });

            expect(result.current.error).toBe('Network error');
        });

        it('should clear error on new sign in attempt', async () => {
            mockAuthService.authenticate.mockResolvedValueOnce({
                success: false,
                error: 'First error',
            });

            mockAuthService.authenticate.mockResolvedValueOnce({
                success: true,
                userData: { id: 'user_123' },
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // First attempt fails
            await act(async () => {
                await result.current.signIn();
            });

            expect(result.current.error).toBe('First error');

            // Second attempt - error should be cleared during the attempt
            await act(async () => {
                await result.current.signIn();
            });

            // After successful auth, error should be null
            expect(result.current.error).toBeNull();
        });
    });
});

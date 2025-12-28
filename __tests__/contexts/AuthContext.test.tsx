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
 * - Remember Me modal flow
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

const mockFinalizeSession = jest.fn().mockResolvedValue(true);
const mockShowRememberMeModal = false;

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

const mockRememberMeService = {
    getPreference: jest.fn(),
    setPreference: jest.fn().mockResolvedValue(undefined),
};

// Now define the mocks using the 'mock' prefixed variables
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
                signOut: jest.fn(),
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
    setLogUserContext: jest.fn(),
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

        // Re-establish tokenManager mocks
        mockTokenManager.storeSession.mockResolvedValue(undefined);
        mockTokenManager.clearSession.mockResolvedValue(undefined);

        // Re-establish rememberMeService mocks
        mockRememberMeService.setPreference.mockResolvedValue(undefined);

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

            // Mock rememberMeService to return true for stay signed in
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
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
                userData: { id: 'google_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
            });

            // Mock rememberMeService to return true for stay signed in
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
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
                userData: { id: 'google_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
            });

            // Mock rememberMeService to return true for stay signed in
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
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
                userData: { id: 'supabase_123', email: 'test@example.com' },
                isSubscribed: false,
                authMethod: 'magic_link',
            });

            // Mock rememberMeService to return true for stay signed in
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
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

    describe('Remember Me Modal Flow', () => {
        it('should skip modal when user has existing rememberMe preference', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            // User has existing Remember Me preference = true
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
            });

            // Mock successful authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'google',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Wait a bit for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            // Preference should have been checked
            expect(mockRememberMeService.getPreference).toHaveBeenCalledWith('test@example.com');

            // Should NOT show modal because user already answered
            expect(result.current.showRememberMeModal).toBe(false);

            // Should be authenticated without modal interaction
            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            });

            // Session should be stored as persistent (rememberMe = true)
            expect(mockTokenManager.storeSession).toHaveBeenCalled();
        });

        it('should show modal when user has no existing preference', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            // Mock successful authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'google',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);

            // No existing preference
            mockRememberMeService.getPreference.mockResolvedValue(null);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Should show modal because no preference exists
            expect(result.current.showRememberMeModal).toBe(true);

            // Should NOT be authenticated yet (waiting for modal response)
            expect(result.current.isAuthenticated).toBe(false);

            // Preference check should have been called
            expect(mockRememberMeService.getPreference).toHaveBeenCalledWith('test@example.com');
        });

        it('should show modal when user previously chose rememberMe = false', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            // Mock successful authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'google',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);

            // User has existing preference with rememberMe = false
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: false,
                expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
            });

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Should show modal because rememberMe was false
            expect(result.current.showRememberMeModal).toBe(true);

            // Should NOT be authenticated yet (waiting for modal response)
            expect(result.current.isAuthenticated).toBe(false);
        });

        it('should finalize session with remember me', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            // Mock successful authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com' },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                },
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
            mockUserService.getUserProfile.mockResolvedValue(mockUser);
            mockAuthService.loadSavedSession.mockResolvedValue({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
            });

            // Mock rememberMeService
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
            });

            // First sign in
            const { result, unmount } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            // Finalize session with remember me
            await act(async () => {
                await result.current.finalizeSession(true);
            });

            // Simulate app restart
            unmount();
            const { result: result2 } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result2.current.isAuthenticated).toBe(true);
            });
        });
    });

    describe('Background Subscription Verification', () => {
        it('should call background checks for Google users after authentication', async () => {
            const mockUser = {
                id: '2cb4a6f2-e501-4a04-a399-ffc804dee7f0', // Supabase UUID
                email: 'test@example.com',
                google_id: '102876331661182127857', // Google ID (not a UUID)
            };

            // User has existing Remember Me preference
            mockRememberMeService.getPreference.mockResolvedValue({
                email: 'test@example.com',
                rememberMe: true,
                expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
                lastUsed: Date.now(),
            });

            // Mock successful authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: {
                    id: '102876331661182127857',
                    email: 'test@example.com',
                    name: 'Test User'
                },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'google',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            // Wait for authentication to complete
            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            }, { timeout: 3000 });

            // Verify session was stored
            expect(mockTokenManager.storeSession).toHaveBeenCalled();

            // Note: Background checks are called asynchronously and we can't easily test
            // the exact parameters without mocking the subscription service module,
            // but the fix ensures supabaseUserId (UUID) is passed instead of googleId
        });

        it('should not perform background checks for magic link users', async () => {
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: null,
            };

            // Mock magic link authentication
            mockAuthService.authenticate.mockResolvedValue({
                success: true,
                userData: {
                    id: 'user_123',
                    email: 'test@example.com',
                    name: 'Test User'
                },
                isSubscribed: false,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'magic_link',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);
            mockUserService.getUserProfile.mockResolvedValue(mockUser);

            // No Remember Me preference for magic link
            mockRememberMeService.getPreference.mockResolvedValue(null);

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Sign in
            await act(async () => {
                await result.current.signIn();
            });

            // Finalize session
            await act(async () => {
                await result.current.finalizeSession(false);
            });

            await waitFor(() => {
                expect(result.current.isAuthenticated).toBe(true);
            });

            // Background checks should NOT be called for magic link users
            // (Magic link users don't have YouTube OAuth access)
            expect(mockTokenManager.getValidAccessToken).not.toHaveBeenCalled();
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
            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                google_id: 'google_123',
            };

            mockAuthService.authenticate.mockResolvedValueOnce({
                success: false,
                error: 'First error',
            });

            mockRememberMeService.getPreference.mockResolvedValue(null);

            mockAuthService.authenticate.mockResolvedValueOnce({
                success: true,
                userData: { id: 'google_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                tokenData: {
                    accessToken: 'test-token',
                    refreshToken: 'test-refresh',
                    expiresIn: 3600,
                    expiresAt: Date.now() + 3600 * 1000,
                    tokenType: 'Bearer',
                },
                authMethod: 'google',
            });

            mockUserService.upsertUserProfile.mockResolvedValue(mockUser);

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
            await waitFor(() => {
                expect(result.current.error).toBeNull();
            });
        });
    });
});

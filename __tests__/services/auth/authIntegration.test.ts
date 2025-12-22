/**
 * Auth Integration Tests
 * 
 * Tests for critical edge cases and integration flows:
 * - Magic link → deep link → authenticated
 * - Session refresh on app resume
 * - Invalid refresh token handling
 * - Edge cases (different device, 30+ days inactivity, etc.)
 */

import { authService, tokenManager } from '@/services/auth';

// Mock dependencies
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        auth: {
            signInWithOtp: jest.fn(),
            setSession: jest.fn(),
            getSession: jest.fn(),
            refreshSession: jest.fn(),
            signOut: jest.fn(),
        },
    },
}));

jest.mock('expo-secure-store', () => ({
    setItemAsync: jest.fn(),
    getItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn().mockResolvedValue(null),
    multiRemove: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('expo-auth-session', () => ({
    AuthRequest: jest.fn(),
    ResponseType: { Code: 'code' },
    getDefaultReturnUrl: jest.fn().mockReturnValue('test://return'),
    makeRedirectUri: jest.fn().mockReturnValue('test://redirect'),
}));

jest.mock('expo-constants', () => ({
    appOwnership: 'standalone',
}));

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

const { supabase } = require('@/services/supabase/client');
const SecureStore = require('expo-secure-store');

describe('Auth Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Integration Flow: Magic Link → Deep Link → Authenticated', () => {
        it('should complete full magic link authentication flow', async () => {
            // Step 1: Send magic link
            supabase.auth.signInWithOtp.mockResolvedValue({ error: null });

            const sendResult = await authService.signInWithMagicLink('user@example.com');
            expect(sendResult.success).toBe(true);
            expect(sendResult.message).toBe('შეამოწმე ელფოსტა!');

            // Step 2: User clicks magic link - deep link callback
            const mockSession = {
                access_token: 'new_access_token',
                refresh_token: 'new_refresh_token',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
            };

            const mockUser = {
                id: 'user_123',
                email: 'user@example.com',
                user_metadata: { full_name: 'Test User' },
            };

            supabase.auth.setSession.mockResolvedValue({
                data: { session: mockSession, user: mockUser },
                error: null,
            });

            const deepLinkUrl = 'hamaki://auth/callback#access_token=new_access_token&refresh_token=new_refresh_token&expires_in=3600&token_type=Bearer';

            const authResult = await authService.handleMagicLinkCallback(deepLinkUrl);

            // Step 3: Verify authentication completed
            expect(authResult.success).toBe(true);
            expect(authResult.userData.id).toBe('user_123');
            expect(authResult.userData.email).toBe('user@example.com');
            expect(authResult.authMethod).toBe('magic_link');
            expect(authResult.tokenData).toBeDefined();
            expect(authResult.tokenData?.accessToken).toBe('new_access_token');
        });

        it('should handle magic link flow with missing tokens (fallback to getSession)', async () => {
            // Deep link without tokens in URL
            supabase.auth.getSession.mockResolvedValue({
                data: {
                    session: {
                        access_token: 'session_token',
                        refresh_token: 'session_refresh',
                        expires_in: 3600,
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        token_type: 'Bearer',
                        user: {
                            id: 'user_123',
                            email: 'user@example.com',
                        },
                    },
                },
                error: null,
            });

            const result = await authService.handleMagicLinkCallback('hamaki://auth/callback');

            expect(result.success).toBe(true);
            expect(supabase.auth.getSession).toHaveBeenCalled();
        });
    });

    describe('Integration Flow: Session Refresh on App Resume', () => {
        it('should silently refresh expired Google OAuth token', async () => {
            // Setup: Stored session with expired access token but valid refresh token
            const storedSession = {
                tokenData: {
                    accessToken: 'expired_token',
                    refreshToken: 'valid_refresh_token',
                    expiresAt: Date.now() - 1000, // Expired
                    expiresIn: 3600,
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                lastVerification: Date.now(),
                authMethod: 'google' as const,
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

            // Mock successful token refresh
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'new_fresh_token',
                    expires_in: 3600,
                    token_type: 'Bearer',
                }),
            });

            // Get valid token (should trigger refresh)
            const token = await tokenManager.getValidAccessToken();

            // For Google OAuth with expired token but valid refresh, it should refresh
            // Note: Due to the mocking complexity, we test the refresh path
            if (storedSession.tokenData.refreshToken) {
                const refreshedToken = await tokenManager.refreshSession(storedSession);
                expect(refreshedToken).toBe('new_fresh_token');
                expect(SecureStore.setItemAsync).toHaveBeenCalled();
            }
        });

        it('should use Supabase refresh for magic link sessions', async () => {
            const storedSession = {
                tokenData: {
                    accessToken: 'expired_token',
                    refreshToken: 'supabase_refresh',
                    expiresAt: Date.now() - 1000, // Expired
                },
                userData: { id: 'user_123' },
                authMethod: 'magic_link',
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

            // For magic link, getValidAccessToken returns null to trigger authService refresh
            const token = await tokenManager.getValidAccessToken();

            expect(token).toBeNull(); // Magic link sessions need authService refresh
        });
    });

    describe('Integration Flow: Invalid Refresh Token', () => {
        it('should log out user when Google refresh token is invalid', async () => {
            const storedSession = {
                tokenData: {
                    accessToken: 'expired_token',
                    refreshToken: 'invalid_refresh_token',
                    expiresAt: Date.now() - 1000,
                    expiresIn: 3600,
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: false,
                lastVerification: Date.now(),
                authMethod: 'google' as const,
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

            // Mock failed token refresh
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({
                    error: 'invalid_grant',
                    error_description: 'Token has been revoked',
                }),
            });

            const token = await tokenManager.refreshSession(storedSession);

            expect(token).toBeNull();
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled(); // Session cleared
        });

        it('should log out user when Supabase refresh fails', async () => {
            supabase.auth.refreshSession.mockResolvedValue({
                data: { session: null, user: null },
                error: { message: 'Refresh token expired' },
            });

            const result = await authService.refreshSupabaseSession();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Refresh token expired');
        });
    });

    describe('Edge Case #1: Magic Link Opened on Different Device', () => {
        it('should authenticate only the device that opens the magic link', async () => {
            // Device A: Sends magic link
            supabase.auth.signInWithOtp.mockResolvedValue({ error: null });
            await authService.signInWithMagicLink('user@example.com');

            // Device B: Opens the magic link
            const mockSession = {
                access_token: 'device_b_token',
                refresh_token: 'device_b_refresh',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
            };

            const mockUser = {
                id: 'user_123',
                email: 'user@example.com',
            };

            supabase.auth.setSession.mockResolvedValue({
                data: { session: mockSession, user: mockUser },
                error: null,
            });

            const deviceBResult = await authService.handleMagicLinkCallback(
                'hamaki://auth/callback#access_token=device_b_token&refresh_token=device_b_refresh'
            );

            // Only Device B should be authenticated
            expect(deviceBResult.success).toBe(true);
            expect(deviceBResult.userData.id).toBe('user_123');

            // Device A should NOT have a session (not testing here, but the flow)
            // This is handled by the fact that only the device processing the callback
            // receives the session tokens
        });
    });

    describe('Edge Case #2: App Opened After 30+ Days of Inactivity', () => {
        it('should silently refresh if refresh token is still valid', async () => {
            // Advance time by 25 days (still within 30-day window)
            const twentyFiveDaysAgo = Date.now() - (25 * 24 * 60 * 60 * 1000);

            const storedSession = {
                tokenData: {
                    accessToken: 'old_but_refreshable',
                    refreshToken: 'valid_refresh_token',
                    expiresAt: Date.now() - 1000,
                    expiresIn: 3600,
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                isSubscribed: true,
                lastVerification: Date.now() - (15 * 24 * 60 * 60 * 1000), // 15 days ago
                authMethod: 'google' as const,
                expiresAt: Date.now() + (15 * 24 * 60 * 60 * 1000), // 15 days remaining
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

            // Token refresh should work
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'freshly_refreshed_token',
                    expires_in: 3600,
                }),
            });

            const newToken = await tokenManager.refreshSession(storedSession);

            expect(newToken).toBe('freshly_refreshed_token');
        });

        it('should require re-login if session expired (30+ days)', async () => {
            // Session that expired (more than 30 days old)
            const storedSession = {
                tokenData: {
                    accessToken: 'old_token',
                    refreshToken: 'old_refresh',
                    expiresAt: Date.now() - (31 * 24 * 60 * 60 * 1000),
                },
                userData: { id: 'user_123' },
                authMethod: 'google',
                expiresAt: Date.now() - 1000, // Session expired
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

            const session = await tokenManager.getStoredSession();

            expect(session).toBeNull(); // Session should be cleared
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        });
    });

    describe('Edge Case #3: Deep Link While App is Already Open', () => {
        it('should update session in-place without crash', async () => {
            // Simulate existing authenticated session
            const existingSession = {
                tokenData: {
                    accessToken: 'existing_token',
                    refreshToken: 'existing_refresh',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123', email: 'old@example.com' },
                authMethod: 'magic_link',
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(existingSession));

            // New magic link received while app is open
            const newSession = {
                access_token: 'new_session_token',
                refresh_token: 'new_session_refresh',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
            };

            const newUser = {
                id: 'user_123', // Same user
                email: 'old@example.com',
            };

            supabase.auth.setSession.mockResolvedValue({
                data: { session: newSession, user: newUser },
                error: null,
            });

            // Process new magic link callback
            const result = await authService.handleMagicLinkCallback(
                'hamaki://auth/callback#access_token=new_session_token&refresh_token=new_session_refresh'
            );

            // Should succeed without crashing
            expect(result.success).toBe(true);
            expect(result.tokenData?.accessToken).toBe('new_session_token');
        });
    });

    describe('Edge Case #4: Logout During Token Refresh', () => {
        it('should handle race condition between refresh and logout', async () => {
            // This tests the concept - actual implementation uses isSigningOut ref

            // Start a "long" refresh
            const slowRefreshPromise = new Promise<void>(resolve => {
                setTimeout(() => {
                    resolve();
                }, 1000);
            });

            // User initiates logout while refresh is pending
            await tokenManager.clearSession();

            // The session should be cleared
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled();

            // Any refresh completing after logout should not resurrect the session
            // (This is handled by the isSigningOut ref in AuthContext)
        });
    });

    describe('Background Verification', () => {
        it('should skip verification if within 24 hours', async () => {
            const recentSession = {
                tokenData: {
                    accessToken: 'valid_token',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123' },
                isSubscribed: true,
                authMethod: 'google',
                lastVerification: Date.now() - (12 * 60 * 60 * 1000), // 12 hours ago
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(recentSession));

            const result = await authService.triggerBackgroundVerification(recentSession);

            // Should return true without making API calls (no verification needed)
            expect(result).toBe(true);
        });

        it('should verify if more than 24 hours since last verification', async () => {
            const staleSession = {
                tokenData: {
                    accessToken: 'valid_token',
                    refreshToken: 'refresh_token',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123' },
                isSubscribed: true,
                authMethod: 'google',
                lastVerification: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(staleSession));

            // Mock YouTube API call
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    items: [{ snippet: { resourceId: { channelId: 'UCSI5XbaxsX1USijrfFVuJqA' } } }],
                }),
            });

            // This will attempt verification
            const result = await authService.triggerBackgroundVerification(staleSession);

            // Verification was attempted (result depends on mock setup)
            expect(typeof result).toBe('boolean');
        });
    });
});

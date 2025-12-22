/**
 * Auth Service Unit Tests
 * 
 * Tests for:
 * - Email Magic Link authentication
 * - Google OAuth authentication
 * - Session management
 * - Sign out
 */

import { authService } from '@/services/auth/authService';

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

jest.mock('@/services/auth/tokenManager', () => ({
    tokenManager: {
        getStoredSession: jest.fn(),
        storeSession: jest.fn(),
        clearSession: jest.fn(),
        getValidAccessToken: jest.fn(),
    },
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

// Get mocked modules
const { supabase } = require('@/services/supabase/client');
const { tokenManager } = require('@/services/auth/tokenManager');

describe('authService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Email Validation', () => {
        it('should validate correct email format', () => {
            const result = authService.validateEmail('test@example.com');
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should reject empty email', () => {
            const result = authService.validateEmail('');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Email is required');
        });

        it('should reject null/undefined email', () => {
            const result = authService.validateEmail(null as any);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Email is required');
        });

        it('should reject invalid email format', () => {
            const invalidEmails = [
                'notanemail',
                'missing@domain',
                '@nodomain.com',
                'spaces in@email.com',
                'no@dots',
            ];

            invalidEmails.forEach(email => {
                const result = authService.validateEmail(email);
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('Invalid email format');
            });
        });

        it('should trim and lowercase email', () => {
            const result = authService.validateEmail('  TEST@EXAMPLE.COM  ');
            expect(result.isValid).toBe(true);
        });
    });

    describe('Magic Link - signInWithMagicLink', () => {
        it('should send magic link successfully', async () => {
            supabase.auth.signInWithOtp.mockResolvedValue({ error: null });

            const result = await authService.signInWithMagicLink('test@example.com');

            expect(result.success).toBe(true);
            expect(result.message).toBe('შეამოწმე ელფოსტა!');
            expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
                email: 'test@example.com',
                options: expect.objectContaining({
                    emailRedirectTo: expect.any(String),
                    shouldCreateUser: true,
                }),
            });
        });

        it('should handle Supabase magic link error', async () => {
            supabase.auth.signInWithOtp.mockResolvedValue({
                error: { message: 'Rate limit exceeded' },
            });

            const result = await authService.signInWithMagicLink('test@example.com');

            expect(result.success).toBe(false);
            // Rate limit messages get special Georgian handling
            expect(result.error).toBe('ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით.');
        });

        it('should reject invalid email format before calling Supabase', async () => {
            const result = await authService.signInWithMagicLink('invalid-email');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid email format');
            expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
        });

        it('should handle network errors gracefully', async () => {
            supabase.auth.signInWithOtp.mockRejectedValue(new Error('Network error'));

            const result = await authService.signInWithMagicLink('test@example.com');

            expect(result.success).toBe(false);
            // Network errors get Georgian user-friendly message
            expect(result.error).toBe('ინტერნეტთან კავშირი ვერ მოხერხდა. შეამოწმე კავშირი და სცადე თავიდან.');
        });
    });

    describe('Magic Link - handleMagicLinkCallback', () => {
        it('should process valid magic link callback with tokens in URL', async () => {
            const mockSession = {
                access_token: 'access_token_123',
                refresh_token: 'refresh_token_123',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
            };

            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
                user_metadata: { full_name: 'Test User' },
            };

            supabase.auth.setSession.mockResolvedValue({
                data: { session: mockSession, user: mockUser },
                error: null,
            });

            const url = 'hamaki://auth/callback#access_token=access_token_123&refresh_token=refresh_token_123&expires_in=3600&token_type=Bearer';

            const result = await authService.handleMagicLinkCallback(url);

            expect(result.success).toBe(true);
            expect(result.userData.id).toBe('user_123');
            expect(result.userData.email).toBe('test@example.com');
            expect(result.authMethod).toBe('magic_link');
        });

        it('should handle error in magic link URL', async () => {
            const url = 'hamaki://auth/callback?error=access_denied&error_description=User%20cancelled';

            const result = await authService.handleMagicLinkCallback(url);

            expect(result.success).toBe(false);
            expect(result.error).toBe('User cancelled');
        });

        it('should fallback to getSession if no tokens in URL', async () => {
            const mockSession = {
                access_token: 'access_token_123',
                refresh_token: 'refresh_token_123',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
                user: {
                    id: 'user_123',
                    email: 'test@example.com',
                },
            };

            supabase.auth.getSession.mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });

            const url = 'hamaki://auth/callback';

            const result = await authService.handleMagicLinkCallback(url);

            expect(supabase.auth.getSession).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should return error when setSession fails', async () => {
            supabase.auth.setSession.mockResolvedValue({
                data: { session: null, user: null },
                error: { message: 'Invalid token' },
            });

            const url = 'hamaki://auth/callback#access_token=invalid&refresh_token=invalid';

            const result = await authService.handleMagicLinkCallback(url);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid token');
        });
    });

    describe('Session Management - getSupabaseSession', () => {
        it('should retrieve existing session', async () => {
            const mockSession = {
                access_token: 'token_123',
                user: { id: 'user_123' },
            };

            supabase.auth.getSession.mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });

            const session = await authService.getSupabaseSession();

            expect(session).toEqual(mockSession);
        });

        it('should return null when no session exists', async () => {
            supabase.auth.getSession.mockResolvedValue({
                data: { session: null },
                error: null,
            });

            const session = await authService.getSupabaseSession();

            expect(session).toBeNull();
        });

        it('should return null on error', async () => {
            supabase.auth.getSession.mockResolvedValue({
                data: { session: null },
                error: { message: 'Error' },
            });

            const session = await authService.getSupabaseSession();

            expect(session).toBeNull();
        });
    });

    describe('Session Management - refreshSupabaseSession', () => {
        it('should refresh session successfully', async () => {
            const mockSession = {
                access_token: 'new_token',
                refresh_token: 'new_refresh',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
            };

            const mockUser = {
                id: 'user_123',
                email: 'test@example.com',
            };

            supabase.auth.refreshSession.mockResolvedValue({
                data: { session: mockSession, user: mockUser },
                error: null,
            });

            const result = await authService.refreshSupabaseSession();

            expect(result.success).toBe(true);
            expect(result.tokenData?.accessToken).toBe('new_token');
            expect(result.authMethod).toBe('magic_link');
        });

        it('should handle refresh failure', async () => {
            supabase.auth.refreshSession.mockResolvedValue({
                data: { session: null, user: null },
                error: { message: 'Refresh token expired' },
            });

            const result = await authService.refreshSupabaseSession();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Refresh token expired');
        });
    });

    describe('Sign Out - signOutSupabase', () => {
        it('should sign out successfully', async () => {
            supabase.auth.signOut.mockResolvedValue({ error: null });

            await expect(authService.signOutSupabase()).resolves.not.toThrow();
            expect(supabase.auth.signOut).toHaveBeenCalled();
        });

        it('should handle sign out error gracefully', async () => {
            supabase.auth.signOut.mockResolvedValue({ error: { message: 'Error' } });

            // Should not throw
            await expect(authService.signOutSupabase()).resolves.not.toThrow();
        });
    });

    describe('Load Saved Session', () => {
        it('should load and return saved Google OAuth session', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'token_123',
                    refreshToken: 'refresh_123',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
            };

            tokenManager.getStoredSession.mockResolvedValue(mockSession);

            const result = await authService.loadSavedSession();

            expect(result.success).toBe(true);
            expect(result.userData.email).toBe('test@example.com');
            expect(result.fromCache).toBe(true);
            expect(result.authMethod).toBe('google');
        });

        it('should return error when no session found', async () => {
            tokenManager.getStoredSession.mockResolvedValue(null);

            const result = await authService.loadSavedSession();

            expect(result.success).toBe(false);
            expect(result.error).toBe('No session found');
        });

        it('should attempt Supabase session refresh for magic link sessions', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'token_123',
                    refreshToken: 'refresh_123',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123', email: 'test@example.com' },
                isSubscribed: false,
                authMethod: 'magic_link',
            };

            tokenManager.getStoredSession.mockResolvedValue(mockSession);
            supabase.auth.getSession.mockResolvedValue({
                data: { session: { access_token: 'valid' } },
                error: null,
            });

            const result = await authService.loadSavedSession();

            expect(result.success).toBe(true);
            expect(result.authMethod).toBe('magic_link');
        });
    });

    describe('URL Parsing - parseDeepLinkParams', () => {
        it('should parse query parameters', () => {
            const url = 'hamaki://callback?code=123&state=abc';
            const params = authService.parseDeepLinkParams(url);

            expect(params.code).toBe('123');
            expect(params.state).toBe('abc');
        });

        it('should parse hash fragment parameters', () => {
            const url = 'hamaki://callback#access_token=token123&token_type=Bearer';
            const params = authService.parseDeepLinkParams(url);

            expect(params.access_token).toBe('token123');
            expect(params.token_type).toBe('Bearer');
        });

        it('should parse both query and hash parameters', () => {
            const url = 'hamaki://callback?error=test#access_token=token123';
            const params = authService.parseDeepLinkParams(url);

            expect(params.error).toBe('test');
            expect(params.access_token).toBe('token123');
        });
    });
});

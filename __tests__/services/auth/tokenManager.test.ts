/**
 * Token Manager Unit Tests
 * 
 * Tests for:
 * - Session storage and retrieval
 * - Token refresh logic
 * - Session expiry handling
 * - Legacy session migration
 */

import { tokenManager } from '@/services/auth/tokenManager';

// Mock dependencies
jest.mock('expo-secure-store', () => ({
    setItemAsync: jest.fn(),
    getItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
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

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

// Get mocked modules
const SecureStore = require('expo-secure-store');
const AsyncStorage = require('@react-native-async-storage/async-storage');

describe('tokenManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('storeSession', () => {
        const mockTokenData = {
            accessToken: 'access_123',
            refreshToken: 'refresh_123',
            expiresIn: 3600,
            expiresAt: Date.now() + 3600000,
            tokenType: 'Bearer',
        };

        const mockUserData = {
            id: 'user_123',
            email: 'test@example.com',
            name: 'Test User',
        };

        it('should store session with 30-day persistence', async () => {
            await tokenManager.storeSession(mockTokenData, mockUserData, true, true, 'google');

            expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(3);

            // Check the session data stored
            const storedData = JSON.parse(SecureStore.setItemAsync.mock.calls[1][1]);

            // Session should expire in ~30 days
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const expectedExpiry = Date.now() + thirtyDaysMs;

            expect(storedData.expiresAt).toBeCloseTo(expectedExpiry, -3); // Within 1 second
            expect(storedData.authMethod).toBe('google');
        });

        it('should store temporary session with 24-hour expiry', async () => {
            await tokenManager.storeSession(mockTokenData, mockUserData, false, false, 'magic_link');

            const storedData = JSON.parse(SecureStore.setItemAsync.mock.calls[1][1]);

            // Session should expire in ~24 hours
            const oneDayMs = 24 * 60 * 60 * 1000;
            const expectedExpiry = Date.now() + oneDayMs;

            expect(storedData.expiresAt).toBeCloseTo(expectedExpiry, -3);
            expect(storedData.authMethod).toBe('magic_link');
        });

        it('should store access token separately for quick access', async () => {
            await tokenManager.storeSession(mockTokenData, mockUserData, true, true, 'google');

            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                'hamaki_auth_token',
                'access_123'
            );
        });
    });

    describe('getStoredSession', () => {
        it('should retrieve valid session', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'token_123',
                    refreshToken: 'refresh_123',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123', email: 'test@example.com' },
                isSubscribed: true,
                authMethod: 'google',
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const session = await tokenManager.getStoredSession();

            expect(session).not.toBeNull();
            expect(session?.userData.email).toBe('test@example.com');
            expect(session?.authMethod).toBe('google');
        });

        it('should return null and clear expired session', async () => {
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                userData: { id: 'user_123' },
                expiresAt: Date.now() - 1000, // Expired
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const session = await tokenManager.getStoredSession();

            expect(session).toBeNull();
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        });

        it('should add default authMethod for legacy sessions', async () => {
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                userData: { id: 'user_123' },
                expiresAt: Date.now() + 3600000,
                // No authMethod - legacy session
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const session = await tokenManager.getStoredSession();

            expect(session?.authMethod).toBe('google');
        });

        it('should return null when no session stored', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);
            AsyncStorage.getItem.mockResolvedValue(null);

            const session = await tokenManager.getStoredSession();

            expect(session).toBeNull();
        });
    });

    describe('getValidAccessToken', () => {
        it('should return valid token within buffer time', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'valid_token',
                    refreshToken: 'refresh_token',
                    expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes from now
                },
                authMethod: 'google',
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const token = await tokenManager.getValidAccessToken();

            expect(token).toBe('valid_token');
        });

        it('should return null for magic_link when token expired', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'expired_token',
                    refreshToken: 'refresh_token',
                    expiresAt: Date.now() - 1000, // Expired
                },
                authMethod: 'magic_link',
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const token = await tokenManager.getValidAccessToken();

            expect(token).toBeNull();
        });

        it('should return null when no session exists', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);
            AsyncStorage.getItem.mockResolvedValue(null);

            const token = await tokenManager.getValidAccessToken();

            expect(token).toBeNull();
        });
    });

    describe('refreshSession (Google OAuth)', () => {
        beforeEach(() => {
            global.fetch = jest.fn();
        });

        it('should refresh Google token successfully', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'old_token',
                    refreshToken: 'refresh_123',
                    expiresAt: Date.now() - 1000,
                    expiresIn: 3600,
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                authMethod: 'google' as const,
                isSubscribed: false,
                lastVerification: Date.now(),
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'new_token',
                    expires_in: 3600,
                    token_type: 'Bearer',
                }),
            });

            const newToken = await tokenManager.refreshSession(mockSession);

            expect(newToken).toBe('new_token');
            expect(SecureStore.setItemAsync).toHaveBeenCalled();
        });

        it('should clear session on refresh failure', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'old_token',
                    refreshToken: 'invalid_refresh',
                    expiresAt: Date.now() - 1000,
                    expiresIn: 3600,
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                authMethod: 'google' as const,
                isSubscribed: false,
                lastVerification: Date.now(),
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ error: 'invalid_grant' }),
            });

            const newToken = await tokenManager.refreshSession(mockSession);

            expect(newToken).toBeNull();
            expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        });

        it('should return null if no refresh token', async () => {
            const mockSession = {
                tokenData: {
                    accessToken: 'old_token',
                    expiresAt: Date.now() + 3600000,
                    expiresIn: 3600,
                    // No refreshToken
                },
                userData: { id: 'user_123', email: 'test@example.com', name: 'Test User' },
                authMethod: 'google' as const,
                isSubscribed: false,
                lastVerification: Date.now(),
            };

            const newToken = await tokenManager.refreshSession(mockSession);

            expect(newToken).toBeNull();
        });
    });

    describe('clearSession', () => {
        it('should clear all session data from SecureStore', async () => {
            await tokenManager.clearSession();

            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_auth_token');
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_user_data');
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_last_verification');
        });
    });

    describe('isSessionValid', () => {
        it('should return true for valid session', async () => {
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                expiresAt: Date.now() + 3600000,
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const isValid = await tokenManager.isSessionValid();

            expect(isValid).toBe(true);
        });

        it('should return false when no session', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);
            AsyncStorage.getItem.mockResolvedValue(null);

            const isValid = await tokenManager.isSessionValid();

            expect(isValid).toBe(false);
        });
    });

    describe('getSessionRemainingDays', () => {
        it('should return correct remaining days', async () => {
            const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                expiresAt: Date.now() + fifteenDaysMs,
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const days = await tokenManager.getSessionRemainingDays();

            expect(days).toBe(15);
        });

        it('should return 0 for expired session', async () => {
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                expiresAt: Date.now() - 1000,
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            const days = await tokenManager.getSessionRemainingDays();

            expect(days).toBeNull();
        });

        it('should return null when no session', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);
            AsyncStorage.getItem.mockResolvedValue(null);

            const days = await tokenManager.getSessionRemainingDays();

            expect(days).toBeNull();
        });
    });

    describe('migrateLegacySession', () => {
        it('should migrate valid legacy session from AsyncStorage', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);

            const legacySession = {
                tokenData: {
                    accessToken: 'legacy_token',
                    refreshToken: 'legacy_refresh',
                    expiresAt: Date.now() + 3600000,
                },
                userData: { id: 'user_123', email: 'test@example.com' },
                isSubscribed: true,
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            };

            AsyncStorage.getItem.mockResolvedValue(JSON.stringify(legacySession));

            const session = await tokenManager.getStoredSession();

            expect(session).not.toBeNull();
            expect(SecureStore.setItemAsync).toHaveBeenCalled();
            expect(AsyncStorage.multiRemove).toHaveBeenCalled();
        });

        it('should discard expired legacy session', async () => {
            SecureStore.getItemAsync.mockResolvedValue(null);

            const legacySession = {
                tokenData: { accessToken: 'legacy_token' },
                expiresAt: Date.now() - 1000, // Expired
            };

            AsyncStorage.getItem.mockResolvedValue(JSON.stringify(legacySession));

            const session = await tokenManager.getStoredSession();

            expect(session).toBeNull();
            expect(AsyncStorage.multiRemove).toHaveBeenCalled();
        });
    });

    describe('extendSession', () => {
        it('should extend session by 30 days', async () => {
            const mockSession = {
                tokenData: { accessToken: 'token_123' },
                expiresAt: Date.now() + (5 * 24 * 60 * 60 * 1000), // 5 days remaining
            };

            SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockSession));

            await tokenManager.extendSession();

            const updatedData = JSON.parse(SecureStore.setItemAsync.mock.calls[0][1]);
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const expectedExpiry = Date.now() + thirtyDaysMs;

            expect(updatedData.expiresAt).toBeCloseTo(expectedExpiry, -3);
        });
    });
});

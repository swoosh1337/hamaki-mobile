/**
 * Token Manager Service
 * 
 * Handles secure storage, retrieval, and refreshing of authentication tokens.
 * Supports both Google OAuth and Supabase Magic Link sessions.
 */

import type { AuthMethod, StoredUserSession, TokenData } from '@/types';
import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const log = createLogger('Auth:Token');

// Storage keys
const STORAGE_KEY = "hamaki_auth_token";
const USER_DATA_KEY = "hamaki_user_data";
const LAST_VERIFICATION_KEY = "hamaki_last_verification";

// OAuth constant for refresh
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Session duration: 30 days in milliseconds
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Token manager for session persistence and refresh logic
 */
export const tokenManager = {
    /**
     * Get the correct Google Client ID based on platform
     */
    getClientId(): string {
        const WEB_CLIENT_ID = "986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com";
        const IOS_CLIENT_ID = "986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com";

        const isIOS = Platform.OS === 'ios';
        return isIOS ? IOS_CLIENT_ID : WEB_CLIENT_ID;
    },

    /**
     * Store session data securely
     * Sessions persist for 30 days by default
     */
    async storeSession(
        tokenData: TokenData,
        userData: any,
        isSubscribed: boolean,
        isPersistent: boolean = true,
        authMethod: AuthMethod = 'google'
    ): Promise<void> {
        try {
            // For persistent sessions, use 30-day expiry
            // For temporary sessions, use 24 hours
            let sessionExpiresAt: number;

            if (isPersistent) {
                // 30 days from now
                sessionExpiresAt = Date.now() + SESSION_DURATION_MS;
            } else {
                // 24 hours for temporary sessions
                sessionExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
            }

            const sessionData: StoredUserSession = {
                tokenData: {
                    ...tokenData,
                    expiresAt: tokenData.expiresAt, // Keep original token expiry for refresh logic
                },
                userData,
                isSubscribed,
                lastVerification: Date.now(),
                authMethod,
                // Legacy fields for backward compatibility
                token: tokenData.accessToken,
                expiresAt: sessionExpiresAt, // Session-level expiry (30 days)
            };

            await Promise.all([
                SecureStore.setItemAsync(STORAGE_KEY, tokenData.accessToken),
                SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData)),
                SecureStore.setItemAsync(LAST_VERIFICATION_KEY, Date.now().toString()),
            ]);

            log.info(`Session stored (${authMethod}) - ${isPersistent ? '30 days' : '24 hours'}`);
        } catch (error) {
            log.error('Error storing user session', error);
            throw error;
        }
    },

    /**
     * Get stored session data
     */
    async getStoredSession(): Promise<StoredUserSession | null> {
        try {
            const sessionDataString = await SecureStore.getItemAsync(USER_DATA_KEY);

            if (sessionDataString) {
                const sessionData: StoredUserSession = JSON.parse(sessionDataString);

                // Check if session has expired (30-day session expiry)
                if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
                    log.info('Session expired (30-day limit reached), clearing...');
                    await this.clearSession();
                    return null;
                }

                // Ensure authMethod exists (backward compatibility)
                if (!sessionData.authMethod) {
                    sessionData.authMethod = 'google';
                }

                return sessionData;
            }

            // Try to migrate from legacy AsyncStorage if needed
            return await this.migrateLegacySession();
        } catch (error) {
            log.error('Error getting stored user session', error);
            return null;
        }
    },

    /**
     * Get a valid access token, refreshing if necessary
     * Returns null if token cannot be obtained (session expired)
     */
    async getValidAccessToken(): Promise<string | null> {
        try {
            const sessionData = await this.getStoredSession();
            if (!sessionData) return null;

            const { tokenData, authMethod } = sessionData;
            const now = Date.now();
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

            // If token is still valid (with buffer), return it
            if (tokenData.expiresAt > now + bufferTime) {
                return tokenData.accessToken;
            }

            // Token expired - attempt refresh based on auth method
            if (authMethod === 'magic_link') {
                // For Supabase, let authService handle refresh
                // Return null to trigger re-auth check
                log.info('Supabase token needs refresh');
                return null;
            }

            // For Google OAuth, use refresh token
            if (tokenData.refreshToken) {
                return await this.refreshSession(sessionData);
            }

            // No valid token and no refresh token
            log.warn('No valid token or refresh token available');
            return null;
        } catch (error) {
            log.error('Error getting valid access token', error);
            return null;
        }
    },

    /**
     * Refresh a Google OAuth session
     */
    async refreshSession(sessionData: StoredUserSession): Promise<string | null> {
        if (!sessionData.tokenData.refreshToken) return null;

        try {
            log.info('Refreshing Google access token...');

            const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    client_id: this.getClientId(),
                    refresh_token: sessionData.tokenData.refreshToken,
                    grant_type: "refresh_token",
                }).toString(),
            });

            const data = await response.json();

            if (!response.ok) {
                log.error('Token refresh failed', data);
                await this.clearSession();
                return null;
            }

            const now = Date.now();
            const expiresIn = data.expires_in || 3600;

            const newTokenData: TokenData = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || sessionData.tokenData.refreshToken,
                expiresIn,
                expiresAt: now + (expiresIn * 1000),
                tokenType: data.token_type || 'Bearer',
            };

            // Update stored session (keep existing session expiry)
            sessionData.tokenData = newTokenData;
            sessionData.token = newTokenData.accessToken; // Legacy field
            await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));

            log.info('Google token refreshed successfully');
            return newTokenData.accessToken;
        } catch (error) {
            log.error('Failed to refresh Google token', error);
            await this.clearSession();
            return null;
        }
    },

    /**
     * Clear session data
     */
    async clearSession(): Promise<void> {
        try {
            await Promise.all([
                SecureStore.deleteItemAsync(STORAGE_KEY),
                SecureStore.deleteItemAsync(USER_DATA_KEY),
                SecureStore.deleteItemAsync(LAST_VERIFICATION_KEY),
            ]);
            log.info('Session cleared');
        } catch (error) {
            log.error('Error clearing user session', error);
        }
    },

    /**
     * Check if session is valid and not expired
     */
    async isSessionValid(): Promise<boolean> {
        const session = await this.getStoredSession();
        return session !== null;
    },

    /**
     * Get session remaining time in days
     */
    async getSessionRemainingDays(): Promise<number | null> {
        const session = await this.getStoredSession();
        if (!session || !session.expiresAt) return null;

        const remainingMs = session.expiresAt - Date.now();
        if (remainingMs <= 0) return 0;

        return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    },

    /**
     * Migrate legacy AsyncStorage session to SecureStore
     */
    async migrateLegacySession(): Promise<StoredUserSession | null> {
        try {
            const legacySessionString = await AsyncStorage.getItem(USER_DATA_KEY);
            if (!legacySessionString) return null;

            const legacySession: StoredUserSession = JSON.parse(legacySessionString);

            // Cleanup legacy session if expired
            if (legacySession.expiresAt && Date.now() > legacySession.expiresAt) {
                await AsyncStorage.multiRemove([STORAGE_KEY, USER_DATA_KEY, LAST_VERIFICATION_KEY]);
                return null;
            }

            log.info('Migrating legacy session to SecureStore...');

            // Ensure authMethod exists
            if (!legacySession.authMethod) {
                legacySession.authMethod = 'google';
            }

            // Store in SecureStore with 30-day expiry from now
            await this.storeSession(
                legacySession.tokenData,
                legacySession.userData,
                legacySession.isSubscribed,
                true,
                legacySession.authMethod
            );

            // Clean up AsyncStorage
            await AsyncStorage.multiRemove([STORAGE_KEY, USER_DATA_KEY, LAST_VERIFICATION_KEY]);

            return legacySession;
        } catch (error) {
            log.error('Error migrating legacy session', error);
            return null;
        }
    },

    /**
     * Update last verification time
     */
    async updateLastVerification(): Promise<void> {
        try {
            const sessionData = await this.getStoredSession();
            if (sessionData) {
                sessionData.lastVerification = Date.now();
                await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));
            }
            await SecureStore.setItemAsync(LAST_VERIFICATION_KEY, Date.now().toString());
        } catch (error) {
            log.error('Error updating last verification', error);
        }
    },

    /**
     * Extend session duration (reset 30-day timer)
     */
    async extendSession(): Promise<void> {
        try {
            const sessionData = await this.getStoredSession();
            if (sessionData) {
                sessionData.expiresAt = Date.now() + SESSION_DURATION_MS;
                await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));
                log.info('Session extended by 30 days');
            }
        } catch (error) {
            log.error('Error extending session', error);
        }
    }
};

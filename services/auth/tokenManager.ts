/**
 * Token Manager Service
 * 
 * Handles secure storage, retrieval, and refreshing of authentication tokens.
 */

import type { StoredUserSession, TokenData } from '@/types';
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

/**
 * Token manager for session persistence and refresh logic
 */
export const tokenManager = {
    /**
     * Get the correct Google Client ID based on platform
     */
    getClientId(): string {
        // These should ideally come from constants or env
        const WEB_CLIENT_ID = "986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com";
        const IOS_CLIENT_ID = "986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com";

        // Check if running in Expo Go or standalone
        // For this refactor, we'll use a simplified version of the logic in utils/auth.ts
        const isIOS = Platform.OS === 'ios';
        return isIOS ? IOS_CLIENT_ID : WEB_CLIENT_ID;
    },

    /**
     * Store session data securely
     */
    async storeSession(
        tokenData: TokenData,
        userData: any,
        isSubscribed: boolean,
        isPersistent: boolean = true
    ): Promise<void> {
        try {
            // Calculate expiry based on persistence choice
            let sessionExpiresAt = tokenData.expiresAt;
            if (!isPersistent) {
                // For temporary sessions, expire in 24 hours
                sessionExpiresAt = Math.min(tokenData.expiresAt, Date.now() + 24 * 60 * 60 * 1000);
            }

            const sessionData: StoredUserSession = {
                tokenData: {
                    ...tokenData,
                    expiresAt: sessionExpiresAt,
                },
                userData,
                isSubscribed,
                lastVerification: Date.now(),
                // Legacy fields for backward compatibility
                token: tokenData.accessToken,
                expiresAt: sessionExpiresAt,
            };

            await Promise.all([
                SecureStore.setItemAsync(STORAGE_KEY, tokenData.accessToken),
                SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData)),
                SecureStore.setItemAsync(LAST_VERIFICATION_KEY, Date.now().toString()),
            ]);

            log.info(`Session stored ${isPersistent ? 'persistently' : 'temporarily'}`);
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

                // Check if session has expired
                if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
                    log.info('Session expired, clearing...');
                    await this.clearSession();
                    return null;
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
     */
    async getValidAccessToken(): Promise<string | null> {
        try {
            const sessionData = await this.getStoredSession();
            if (!sessionData) return null;

            const { tokenData } = sessionData;
            const now = Date.now();
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

            // If token is still valid (with buffer), return it
            if (tokenData.expiresAt > now + bufferTime) {
                return tokenData.accessToken;
            }

            // If we have a refresh token, use it
            if (tokenData.refreshToken) {
                return await this.refreshSession(sessionData);
            }

            // No valid token and no refresh token
            return null;
        } catch (error) {
            log.error('Error getting valid access token', error);
            return null;
        }
    },

    /**
     * Refresh a dynamic session
     */
    async refreshSession(sessionData: StoredUserSession): Promise<string | null> {
        if (!sessionData.tokenData.refreshToken) return null;

        try {
            log.info('Refreshing access token...');

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

            // Update stored session
            sessionData.tokenData = newTokenData;
            sessionData.token = newTokenData.accessToken; // Legacy field
            await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));

            log.info('Token refreshed successfully');
            return newTokenData.accessToken;
        } catch (error) {
            log.error('Failed to refresh token', error);
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
        } catch (error) {
            log.error('Error clearing user session', error);
        }
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

            // Store in SecureStore
            await this.storeSession(
                legacySession.tokenData,
                legacySession.userData,
                legacySession.isSubscribed,
                true
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
    }
};

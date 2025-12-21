/**
 * Auth Service
 * 
 * Handles main authentication flows, YouTube subscription checks,
 * and background verification.
 */

import type { AuthResult, TokenData } from '@/types';
import { createLogger } from '@/utils/logger';
import * as AuthSession from "expo-auth-session";
import Constants from 'expo-constants';
import { Platform } from "react-native";
import { tokenManager } from './tokenManager';

const log = createLogger('Auth:Flow');

// OAuth configuration
const WEB_CLIENT_ID = "986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com";
const IOS_CLIENT_ID = "986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com";
const HAMAKI_CHANNEL_ID = "UCSI5XbaxsX1USijrfFVuJqA";
const EXPO_PROXY_BASE = 'https://auth.expo.io/@igrigolia1/hamaki';

// Detect environment
const isExpoGo = (Constants?.appOwnership === 'expo') || (Constants as any)?.executionEnvironment === 'storeClient';
const CLIENT_ID = isExpoGo ? WEB_CLIENT_ID : (Platform.OS === "ios" ? IOS_CLIENT_ID : WEB_CLIENT_ID);

// Google OAuth Discovery
const discovery = {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

/**
 * Main service for authentication and subscription verification
 */
export const authService = {
    /**
     * Authenticate with Google and check subscriptions
     */
    async authenticate(): Promise<AuthResult> {
        try {
            // 1. Setup redirect URI
            const returnUrl = AuthSession.getDefaultReturnUrl();
            const redirectUri = isExpoGo
                ? `${EXPO_PROXY_BASE}?returnUrl=${encodeURIComponent(returnUrl)}`
                : AuthSession.makeRedirectUri({
                    native: "com.googleusercontent.apps.986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3:/oauth2redirect/google",
                });

            log.debug('Starting OAuth with Redirect URI', { redirectUri });

            // 2. Create and prepare auth request
            const request = new AuthSession.AuthRequest({
                clientId: CLIENT_ID,
                responseType: AuthSession.ResponseType.Code,
                scopes: [
                    "profile",
                    "email",
                    "https://www.googleapis.com/auth/youtube.readonly",
                    "https://www.googleapis.com/auth/youtube.force-ssl",
                ],
                redirectUri,
                usePKCE: true,
                extraParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            });

            // 3. Prompt user for authentication
            const result = await request.promptAsync(discovery, {
                useProxy: isExpoGo,
                showInRecents: false,
                dismissButtonStyle: 'done',
            } as any);

            if (result.type !== 'success') {
                const errorMsg = result.type === 'error' ? result.error?.message : `Authentication ${result.type}`;
                log.warn('OAuth failed or cancelled', { type: result.type });
                return { success: false, error: errorMsg || 'Authentication failed' };
            }

            const { code } = result.params;
            if (!request.codeVerifier) throw new Error("PKCE code verifier not found");

            // 4. Exchange code for tokens
            const tokenData = await this.exchangeCodeForTokens(code, request.redirectUri, request.codeVerifier);

            // 5. Fetch user profile from Google
            const userData = await this.fetchGoogleUserInfo(tokenData.accessToken);

            // 6. Check YouTube subscription status
            const isSubscribed = await this.verifyYouTubeSubscription(tokenData.accessToken);

            // 7. Check multi-channel subscriptions (if available)
            let allChannelSubscriptions = null;
            try {
                const { checkAllChannelSubscriptions } = await import('@/utils/channelSubscriptions');
                allChannelSubscriptions = await checkAllChannelSubscriptions(tokenData.accessToken);
            } catch (err) {
                log.warn('Failed to check multi-channel subscriptions', err);
            }

            return {
                success: true,
                isSubscribed,
                token: tokenData.accessToken,
                userData,
                tokenData,
                allChannelSubscriptions,
            };
        } catch (error) {
            log.error('Authentication error', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown authentication error",
            };
        }
    },

    /**
     * Exchange OAuth code for tokens
     */
    async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier: string): Promise<TokenData> {
        const response = await fetch(discovery.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: CLIENT_ID,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
                code_verifier: codeVerifier,
            }).toString(),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error_description || "Token exchange failed");

        const now = Date.now();
        const expiresIn = data.expires_in || 3600;

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn,
            expiresAt: now + (expiresIn * 1000),
            tokenType: data.token_type || 'Bearer',
        };
    },

    /**
     * Fetch user info from Google
     */
    async fetchGoogleUserInfo(accessToken: string): Promise<any> {
        const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();
        if (!response.ok) throw new Error("Failed to fetch Google user info");
        return data;
    },

    /**
     * Verify YouTube subscription to the main Hamaki channel
     */
    async verifyYouTubeSubscription(accessToken: string): Promise<boolean> {
        try {
            let nextPageToken: string | undefined = undefined;

            do {
                const response: Response = await fetch(
                    `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );

                const data: any = await response.json();
                if (!response.ok) throw new Error(`${response.status}: ${data.error?.message || "YouTube API error"}`);

                const found = data.items?.some((item: any) => item.snippet?.resourceId?.channelId === HAMAKI_CHANNEL_ID);
                if (found) return true;

                nextPageToken = data.nextPageToken;
            } while (nextPageToken);

            return false;
        } catch (error) {
            log.error('YouTube subscription check error', error);
            throw error;
        }
    },

    /**
     * Load existing session from storage
     */
    async loadSavedSession(): Promise<AuthResult> {
        try {
            const session = await tokenManager.getStoredSession();
            if (!session) return { success: false, error: "No session found" };

            // Background verification if needed
            this.triggerBackgroundVerification(session);

            return {
                success: true,
                isSubscribed: session.isSubscribed,
                token: session.tokenData.accessToken,
                userData: session.userData,
                fromCache: true,
            };
        } catch (error) {
            log.error('Error loading saved session', error);
            return { success: false, error: "Failed to load session" };
        }
    },

    /**
     * Trigger background verification of subscription if enough time has passed
     */
    async triggerBackgroundVerification(session: any): Promise<boolean> {
        const VERIFICATION_INTERVAL = 24 * 60 * 60 * 1000;
        const timeSinceLast = Date.now() - session.lastVerification;

        if (timeSinceLast > VERIFICATION_INTERVAL) {
            log.info('Performing background verification...');
            try {
                const token = await tokenManager.getValidAccessToken();
                if (!token) return false;

                const isSubscribed = await this.verifyYouTubeSubscription(token);

                // Update session
                session.isSubscribed = isSubscribed;
                session.lastVerification = Date.now();
                await tokenManager.storeSession(session.tokenData, session.userData, isSubscribed, true);
                return true;
            } catch (err) {
                log.warn('Background verification failed', err);
                throw err;
            }
        }
        return true; // No verification needed = success
    }
};

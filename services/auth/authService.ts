/**
 * Auth Service
 * 
 * Handles authentication flows:
 * - Google OAuth
 * - Email Magic Link (Supabase)
 * - YouTube subscription checks (optional, non-blocking)
 * - Session management
 */

import { supabase } from '@/services/supabase/client';
import type { AuthMethod, AuthResult, EmailValidationResult, MagicLinkResult, TokenData } from '@/types';
import { isNetworkError } from '@/utils/errorHandling';
import { createLogger } from '@/utils/logger';
import * as AuthSession from "expo-auth-session";
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from "react-native";
import { rememberMeService } from './rememberMeService';
import { tokenManager } from './tokenManager';

const log = createLogger('Auth:Flow');

// OAuth configuration
const WEB_CLIENT_ID = "986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com";
const IOS_CLIENT_ID = "986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com";
const HAMAKI_CHANNEL_ID = "UCSI5XbaxsX1USijrfFVuJqA";
const EXPO_PROXY_BASE = 'https://auth.expo.io/@igrigolia1/hamaki';

/**
 * Generate the redirect URL based on environment.
 * In Expo Go, it will be exp://...
 * In dev/prod builds, it will be hamaki://...
 */
const MAGIC_LINK_REDIRECT_URL = Linking.createURL('auth/callback');

log.info('Auth Configuration initialized', { redirectUrl: MAGIC_LINK_REDIRECT_URL });

// Detect environment
const isExpoGo = (Constants?.appOwnership === 'expo') || (Constants as any)?.executionEnvironment === 'storeClient';
const CLIENT_ID = isExpoGo ? WEB_CLIENT_ID : (Platform.OS === "ios" ? IOS_CLIENT_ID : WEB_CLIENT_ID);

// Google OAuth Discovery
const discovery = {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

// Email validation regex (RFC 5322 compliant)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Main service for authentication and subscription verification
 */
export const authService = {
    /**
     * Validate email format
     */
    validateEmail(email: string): EmailValidationResult {
        if (!email || typeof email !== 'string') {
            return { isValid: false, error: 'Email is required' };
        }

        const trimmedEmail = email.trim().toLowerCase();

        if (trimmedEmail.length === 0) {
            return { isValid: false, error: 'Email cannot be empty' };
        }

        if (!EMAIL_REGEX.test(trimmedEmail)) {
            return { isValid: false, error: 'Invalid email format' };
        }

        return { isValid: true };
    },

    /**
     * Send magic link email via Supabase
     */
    async signInWithMagicLink(email: string): Promise<MagicLinkResult> {
        try {
            // Validate email first
            const validation = this.validateEmail(email);
            if (!validation.isValid) {
                log.warn('Magic link rejected: invalid email', { email });
                return { success: false, error: validation.error };
            }

            const trimmedEmail = email.trim().toLowerCase();
            log.info('Sending magic link...', { email: trimmedEmail });

            const { error } = await supabase.auth.signInWithOtp({
                email: trimmedEmail,
                options: {
                    emailRedirectTo: MAGIC_LINK_REDIRECT_URL,
                    // Allow new users to sign up via magic link
                    // Customize your Supabase email template to show "Magic Link" branding
                    shouldCreateUser: true,
                },
            });

            if (error) {
                log.error('Magic link send failed', error);
                // Check for rate limiting (case-insensitive)
                if (error.message?.toLowerCase().includes('rate limit')) {
                    return {
                        success: false,
                        error: 'ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ მოგვიანებით.'
                    };
                }
                return {
                    success: false,
                    error: error.message || 'ბმულის გაგზავნა ვერ მოხერხდა'
                };
            }

            log.info('Magic link sent successfully', { email: trimmedEmail });
            return {
                success: true,
                message: 'შეამოწმე ელფოსტა!'
            };
        } catch (error) {
            log.error('Magic link error', error);

            // Check if it's a network error
            if (isNetworkError(error)) {
                return {
                    success: false,
                    error: 'ინტერნეტთან კავშირი ვერ მოხერხდა. შეამოწმე კავშირი და სცადე თავიდან.'
                };
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : 'უცნობი შეცდომა'
            };
        }
    },

    /**
     * Handle magic link callback from deep link
     * Called when user clicks the magic link and app opens
     */
    async handleMagicLinkCallback(url: string): Promise<AuthResult> {
        try {
            log.info('Processing magic link callback...', { url });

            // Parse the URL to extract tokens
            const params = this.parseDeepLinkParams(url);

            if (params.error) {
                log.error('Magic link error in URL', { error: params.error });
                return { success: false, error: params.error_description || params.error };
            }

            // Check if we have the access token (hash fragment)
            if (params.access_token && params.refresh_token) {
                // Set the session in Supabase client
                const { data, error } = await supabase.auth.setSession({
                    access_token: params.access_token,
                    refresh_token: params.refresh_token,
                });

                if (error) {
                    log.error('Failed to set Supabase session', error);
                    return { success: false, error: error.message };
                }

                if (!data.session || !data.user) {
                    return { success: false, error: 'No session returned from Supabase' };
                }

                const supabaseUser = data.user;
                const session = data.session;

                // Create token data for storage
                const tokenData: TokenData = {
                    accessToken: session.access_token,
                    refreshToken: session.refresh_token,
                    expiresIn: session.expires_in || 3600,
                    expiresAt: (session.expires_at || 0) * 1000, // Convert to ms
                    tokenType: session.token_type || 'Bearer',
                };

                // Create user data
                const userData = {
                    id: supabaseUser.id,
                    email: supabaseUser.email || '',
                    name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || '',
                    picture: supabaseUser.user_metadata?.avatar_url,
                };

                // Get the user's remember me preference
                const preference = await rememberMeService.getPreference(userData.email);
                const shouldStaySignedIn = preference?.rememberMe ?? true;

                log.info('Magic link authentication successful', {
                    email: userData.email,
                    rememberMe: shouldStaySignedIn
                });

                return {
                    success: true,
                    userData,
                    tokenData,
                    isSubscribed: false, // Magic link users start without subscription
                    authMethod: 'magic_link' as AuthMethod,
                    rememberMe: shouldStaySignedIn,
                };
            }

            // If no tokens in URL, try to get session from Supabase
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !sessionData.session) {
                log.warn('No session found after magic link callback');
                return { success: false, error: 'Authentication failed - no session' };
            }

            const session = sessionData.session;
            const user = session.user;

            const tokenData: TokenData = {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresIn: session.expires_in || 3600,
                expiresAt: (session.expires_at || 0) * 1000,
                tokenType: session.token_type || 'Bearer',
            };

            const userData = {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                picture: user.user_metadata?.avatar_url,
            };

            // Get the user's remember me preference
            const preference = await rememberMeService.getPreference(userData.email);
            const shouldStaySignedIn = preference?.rememberMe ?? true;

            return {
                success: true,
                userData,
                tokenData,
                isSubscribed: false,
                authMethod: 'magic_link' as AuthMethod,
                rememberMe: shouldStaySignedIn,
            };
        } catch (error) {
            log.error('Magic link callback error', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process magic link'
            };
        }
    },

    /**
     * Parse deep link URL parameters (including hash fragment)
     */
    parseDeepLinkParams(url: string): Record<string, string> {
        const params: Record<string, string> = {};

        try {
            // Parse both query string and hash fragment
            const urlObj = new URL(url);

            // Get query params
            urlObj.searchParams.forEach((value, key) => {
                params[key] = value;
            });

            // Get hash fragment params (Supabase sends tokens in hash)
            if (urlObj.hash) {
                const hashParams = new URLSearchParams(urlObj.hash.substring(1));
                hashParams.forEach((value, key) => {
                    params[key] = value;
                });
            }
        } catch (e) {
            // Fallback for non-standard URLs
            const hashIndex = url.indexOf('#');
            if (hashIndex !== -1) {
                const hashPart = url.substring(hashIndex + 1);
                const hashParams = new URLSearchParams(hashPart);
                hashParams.forEach((value, key) => {
                    params[key] = value;
                });
            }
        }

        return params;
    },

    /**
     * Get the current Supabase session
     */
    async getSupabaseSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            log.error('Error getting Supabase session', error);
            return null;
        }
        return data.session;
    },

    /**
     * Refresh Supabase session
     */
    async refreshSupabaseSession(): Promise<AuthResult> {
        try {
            const { data, error } = await supabase.auth.refreshSession();

            if (error) {
                log.error('Supabase session refresh failed', error);
                return { success: false, error: error.message };
            }

            if (!data.session || !data.user) {
                return { success: false, error: 'No session after refresh' };
            }

            const session = data.session;
            const user = data.user;

            const tokenData: TokenData = {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresIn: session.expires_in || 3600,
                expiresAt: (session.expires_at || 0) * 1000,
                tokenType: session.token_type || 'Bearer',
            };

            const userData = {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                picture: user.user_metadata?.avatar_url,
            };

            return {
                success: true,
                userData,
                tokenData,
                authMethod: 'magic_link' as AuthMethod,
            };
        } catch (error) {
            log.error('Supabase session refresh error', error);
            return { success: false, error: 'Session refresh failed' };
        }
    },

    /**
     * Sign out from Supabase
     */
    async signOutSupabase(): Promise<void> {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                log.error('Supabase sign out error', error);
            }
        } catch (error) {
            log.error('Error signing out from Supabase', error);
        }
    },

    /**
     * Authenticate with Google and check subscriptions (existing flow)
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

            // NOTE: Subscription checks are now done in background AFTER login completes
            // See AuthContext.performBackgroundChecks() for the background verification flow
            // This allows the user to immediately access the app without waiting

            return {
                success: true,
                isSubscribed: false, // Will be verified in background
                token: tokenData.accessToken,
                userData,
                tokenData,
                allChannelSubscriptions: null, // Will be checked in background
                authMethod: 'google' as AuthMethod,
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
     * Verify YouTube subscription via Edge Function
     * Called once on login, then only manual verification
     * ✅ Uses Edge Function (no client-side YouTube API)
     */
    async verifyYouTubeSubscription(accessToken: string, userId?: string): Promise<boolean> {
        try {
            // If no userId provided, we can't call Edge Function - skip
            if (!userId) {
                log.warn('No userId provided for subscription verification');
                return true;
            }

            const channels = [
                { channelId: HAMAKI_CHANNEL_ID, channelKey: 'hamaki' },
            ];

            const { data, error } = await supabase.functions.invoke('verify-subscriptions', {
                body: { channels, userId },
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (error) {
                log.warn('Edge Function error during login verification', error);
                return true; // Don't block login
            }

            const hamakiResult = data?.results?.find((r: any) => r.channelKey === 'hamaki');
            return hamakiResult?.subscribed ?? true;
        } catch (error) {
            log.warn('Subscription verification failed', error);
            return true; // Don't block login on error
        }
    },

    /**
     * Load existing session from storage
     */
    async loadSavedSession(): Promise<AuthResult> {
        try {
            const session = await tokenManager.getStoredSession();
            if (!session) return { success: false, error: "No session found" };

            // For magic link sessions, check Supabase session validity
            if (session.authMethod === 'magic_link') {
                const supabaseSession = await this.getSupabaseSession();
                if (!supabaseSession) {
                    log.info('Supabase session expired, attempting refresh...');
                    const refreshResult = await this.refreshSupabaseSession();
                    if (!refreshResult.success) {
                        await tokenManager.clearSession();
                        return { success: false, error: 'Session expired' };
                    }
                    // Update stored session with new tokens
                    if (refreshResult.tokenData) {
                        await tokenManager.storeSession(
                            refreshResult.tokenData,
                            session.userData,
                            session.isSubscribed,
                            true,
                            'magic_link'
                        );
                    }
                }
            }

            // For Google sessions, background verification if needed
            if (session.authMethod === 'google') {
                this.triggerBackgroundVerification(session);
            }

            return {
                success: true,
                isSubscribed: session.isSubscribed,
                token: session.tokenData.accessToken,
                userData: session.userData,
                fromCache: true,
                authMethod: session.authMethod,
            };
        } catch (error) {
            log.error('Error loading saved session', error);
            return { success: false, error: "Failed to load session" };
        }
    },

    /**
     * Trigger background verification of subscription if enough time has passed
     * Only applies to Google OAuth sessions
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
                await tokenManager.storeSession(
                    session.tokenData,
                    session.userData,
                    isSubscribed,
                    true,
                    session.authMethod || 'google'
                );
                return true;
            } catch (err) {
                log.warn('Background verification failed', err);
                // Don't throw - background verification failure is non-fatal
                return false;
            }
        }
        return true; // No verification needed = success
    }
};

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

// Constants

// Register the redirect URI for your app
WebBrowser.maybeCompleteAuthSession();

// OAuth client IDs
const WEB_CLIENT_ID =
  "986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com"; // existing web / dev
const IOS_CLIENT_ID =
  "986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com"; // new iOS client

// Helper: choose correct client ID (back to original iOS-only approach)
const CLIENT_ID = Platform?.OS === "ios" ? IOS_CLIENT_ID : WEB_CLIENT_ID;
const HAMAKI_CHANNEL_ID = "UCSI5XbaxsX1USijrfFVuJqA";
const STORAGE_KEY = "hamaki_auth_token";
const USER_DATA_KEY = "hamaki_user_data";
const LAST_VERIFICATION_KEY = "hamaki_last_verification";
const VERIFICATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Configure the discovery document for Google
const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

/**
 * Interface for authentication result
 */
export interface AuthResult {
  success: boolean;
  isSubscribed?: boolean;
  token?: string;
  error?: string;
  userData?: any;
  fromCache?: boolean; // Indicates if loaded from persistent storage
  tokenData?: TokenData; // Include full token data for new auth flows
}

/**
 * Interface for token data with refresh capability
 */
export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: number;
  tokenType?: string;
}

/**
 * Interface for stored user session data
 */
export interface StoredUserSession {
  tokenData: TokenData;
  userData: any;
  isSubscribed: boolean;
  lastVerification: number;
  
  // Legacy support - will be migrated to tokenData.accessToken
  token?: string;
  expiresAt?: number;
}

/**
 * Authenticate with Google and check YouTube subscription
 */
export async function authenticateWithGoogle(): Promise<AuthResult> {
  try {
    // Use original working redirect URI for iOS client
    const redirectUri = AuthSession.makeRedirectUri({
      native:
        "com.googleusercontent.apps.986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3:/oauth2redirect/google",
    });

    console.log("🔍 OAuth Debug Info:");
    console.log("Platform:", Platform?.OS);
    console.log("Client ID:", CLIENT_ID);
    console.log("Redirect URI:", redirectUri);

    // Create the auth request
    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      scopes: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      redirectUri,
      usePKCE: true,
      // Use extraParams for provider-specific params
      extraParams: {
        access_type: 'offline', // Request refresh token
        prompt: 'consent', // Force consent screen for reliable refresh tokens
      },
    });

    const result = await request.promptAsync(discovery);

    if (result.type === "success") {
      if (!request.codeVerifier) {
        throw new Error("PKCE code verifier not found");
      }

      // Exchange the code for tokens, including the code verifier
      const tokenData = await exchangeCodeForToken(
        result.params.code,
        request.redirectUri,
        request.codeVerifier,
      );

      if (!tokenData.accessToken) {
        return { success: false, error: "Failed to obtain access token" };
      }

      // Get user info to verify the account
      const userData = await getUserInfo(tokenData.accessToken);
      console.log("Authenticated with Google account:", userData.email);
      
      if (tokenData.refreshToken) {
        console.log("Refresh token obtained - user can stay logged in long-term");
      } else {
        console.log("No refresh token - user may need to re-authenticate sooner");
      }

      const isSubscribed = await checkYouTubeSubscription(tokenData.accessToken);

      // Don't store session here - let AuthContext handle it after Remember Me choice
      // Return token data for AuthContext to use
      return {
        success: true,
        isSubscribed,
        token: tokenData.accessToken,
        userData,
        tokenData, // Include full token data
      };
    } else {
      return {
        success: false,
        error: "Authentication was cancelled or failed",
      };
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown authentication error",
    };
  }
}

/**
 * Diagnostic: Get all channels owned by the authenticated user.
 */
async function getUserInfo(accessToken: string): Promise<any> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const userData = await response.json();
    if (!response.ok) {
      console.error("Google user info error:", userData);
      throw new Error("Failed to fetch user info");
    }
    return userData;
  } catch (error) {
    console.error("Get user info error:", error);
    throw error;
  }
}

/**
 * Exchange authorization code for access token and refresh token
 */
async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TokenData> {
  try {
    const tokenResult = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier, // Send the PKCE code verifier
      }).toString(),
    });

    const tokenData = await tokenResult.json();
    
    if (!tokenResult.ok) {
      console.error("Token exchange error:", tokenData);
      throw new Error(tokenData.error_description || tokenData.error || "Token exchange failed");
    }

    if (!tokenData.access_token) {
      console.error("Google token response:", tokenData);
      throw new Error("No access token returned");
    }

    const now = Date.now();
    const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour if not provided
    
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token, // Will be undefined for existing users, present for new ones
      expiresIn,
      expiresAt: now + (expiresIn * 1000),
      tokenType: tokenData.token_type || 'Bearer',
    };
  } catch (error) {
    console.error("Token exchange error:", error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  try {
    console.log("Refreshing access token...");
    
    const tokenResult = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    const tokenData = await tokenResult.json();
    
    if (!tokenResult.ok) {
      console.error("Token refresh error:", tokenData);
      throw new Error(tokenData.error_description || tokenData.error || "Token refresh failed");
    }

    if (!tokenData.access_token) {
      console.error("Refresh token response:", tokenData);
      throw new Error("No access token returned from refresh");
    }

    const now = Date.now();
    const expiresIn = tokenData.expires_in || 3600;
    
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep old one
      expiresIn,
      expiresAt: now + (expiresIn * 1000),
      tokenType: tokenData.token_type || 'Bearer',
    };
  } catch (error) {
    console.error("Token refresh error:", error);
    throw error;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData) return null;

    // Check if we have new tokenData format
    if (sessionData.tokenData) {
      const { tokenData } = sessionData;
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
      
      // If token is still valid (with buffer), return it
      if (tokenData.expiresAt > now + bufferTime) {
        return tokenData.accessToken;
      }
      
      // If we have a refresh token, use it
      if (tokenData.refreshToken) {
        try {
          const newTokenData = await refreshAccessToken(tokenData.refreshToken);
          
          // Update stored session with new token data
          sessionData.tokenData = newTokenData;
          await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));
          
          console.log("Token refreshed successfully");
          return newTokenData.accessToken;
        } catch (refreshError) {
          console.error("Failed to refresh token:", refreshError);
          // If refresh fails, clear session and force re-login
          await clearUserSession();
          return null;
        }
      }
    }
    
    // Legacy support: check old token format
    if (sessionData.token && sessionData.expiresAt) {
      const now = Date.now();
      if (sessionData.expiresAt > now) {
        return sessionData.token;
      }
    }
    
    // If we get here, we need fresh authentication
    console.log("No valid token available, authentication required");
    return null;
  } catch (error) {
    console.error("Error getting valid access token:", error);
    return null;
  }
}

/**
 * Check if the user is subscribed to the Hamaki channel
 */
async function checkYouTubeSubscription(accessToken: string): Promise<boolean> {
  try {
    let nextPageToken: string | undefined = undefined;

    do {
      const response: Response = await fetch(
        `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data: any = await response.json();

      if (!response.ok) {
        console.error("YouTube API error:", data);
        // Include the HTTP status code in the error message for better error handling
        throw new Error(`${response.status}: ${data.error?.message || "Failed to fetch subscriptions"}`);
      }

      // Check if the subscription is on the current page
      const isSubscribedOnPage =
        data.items?.some(
          (item: any) =>
            item.snippet?.resourceId?.channelId === HAMAKI_CHANNEL_ID,
        ) || false;

      if (isSubscribedOnPage) {
        return true; // Found it, exit early
      }

      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    // If the loop finishes, the subscription was not found on any page
    return false;
  } catch (error) {
    console.error("Subscription check error:", error);
    throw error;
  }
}

/**
 * Check YouTube subscription with automatic token refresh
 */
export async function checkYouTubeSubscriptionWithRefresh(): Promise<boolean> {
  try {
    let nextPageToken: string | undefined = undefined;

    do {
      const response = await makeAuthenticatedRequest(
        `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("YouTube API error:", data);
        throw new Error(`${response.status}: ${data.error?.message || "Failed to fetch subscriptions"}`);
      }

      // Check if the subscription is on the current page
      const isSubscribedOnPage =
        data.items?.some(
          (item: any) =>
            item.snippet?.resourceId?.channelId === HAMAKI_CHANNEL_ID,
        ) || false;

      if (isSubscribedOnPage) {
        return true; // Found it, exit early
      }

      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return false;
  } catch (error) {
    console.error("Subscription check error:", error);
    throw error;
  }
}

/**
 * Get the stored authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEY);
}

/**
 * Clear the stored authentication token
 */
export async function clearAuthToken(): Promise<void> {
  return SecureStore.deleteItemAsync(STORAGE_KEY);
}

/**
 * Check if the user is already authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const sessionData = await getStoredUserSession();
  return sessionData !== null;
}

/**
 * Store user session data with persistence option
 */
export async function storeUserSessionWithTokens(
  tokenData: TokenData,
  userData: any,
  isSubscribed: boolean,
  isPersistent: boolean = true,
): Promise<void> {
  try {
    // Calculate expiry based on persistence choice
    let sessionExpiresAt = tokenData.expiresAt;
    if (!isPersistent) {
      // For temporary sessions, expire in 24 hours or when app is closed
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
      SecureStore.setItemAsync(STORAGE_KEY, tokenData.accessToken), // Keep legacy storage for old code
      SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData)),
      SecureStore.setItemAsync(LAST_VERIFICATION_KEY, Date.now().toString()),
    ]);
    
    const persistenceMsg = isPersistent ? "persistently" : "temporarily";
    console.log(`Session stored ${persistenceMsg} with expiry:`, new Date(sessionExpiresAt).toISOString());
  } catch (error) {
    console.error("Error storing user session:", error);
  }
}

/**
 * Store user session data persistently (legacy method)
 */
export async function storeUserSession(
  token: string,
  userData: any,
  isSubscribed: boolean,
  isPersistent: boolean = true,
): Promise<void> {
  try {
    // Create TokenData from legacy token
    const tokenData: TokenData = {
      accessToken: token,
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    
    await storeUserSessionWithTokens(tokenData, userData, isSubscribed, isPersistent);
  } catch (error) {
    console.error("Error storing user session:", error);
  }
}

/**
 * Migrate legacy AsyncStorage session to SecureStore
 */
async function migrateLegacySession(): Promise<StoredUserSession | null> {
  try {
    console.log('Checking for legacy AsyncStorage session to migrate...');
    
    // Check if there's already a SecureStore session
    const existingSession = await SecureStore.getItemAsync(USER_DATA_KEY);
    if (existingSession) {
      console.log('SecureStore session already exists, skipping migration');
      return null;
    }
    
    // Try to get legacy session from AsyncStorage
    const legacySessionString = await AsyncStorage.getItem(USER_DATA_KEY);
    if (!legacySessionString) {
      console.log('No legacy session found');
      return null;
    }
    
    const legacySession: StoredUserSession = JSON.parse(legacySessionString);
    
    // Check if legacy session is still valid
    if (legacySession.expiresAt && Date.now() > legacySession.expiresAt) {
      console.log('Legacy session expired, cleaning up...');
      await AsyncStorage.multiRemove([STORAGE_KEY, USER_DATA_KEY, LAST_VERIFICATION_KEY]);
      return null;
    }
    
    console.log('Migrating valid legacy session to SecureStore...');
    
    // Migrate to SecureStore (treat as persistent session for existing users)
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEY, legacySession.token || ''),
      SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(legacySession)),
      SecureStore.setItemAsync(LAST_VERIFICATION_KEY, legacySession.lastVerification.toString()),
    ]);
    
    // Clean up AsyncStorage
    await AsyncStorage.multiRemove([STORAGE_KEY, USER_DATA_KEY, LAST_VERIFICATION_KEY]);
    
    console.log('Legacy session migrated successfully for user:', legacySession.userData?.email);
    return legacySession;
  } catch (error) {
    console.error('Error migrating legacy session:', error);
    return null;
  }
}

/**
 * Get stored user session data
 */
export async function getStoredUserSession(): Promise<StoredUserSession | null> {
  try {
    // First try to get from SecureStore
    const sessionDataString = await SecureStore.getItemAsync(USER_DATA_KEY);
    
    if (sessionDataString) {
      const sessionData: StoredUserSession = JSON.parse(sessionDataString);

      // Check if session has expired
      if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
        await clearUserSession();
        return null;
      }

      return sessionData;
    }
    
    // If no SecureStore session, try to migrate from AsyncStorage
    const migratedSession = await migrateLegacySession();
    if (migratedSession) {
      return migratedSession;
    }
    
    return null;
  } catch (error) {
    console.error("Error getting stored user session:", error);
    return null;
  }
}

/**
 * Check if subscription verification is needed
 */
export async function needsSubscriptionVerification(): Promise<boolean> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData) return true;

    const timeSinceLastVerification = Date.now() - sessionData.lastVerification;
    return timeSinceLastVerification > VERIFICATION_INTERVAL;
  } catch (error) {
    console.error("Error checking verification need:", error);
    return true;
  }
}

/**
 * Update last verification timestamp
 */
export async function updateLastVerification(): Promise<void> {
  try {
    const sessionData = await getStoredUserSession();
    if (sessionData) {
      sessionData.lastVerification = Date.now();
      await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));
    }
    await SecureStore.setItemAsync(LAST_VERIFICATION_KEY, Date.now().toString());
  } catch (error) {
    console.error("Error updating last verification:", error);
  }
}

/**
 * Background subscription verification (called periodically)
 */
export async function backgroundVerifySubscription(): Promise<boolean | null> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData) return null;

    if (!(await needsSubscriptionVerification())) {
      return sessionData.isSubscribed;
    }

    console.log("Performing background subscription verification...");
    
    try {
      // Try to get a valid access token (will refresh if needed)
      const accessToken = await getValidAccessToken();
      
      if (!accessToken) {
        console.log("No valid access token available for background verification");
        return sessionData.isSubscribed;
      }

      const isSubscribed = await checkYouTubeSubscription(accessToken);

      // Update stored session data
      sessionData.isSubscribed = isSubscribed;
      sessionData.lastVerification = Date.now();
      await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));

      return isSubscribed;
    } catch (apiError) {
      // Check if it's a 401 authentication error (expired token)
      if (apiError instanceof Error && apiError.message.includes('401')) {
        console.log("Authentication error during background verification. Token may be expired.");
        
        // Mark that we need verification next time but don't fail the session
        sessionData.lastVerification = Date.now() - (24 * 60 * 60 * 1000); // Mark as needing verification
        await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(sessionData));
        
        // Return the last known subscription status instead of failing
        return sessionData.isSubscribed;
      }
      
      // Re-throw non-authentication errors
      throw apiError;
    }
  } catch (error) {
    console.error("Background subscription verification failed:", error);
    return null;
  }
}

/**
 * Make an authenticated API call with automatic token refresh
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("No valid access token available");
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // If we get a 401, try to refresh the token once and retry
  if (response.status === 401) {
    console.log("Got 401, attempting token refresh and retry...");
    
    const newAccessToken = await getValidAccessToken();
    if (newAccessToken && newAccessToken !== accessToken) {
      // Token was refreshed, retry the request
      const retryHeaders = {
        ...options.headers,
        'Authorization': `Bearer ${newAccessToken}`,
      };
      
      return fetch(url, {
        ...options,
        headers: retryHeaders,
      });
    }
    
    // If token refresh failed or got same token, throw error
    throw new Error("Authentication failed - please sign in again");
  }
  
  return response;
}

/**
 * Load user from persistent storage (if valid session exists)
 */
export async function loadPersistedUser(): Promise<AuthResult> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData) {
      return { success: false, error: "No persisted session found" };
    }

    console.log("Loading user from persisted session...");

    // Check if we need background verification
    if (await needsSubscriptionVerification()) {
      console.log("Triggering background subscription verification...");
      // Don't wait for verification - return current data and verify in background
      backgroundVerifySubscription();
    }

    return {
      success: true,
      isSubscribed: sessionData.isSubscribed,
      token: sessionData.token,
      userData: sessionData.userData,
      fromCache: true,
    };
  } catch (error) {
    console.error("Error loading persisted user:", error);
    return { success: false, error: "Failed to load persisted session" };
  }
}

/**
 * Clear all stored user session data
 */
export async function clearUserSession(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEY),
      SecureStore.deleteItemAsync(USER_DATA_KEY),
      SecureStore.deleteItemAsync(LAST_VERIFICATION_KEY),
    ]);
  } catch (error) {
    console.error("Error clearing user session:", error);
  }
}

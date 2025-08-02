import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Constants

// Register the redirect URI for your app
WebBrowser.maybeCompleteAuthSession();

// OAuth client IDs
const WEB_CLIENT_ID = '986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com'; // existing web / dev
const IOS_CLIENT_ID = '986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3.apps.googleusercontent.com'; // new iOS client

// Helper: choose correct client ID
const CLIENT_ID = Platform.OS === 'ios' ? IOS_CLIENT_ID : WEB_CLIENT_ID;
const HAMAKI_CHANNEL_ID = 'UCSI5XbaxsX1USijrfFVuJqA';
const STORAGE_KEY = 'hamaki_auth_token';
const USER_DATA_KEY = 'hamaki_user_data';
const LAST_VERIFICATION_KEY = 'hamaki_last_verification';
const VERIFICATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Configure the discovery document for Google
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
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
}

/**
 * Interface for stored user session data
 */
export interface StoredUserSession {
  token: string;
  userData: any;
  isSubscribed: boolean;
  lastVerification: number;
  expiresAt: number;
}

/**
 * Authenticate with Google and check YouTube subscription
 */
export async function authenticateWithGoogle(): Promise<AuthResult> {
  try {
    const redirectUri = AuthSession.makeRedirectUri({ native: 'com.googleusercontent.apps.986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3:/oauth2redirect/google', useProxy: false });

    // Create the auth request for the Google OAuth flow, using PKCE
    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
      redirectUri,
      usePKCE: true, // Ensure PKCE is enabled
    });

    const result = await request.promptAsync(discovery);

    if (result.type === 'success') {
      if (!request.codeVerifier) {
        throw new Error('PKCE code verifier not found');
      }
      
      // Exchange the code for an access token, including the code verifier
      const { accessToken } = await exchangeCodeForToken(
        result.params.code,
        request.redirectUri,
        request.codeVerifier
      );
      
      if (!accessToken) {
        return { success: false, error: 'Failed to obtain access token' };
      }

      // Get user info to verify the account
      const userData = await getUserInfo(accessToken);
      console.log('Authenticated with Google account:', userData.email);

      const isSubscribed = await checkYouTubeSubscription(accessToken);
      
      // Store the session persistently
      await storeUserSession(accessToken, userData, isSubscribed);
      
      return { 
        success: true, 
        isSubscribed, 
        token: accessToken,
        userData,
      };
    } else {
      return { 
        success: false, 
        error: 'Authentication was cancelled or failed' 
      };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown authentication error' 
    };
  }
}

/**
 * Diagnostic: Get all channels owned by the authenticated user.
 */
async function getUserInfo(accessToken: string): Promise<any> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = await response.json();
    if (!response.ok) {
      console.error('Google user info error:', userData);
      throw new Error('Failed to fetch user info');
    }
    return userData;
  } catch (error) {
    console.error('Get user info error:', error);
    throw error;
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ accessToken: string }> {
  try {
    const tokenResult = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier, // Send the PKCE code verifier
      }).toString(),
    });

    const tokenData = await tokenResult.json();
    
    if (!tokenData.access_token) {
      console.error('Google token response:', tokenData);
      throw new Error('No access token returned');
    }

    return { accessToken: tokenData.access_token };
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

/**
 * Check if the user is subscribed to the Hamaki channel
 */
async function checkYouTubeSubscription(accessToken: string): Promise<boolean> {
  try {
    let nextPageToken: string | undefined = undefined;

    do {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('YouTube API error:', data);
        throw new Error(data.error?.message || 'Failed to fetch subscriptions');
      }

      // Check if the subscription is on the current page
      const isSubscribedOnPage = data.items?.some(
        (item: any) => item.snippet?.resourceId?.channelId === HAMAKI_CHANNEL_ID
      ) || false;

      if (isSubscribedOnPage) {
        return true; // Found it, exit early
      }

      nextPageToken = data.nextPageToken;

    } while (nextPageToken);

    // If the loop finishes, the subscription was not found on any page
    return false;

  } catch (error) {
    console.error('Subscription check error:', error);
    throw error;
  }
}

/**
 * Get the stored authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

/**
 * Clear the stored authentication token
 */
export async function clearAuthToken(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if the user is already authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const sessionData = await getStoredUserSession();
  return sessionData !== null;
}

/**
 * Store user session data persistently
 */
export async function storeUserSession(
  token: string,
  userData: any,
  isSubscribed: boolean
): Promise<void> {
  try {
    const sessionData: StoredUserSession = {
      token,
      userData,
      isSubscribed,
      lastVerification: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    };

    await AsyncStorage.multiSet([
      [STORAGE_KEY, token],
      [USER_DATA_KEY, JSON.stringify(sessionData)],
      [LAST_VERIFICATION_KEY, Date.now().toString()],
    ]);
  } catch (error) {
    console.error('Error storing user session:', error);
  }
}

/**
 * Get stored user session data
 */
export async function getStoredUserSession(): Promise<StoredUserSession | null> {
  try {
    const sessionDataString = await AsyncStorage.getItem(USER_DATA_KEY);
    if (!sessionDataString) return null;

    const sessionData: StoredUserSession = JSON.parse(sessionDataString);
    
    // Check if session has expired
    if (Date.now() > sessionData.expiresAt) {
      await clearUserSession();
      return null;
    }

    return sessionData;
  } catch (error) {
    console.error('Error getting stored user session:', error);
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
    console.error('Error checking verification need:', error);
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
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(sessionData));
    }
    await AsyncStorage.setItem(LAST_VERIFICATION_KEY, Date.now().toString());
  } catch (error) {
    console.error('Error updating last verification:', error);
  }
}

/**
 * Background subscription verification (called periodically)
 */
export async function backgroundVerifySubscription(): Promise<boolean | null> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData || !sessionData.token) return null;

    if (!await needsSubscriptionVerification()) {
      return sessionData.isSubscribed;
    }

    console.log('Performing background subscription verification...');
    const isSubscribed = await checkYouTubeSubscription(sessionData.token);
    
    // Update stored session data
    sessionData.isSubscribed = isSubscribed;
    sessionData.lastVerification = Date.now();
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(sessionData));
    
    return isSubscribed;
  } catch (error) {
    console.error('Background subscription verification failed:', error);
    return null;
  }
}

/**
 * Load user from persistent storage (if valid session exists)
 */
export async function loadPersistedUser(): Promise<AuthResult> {
  try {
    const sessionData = await getStoredUserSession();
    if (!sessionData) {
      return { success: false, error: 'No persisted session found' };
    }

    console.log('Loading user from persisted session...');
    
    // Check if we need background verification
    if (await needsSubscriptionVerification()) {
      console.log('Triggering background subscription verification...');
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
    console.error('Error loading persisted user:', error);
    return { success: false, error: 'Failed to load persisted session' };
  }
}

/**
 * Clear all stored user session data
 */
export async function clearUserSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY,
      USER_DATA_KEY,
      LAST_VERIFICATION_KEY,
    ]);
  } catch (error) {
    console.error('Error clearing user session:', error);
  }
}

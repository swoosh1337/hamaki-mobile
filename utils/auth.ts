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
}

/**
 * Authenticate with Google and check YouTube subscription
 */
export async function authenticateWithGoogle(): Promise<AuthResult> {
  try {
    // Build redirect URI that goes through the Expo AuthSession proxy. This
    // works out-of-the-box without any extra configuration in Google Cloud.
    // @ts-expect-error - type definitions may not include `useProxy` yet but it is supported at runtime
    const redirectUri = AuthSession.makeRedirectUri({ native: 'com.googleusercontent.apps.986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3:/oauth2redirect/google', useProxy: false });

    // Create the auth request for the Google OAuth flow
    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
      redirectUri,
    });

    // Prompt the user to authenticate – the second argument `{ useProxy: true }`
    // ensures the proxy URL is used in the browser flow.
    // @ts-expect-error - type definitions may not include `useProxy` yet but it is supported at runtime
    const result = await request.promptAsync(discovery, { useProxy: true });

    if (result.type === 'success') {
      // Exchange the code for an access token
      const { accessToken } = await exchangeCodeForToken(result.params.code, request.redirectUri);
      
      if (!accessToken) {
        return { success: false, error: 'Failed to obtain access token' };
      }

      // Save the token for future use
      await AsyncStorage.setItem(STORAGE_KEY, accessToken);

      // Check if the user is subscribed to the Hamaki channel
      const isSubscribed = await checkYouTubeSubscription(accessToken);
      
      return { 
        success: true, 
        isSubscribed, 
        token: accessToken 
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
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string }> {
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
      }).toString(),
    });

    const tokenData = await tokenResult.json();
    
    if (!tokenData.access_token) {
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
    // First, get all subscriptions for the authenticated user
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50',
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

    // Check if any of the subscriptions match the Hamaki channel ID
    const isSubscribed = data.items?.some(
      (item: any) => item.snippet?.resourceId?.channelId === HAMAKI_CHANNEL_ID
    ) || false;

    return isSubscribed;
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
  const token = await getAuthToken();
  return token !== null;
}

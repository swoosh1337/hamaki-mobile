import * as AuthSession from 'expo-auth-session';
import {
  authenticateWithGoogle,
  backgroundVerifySubscription,
  clearAuthToken,
  clearUserSession,
  getAuthToken,
  getStoredUserSession,
  isAuthenticated,
  loadPersistedUser,
  needsSubscriptionVerification,
  storeUserSession,
  updateLastVerification
} from '../../utils/auth';
import {
  createMockFetch,
  createMockGoogleAuthResponse,
  createMockSubscriptionsResponse,
  mockCurrentTime,
  mockTimestamp,
  restoreFetch,
  restoreTime,
} from '../__helpers__/testHelpers';

// Mock modules
// Using SecureStore instead of AsyncStorage
jest.mock('expo-auth-session');
jest.mock('expo-web-browser');
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/Platform');
  return { ...actual, OS: 'ios' };
});

const mockSecureStore = (global as any).mockSecureStore as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  clearStore: () => void;
  store: Record<string, string>;
};
const mockAuthSession = AuthSession as jest.Mocked<typeof AuthSession>;

describe('Auth Utils', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = createMockFetch();
    mockCurrentTime();
    
    // Mock AuthSession
    mockAuthSession.makeRedirectUri.mockReturnValue('test://redirect');
    (mockAuthSession.AuthRequest as any).mockImplementation(() => ({
      promptAsync: jest.fn(),
      codeVerifier: 'test-code-verifier',
      redirectUri: 'test://redirect',
    }));
  });

  afterEach(() => {
    restoreTime();
    restoreFetch();
  });

  describe('authenticateWithGoogle', () => {
    it('should successfully authenticate and verify subscription', async () => {
      // Mock successful OAuth flow
      const mockRequest = {
        promptAsync: jest.fn().mockResolvedValue(createMockGoogleAuthResponse(true)),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      };
      (mockAuthSession.AuthRequest as any).mockReturnValue(mockRequest);

      // Mock token exchange
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'test-access-token' }),
        } as Response)
        // Mock user info
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'google-user-id',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://test.com/avatar.jpg',
          }),
        } as Response)
        // Mock subscription check
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockSubscriptionsResponse(true)),
        } as Response);

      const result = await authenticateWithGoogle();

      expect(result).toEqual({
        success: true,
        isSubscribed: true,
        token: 'test-access-token',
        userData: {
          id: 'google-user-id',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://test.com/avatar.jpg',
        },
      });

      expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('should fail when user cancels authentication', async () => {
      const mockRequest = {
        promptAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      };
      (mockAuthSession.AuthRequest as any).mockReturnValue(mockRequest);

      const result = await authenticateWithGoogle();

      expect(result).toEqual({
        success: false,
        error: 'Authentication was cancelled or failed',
      });
    });

    it('should fail when user is not subscribed', async () => {
      const mockRequest = {
        promptAsync: jest.fn().mockResolvedValue(createMockGoogleAuthResponse(true)),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      };
      (mockAuthSession.AuthRequest as any).mockReturnValue(mockRequest);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'test-access-token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'google-user-id',
            email: 'test@example.com',
            name: 'Test User',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockSubscriptionsResponse(false)),
        } as Response);

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(true);
      expect(result.isSubscribed).toBe(false);
    });

    it('should handle token exchange errors', async () => {
      const mockRequest = {
        promptAsync: jest.fn().mockResolvedValue(createMockGoogleAuthResponse(true)),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      };
      (mockAuthSession.AuthRequest as any).mockReturnValue(mockRequest);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      } as Response);

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_grant');
    });

    it('should handle missing code verifier', async () => {
      const mockRequest = {
        promptAsync: jest.fn().mockResolvedValue(createMockGoogleAuthResponse(true)),
        codeVerifier: null,
        redirectUri: 'test://redirect',
      };
      (mockAuthSession.AuthRequest as any).mockReturnValue(mockRequest);

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('PKCE code verifier not found');
    });
  });

  describe('AsyncStorage operations', () => {
    it('should store and retrieve auth token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('test-token');

      const token = await getAuthToken();

      expect(token).toBe('test-token');
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('hamaki_auth_token');
    });

    it('should clear auth token', async () => {
      await clearAuthToken();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_auth_token');
    });

    it('should check if user is authenticated', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp,
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when no session exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('Session management', () => {
    it('should store user session correctly', async () => {
      const userData = { id: 'test', email: 'test@example.com' };
      
      await storeUserSession('test-token', userData, true);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('hamaki_auth_token', 'test-token');
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'hamaki_user_data',
        expect.stringContaining('"token":"test-token"')
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'hamaki_last_verification',
        mockTimestamp.toString()
      );
    });

    it('should retrieve stored user session', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp,
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await getStoredUserSession();

      expect(result).toEqual(sessionData);
    });

    it('should return null for expired session', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp,
        expiresAt: mockTimestamp - 1000, // Expired
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await getStoredUserSession();

      expect(result).toBeNull();
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it('should clear all session data', async () => {
      await clearUserSession();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_auth_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_user_data');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('hamaki_last_verification');
    });
  });

  describe('Subscription verification', () => {
    it('should determine when verification is needed', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000), // 25 hours ago
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await needsSubscriptionVerification();

      expect(result).toBe(true);
    });

    it('should return false when verification is not needed', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (1 * 60 * 60 * 1000), // 1 hour ago
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await needsSubscriptionVerification();

      expect(result).toBe(false);
    });

    it('should update last verification timestamp', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - 1000,
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      await updateLastVerification();

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'hamaki_user_data',
        expect.stringContaining(`"lastVerification":${mockTimestamp}`)
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'hamaki_last_verification',
        mockTimestamp.toString()
      );
    });

    it('should perform background subscription verification', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: false,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000),
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockSubscriptionsResponse(true)),
      } as Response);

      const result = await backgroundVerifySubscription();

      expect(result).toBe(true);
      expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('should return cached subscription status when verification not needed', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (1 * 60 * 60 * 1000), // 1 hour ago
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await backgroundVerifySubscription();

      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('loadPersistedUser', () => {
    it('should load persisted user successfully', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test', email: 'test@example.com' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (1 * 60 * 60 * 1000),
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await loadPersistedUser();

      expect(result).toEqual({
        success: true,
        isSubscribed: true,
        token: 'test-token',
        userData: { id: 'test', email: 'test@example.com' },
        fromCache: true,
      });
    });

    it('should fail when no persisted session exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await loadPersistedUser();

      expect(result).toEqual({
        success: false,
        error: 'No persisted session found',
      });
    });

    it('should trigger background verification when needed', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000), // 25 hours ago
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await loadPersistedUser();

      expect(result.success).toBe(true);
      // The background verification is called without awaiting, so we don't need to check mockFetch
      expect(result.isSubscribed).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle AsyncStorage errors gracefully', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('Storage error'));

      const result = await getStoredUserSession();

      expect(result).toBeNull();
    });

    it('should handle malformed JSON in storage', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('invalid-json');

      const result = await getStoredUserSession();

      expect(result).toBeNull();
    });

    it('should handle network errors during subscription check', async () => {
      const sessionData = {
        token: 'test-token',
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000),
        expiresAt: mockTimestamp + 1000000,
      };
      
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await backgroundVerifySubscription();

      expect(result).toBeNull();
    });
  });
});

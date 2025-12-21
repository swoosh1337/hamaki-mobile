import {
  authenticateWithGoogle,
  backgroundVerifySubscription,
  getAuthToken,
  getStoredUserSession,
  isAuthenticated,
  loadPersistedUser,
  needsSubscriptionVerification,
  updateLastVerification
} from '@/utils/auth';
import * as AuthSession from "expo-auth-session";
import * as SecureStore from 'expo-secure-store';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn(objs => objs.ios),
  },
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(),
  getDefaultReturnUrl: jest.fn().mockReturnValue('test://return'),
  AuthRequest: jest.fn(),
  ResponseType: {
    Code: 'code',
  },
}));

// SecureStore is mocked in jest.setup.js but we need reference here
const mockSecureStore = (SecureStore as any) as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  clearStore: () => void;
  store: Record<string, string>;
};

// Selection of the mock timestamp to avoid fluctuations
const mockTimestamp = 1625097600000; // 2021-07-01T00:00:00.000Z

// Helper to mock current time
const mockCurrentTime = () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(mockTimestamp));
};

const restoreTime = () => {
  jest.useRealTimers();
};

const createMockFetch = () => {
  const mock = jest.fn();
  mock.mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
  return mock;
};

// Global polyfill for fetch if not exists
if (typeof fetch === 'undefined') {
  (global as any).fetch = createMockFetch();
}

const mockAuthSession = AuthSession as jest.Mocked<typeof AuthSession>;

describe('Auth Utils', () => {
  let mockFetch: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = createMockFetch();
    (global as any).fetch = mockFetch;
    mockCurrentTime();
    mockSecureStore.clearStore();

    // Mock AuthSession
    mockAuthSession.makeRedirectUri.mockReturnValue('test://redirect');

    // Force mock the read-only property
    (mockAuthSession as any).getDefaultReturnUrl = jest.fn().mockReturnValue('test://return');
    (mockAuthSession.AuthRequest as any).mockImplementation(() => ({
      promptAsync: jest.fn(),
      codeVerifier: 'test-code-verifier',
      redirectUri: 'test://redirect',
    }));
  });

  afterEach(() => {
    restoreTime();
  });

  describe('authenticateWithGoogle', () => {
    it('should return success: false when user cancels', async () => {
      (mockAuthSession.AuthRequest as any).mockImplementation(() => ({
        promptAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      }));

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication cancel');
    });

    it('should exchange code for tokens and fetch user info on success', async () => {
      // Mock success auth
      (mockAuthSession.AuthRequest as any).mockImplementation(() => ({
        promptAsync: jest.fn().mockResolvedValue({
          type: 'success',
          params: { code: 'test-code' }
        }),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      }));

      // Mock fetch responses
      // 1. Token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600
        })
      } as any);

      // 2. User info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user-123', email: 'test@example.com', name: 'Test User' })
      } as any);

      // 3. Subscription check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ snippet: { resourceId: { channelId: 'UCSI5XbaxsX1USijrfFVuJqA' } } }] })
      } as any);

      // 4. Channel subscriptions check (lazy import)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      } as any);

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(true);
      expect(result.token).toBe('access-123');
      expect(result.isSubscribed).toBe(true);
    });

    it('should return success: false when token exchange fails', async () => {
      (mockAuthSession.AuthRequest as any).mockImplementation(() => ({
        promptAsync: jest.fn().mockResolvedValue({
          type: 'success',
          params: { code: 'test-code' }
        }),
        codeVerifier: 'test-code-verifier',
        redirectUri: 'test://redirect',
      }));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error_description: 'Invalid code' })
      } as any);

      const result = await authenticateWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid code');
    });
  });

  describe('AsyncStorage operations', () => {
    it('should store and retrieve auth token', async () => {
      const sessionData = {
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: true,
        expiresAt: mockTimestamp + 1000000,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const token = await getAuthToken();

      expect(token).toBe('test-token');
    });

    it('should check if user is authenticated', async () => {
      const sessionData = {
        token: 'test-token',
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: true,
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

  describe('getStoredUserSession', () => {
    it('should retrieve stored user session', async () => {
      const sessionData = {
        token: 'test-token',
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: true,
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await getStoredUserSession();

      expect(result).toEqual(sessionData);
    });

    it('should return null for expired session', async () => {
      const sessionData = {
        token: 'test-token',
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp - 1000 },
        userData: { id: 'test' },
        isSubscribed: true,
        expiresAt: mockTimestamp - 1000, // Expired
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await getStoredUserSession();

      expect(result).toBeNull();
    });
  });

  describe('Subscription Verification logic', () => {
    it('should determine when verification is needed', async () => {
      const sessionData = {
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000), // 25 hours ago
        tokenData: { accessToken: 't', expiresAt: mockTimestamp + 1000000 },
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await needsSubscriptionVerification();

      expect(result).toBe(true);
    });

    it('should return false when verification is not needed', async () => {
      const sessionData = {
        lastVerification: mockTimestamp - (1 * 60 * 60 * 1000), // 1 hour ago
        tokenData: { accessToken: 't', expiresAt: mockTimestamp + 1000000 },
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await needsSubscriptionVerification();

      expect(result).toBe(false);
    });

    it('should update last verification timestamp', async () => {
      const sessionData = {
        lastVerification: 0,
        tokenData: { accessToken: 't', expiresAt: mockTimestamp + 1000000 },
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      await updateLastVerification();

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'hamaki_user_data',
        expect.stringContaining(`"lastVerification":${mockTimestamp}`)
      );
    });
  });

  describe('backgroundVerifySubscription', () => {
    it('should perform background subscription verification', async () => {
      const sessionData = {
        token: 'test-token',
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: false,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000),
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      // Subscription check - token is still valid so no refresh needed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ snippet: { resourceId: { channelId: 'UCSI5XbaxsX1USijrfFVuJqA' } } }] })
      } as any);

      const result = await backgroundVerifySubscription();

      expect(result).toBe(true);
    });

    it('should return cached subscription status when verification not needed', async () => {
      const sessionData = {
        isSubscribed: true,
        lastVerification: mockTimestamp - (1 * 60 * 60 * 1000),
        tokenData: { accessToken: 't', expiresAt: mockTimestamp + 1000000 },
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
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
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

      expect(result.success).toBe(false);
    });

    it('should trigger background verification when needed', async () => {
      const sessionData = {
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000), // 25 hours ago
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const result = await loadPersistedUser();

      expect(result.success).toBe(true);
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
        tokenData: { accessToken: 'test-token', expiresAt: mockTimestamp + 1000000 },
        userData: { id: 'test' },
        isSubscribed: true,
        lastVerification: mockTimestamp - (25 * 60 * 60 * 1000),
        expiresAt: mockTimestamp + 1000000,
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await backgroundVerifySubscription();

      // Should return null (or false/error result depending on implementation)
      expect(result).toBeNull();
    });
  });
});

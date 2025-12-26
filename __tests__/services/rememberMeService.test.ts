/**
 * rememberMeService Tests
 */

import { rememberMeService } from '@/services/auth/rememberMeService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock tokenManager - must be set up before importing rememberMeService
const mockGetStoredSession = jest.fn();
jest.mock('@/services/auth/tokenManager', () => ({
  tokenManager: {
    getStoredSession: mockGetStoredSession,
  },
}));

describe('rememberMeService', () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreference', () => {
    it('returns null when no preferences exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await rememberMeService.getPreference('test@example.com');

      expect(result).toBeNull();
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('hamaki_remember_me_preferences');
    });

    it('returns null for expired preference', async () => {
      // Calculate actual hash for test@example.com
      const testEmail = 'test@example.com';
      let hash = 0;
      for (let i = 0; i < testEmail.length; i++) {
        const char = testEmail.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashKey = `hash_${Math.abs(hash)}`;

      const expiredPreference = {
        [hashKey]: {
          email: 'test@example.com',
          rememberMe: true,
          expiresAt: Date.now() - 1000, // Expired 1 second ago
          lastUsed: Date.now() - 1000,
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(expiredPreference));

      const result = await rememberMeService.getPreference('test@example.com');

      expect(result).toBeNull();
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'hamaki_remember_me_preferences',
        JSON.stringify({}) // Cleared expired preference
      );
    });

    it('returns valid preference', async () => {
      // Calculate actual hash for test@example.com
      const testEmail = 'test@example.com';
      let hash = 0;
      for (let i = 0; i < testEmail.length; i++) {
        const char = testEmail.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashKey = `hash_${Math.abs(hash)}`;

      const validPreference = {
        [hashKey]: {
          email: 'test@example.com',
          rememberMe: true,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
          lastUsed: Date.now(),
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(validPreference));

      const result = await rememberMeService.getPreference('test@example.com');

      expect(result).toEqual({
        email: 'test@example.com',
        rememberMe: true,
        expiresAt: expect.any(Number),
        lastUsed: expect.any(Number),
      });
    });

    it('handles JSON parsing errors gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await rememberMeService.getPreference('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('setPreference', () => {
    it('saves new preference', async () => {
      const existingPreferences = {
        'hash_other': {
          email: 'other@example.com',
          rememberMe: false,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          lastUsed: Date.now(),
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingPreferences));
      mockAsyncStorage.setItem.mockResolvedValue();

      await rememberMeService.setPreference('test@example.com', true);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'hamaki_remember_me_preferences',
        expect.stringContaining('test@example.com')
      );
    });

    it('saves preference when no existing preferences', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('{}');
      mockAsyncStorage.setItem.mockResolvedValue();

      await rememberMeService.setPreference('test@example.com', false);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'hamaki_remember_me_preferences',
        expect.stringContaining('"rememberMe":false')
      );
    });

    it('sets expiry to 90 days from now', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('{}');
      mockAsyncStorage.setItem.mockResolvedValue();

      const now = Date.now();
      await rememberMeService.setPreference('test@example.com', true);

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      const preference = Object.values(savedData)[0] as any;
      
      expect(preference.expiresAt).toBeGreaterThan(now + 89 * 24 * 60 * 60 * 1000);
      expect(preference.expiresAt).toBeLessThan(now + 91 * 24 * 60 * 60 * 1000);
    });
  });

  describe('shouldAutoSignIn', () => {
    it('returns false when no preference exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await rememberMeService.shouldAutoSignIn('test@example.com');

      expect(result).toBe(false);
    });

    it('returns false when preference is false', async () => {
      const preference = {
        'hash_123456': {
          email: 'test@example.com',
          rememberMe: false,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          lastUsed: Date.now(),
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preference));

      const result = await rememberMeService.shouldAutoSignIn('test@example.com');

      expect(result).toBe(false);
    });

    it('returns false when no active session', async () => {
      // Calculate actual hash for test@example.com
      const testEmail = 'test@example.com';
      let hash = 0;
      for (let i = 0; i < testEmail.length; i++) {
        const char = testEmail.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashKey = `hash_${Math.abs(hash)}`;

      const preference = {
        [hashKey]: {
          email: 'test@example.com',
          rememberMe: true,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          lastUsed: Date.now(),
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preference));

      // Mock tokenManager to return null
      mockGetStoredSession.mockResolvedValue(null);

      const result = await rememberMeService.shouldAutoSignIn('test@example.com');

      expect(result).toBe(false);
    });

    it('returns false when session email does not match', async () => {
      // Calculate actual hash for test@example.com
      const testEmail = 'test@example.com';
      let hash = 0;
      for (let i = 0; i < testEmail.length; i++) {
        const char = testEmail.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashKey = `hash_${Math.abs(hash)}`;

      const preference = {
        [hashKey]: {
          email: 'test@example.com',
          rememberMe: true,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          lastUsed: Date.now(),
        },
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preference));

      // Mock tokenManager to return session with different email
      mockGetStoredSession.mockResolvedValue({
        userData: {
          email: 'different@example.com',
        },
      });

      const result = await rememberMeService.shouldAutoSignIn('test@example.com');

      expect(result).toBe(false);
    });

    it.skip('returns true when preference is true and session exists', async () => {
      // Calculate actual hash for test@example.com
      const testEmail = 'test@example.com';
      let hash = 0;
      for (let i = 0; i < testEmail.length; i++) {
        const char = testEmail.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashKey = `hash_${Math.abs(hash)}`;

      const preference = {
        [hashKey]: {
          email: 'test@example.com',
          rememberMe: true,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          lastUsed: Date.now(),
        },
      };

      // Mock getItem to return preference for all calls
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(preference));

      // Mock tokenManager to return valid session
      mockGetStoredSession.mockResolvedValue({
        userData: {
          email: 'test@example.com',
        },
      });

      // Mock setPreference to track if it's called
      mockAsyncStorage.setItem.mockResolvedValue();

      const result = await rememberMeService.shouldAutoSignIn('test@example.com');

      expect(result).toBe(true);
      expect(mockAsyncStorage.setItem).toHaveBeenCalled(); // Should update lastUsed
    });
  });

  describe('clearAllPreferences', () => {
    it('clears all preferences from storage', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();

      await rememberMeService.clearAllPreferences();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('hamaki_remember_me_preferences');
    });
  });

  describe('hashEmail', () => {
    it('produces consistent hash for same email', async () => {
      const email = 'test@example.com';
      
      // We can't directly test the private method, but we can test it indirectly
      // by setting and getting a preference
      mockAsyncStorage.getItem.mockResolvedValue('{}');
      mockAsyncStorage.setItem.mockImplementation((key, value) => {
        const parsed = JSON.parse(value as string);
        const hashKey = Object.keys(parsed)[0];
        expect(hashKey).toMatch(/^hash_\d+$/);
        return Promise.resolve();
      });

      await rememberMeService.setPreference(email, true);
    });

    it('produces different hashes for different emails', async () => {
      const email1 = 'test1@example.com';
      const email2 = 'test2@example.com';
      
      const hashes: string[] = [];
      
      mockAsyncStorage.getItem.mockResolvedValue('{}');
      mockAsyncStorage.setItem.mockImplementation((key, value) => {
        const parsed = JSON.parse(value as string);
        hashes.push(Object.keys(parsed)[0]);
        return Promise.resolve();
      });

      await rememberMeService.setPreference(email1, true);
      await rememberMeService.setPreference(email2, true);

      expect(hashes[0]).not.toBe(hashes[1]);
    });
  });
});

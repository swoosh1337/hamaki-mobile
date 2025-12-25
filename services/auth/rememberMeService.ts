/**
 * Remember Me Service
 * 
 * Manages user preferences for staying signed in.
 * Stores preferences per email address with expiration.
 */

import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenManager } from './tokenManager';

const log = createLogger('RememberMe');

// Storage keys
const PREFERENCES_KEY = 'hamaki_remember_me_preferences';

interface RememberMePreference {
  email: string;
  rememberMe: boolean;
  expiresAt: number; // When this preference expires
  lastUsed: number; // Last time this preference was used
}

/**
 * Service for managing "Stay signed in" preferences
 */
export const rememberMeService = {
  /**
   * Get the stored preference for an email
   */
  async getPreference(email: string): Promise<RememberMePreference | null> {
    try {
      const preferencesJson = await AsyncStorage.getItem(PREFERENCES_KEY);
      log.debug('Getting preference from storage', {
        email,
        emailHash: this.hashEmail(email),
        hasStorage: !!preferencesJson
      });

      if (!preferencesJson) {
        log.debug('No preferences found in storage');
        return null;
      }

      const preferences: Record<string, RememberMePreference> = JSON.parse(preferencesJson);
      const emailHash = this.hashEmail(email);
      const preference = preferences[emailHash];

      log.debug('Preference lookup result', {
        emailHash,
        found: !!preference,
        totalPreferences: Object.keys(preferences).length
      });

      if (!preference) {
        log.debug('No preference found for this email hash');
        return null;
      }

      // Check if preference has expired (preferences expire after 90 days)
      if (Date.now() > preference.expiresAt) {
        log.debug('Preference expired, removing', { email });
        delete preferences[emailHash];
        await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
        return null;
      }

      return preference;
    } catch (error) {
      log.error('Error getting remember me preference', error);
      return null;
    }
  },

  /**
   * Save the user's preference for an email
   */
  async setPreference(email: string, rememberMe: boolean): Promise<void> {
    try {
      const preferencesJson = await AsyncStorage.getItem(PREFERENCES_KEY) || '{}';
      const preferences: Record<string, RememberMePreference> = JSON.parse(preferencesJson);
      const emailHash = this.hashEmail(email);

      preferences[emailHash] = {
        email,
        rememberMe,
        expiresAt: Date.now() + (90 * 24 * 60 * 60 * 1000), // 90 days from now
        lastUsed: Date.now(),
      };

      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      log.info(`Remember me preference saved`, {
        email,
        rememberMe,
        emailHash,
        expiresAt: new Date(preferences[emailHash].expiresAt).toISOString()
      });

      // Verify it was saved
      const verify = await AsyncStorage.getItem(PREFERENCES_KEY);
      log.debug('Verified saved preferences', { saved: !!verify });
    } catch (error) {
      log.error('Error saving remember me preference', error);
      throw error;
    }
  },

  /**
   * Check if user has a valid session and chose to stay signed in
   */
  async shouldAutoSignIn(email: string): Promise<boolean> {
    try {
      const preference = await this.getPreference(email);
      if (!preference || !preference.rememberMe) {
        return false;
      }

      // Check if there's an active session
      const session = await tokenManager.getStoredSession();
      
      if (!session) {
        log.debug('No active session found for auto sign-in', { email });
        return false;
      }

      // Check if the session email matches
      const sessionEmail = session.userData?.email;
      if (sessionEmail?.toLowerCase() !== email.toLowerCase()) {
        log.debug('Session email does not match', { 
          requestedEmail: email, 
          sessionEmail 
        });
        return false;
      }

      // Update last used timestamp
      await this.setPreference(email, true);
      
      log.info('Auto sign-in available', { email });
      return true;
    } catch (error) {
      log.error('Error checking auto sign-in', error);
      return false;
    }
  },

  /**
   * Clear all remember me preferences (for logout/testing)
   */
  async clearAllPreferences(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PREFERENCES_KEY);
      log.info('All remember me preferences cleared');
    } catch (error) {
      log.error('Error clearing preferences', error);
    }
  },

  /**
   * Hash email for privacy (don't store plain emails as keys)
   */
  hashEmail(email: string): string {
    // Simple hash function - in production, consider using crypto-js or similar
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash_${Math.abs(hash)}`;
  },
};

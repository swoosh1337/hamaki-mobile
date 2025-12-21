/**
 * @deprecated This file is maintained for backwards compatibility.
 * Please import from the new auth service modules instead:
 * 
 * - import { authService, tokenManager } from '@/services/auth';
 * - import type { AuthResult, TokenData, StoredUserSession } from '@/types';
 */

import { authService, tokenManager } from '@/services/auth';
import type { AuthResult, StoredUserSession, TokenData } from '@/types';

// Re-export types
export type { AuthResult, StoredUserSession, TokenData };

/**
 * @deprecated Use authService.authenticate()
 */
export const authenticateWithGoogle = authService.authenticate.bind(authService);

/**
 * @deprecated Use authService.loadSavedSession()
 */
export const loadPersistedUser = authService.loadSavedSession.bind(authService);

/**
 * @deprecated Use tokenManager.clearSession()
 */
export const clearUserSession = tokenManager.clearSession.bind(tokenManager);

/**
 * @deprecated Use tokenManager.getValidAccessToken()
 */
export const getValidAccessToken = tokenManager.getValidAccessToken.bind(tokenManager);

/**
 * @deprecated Use tokenManager.getStoredSession()
 */
export const getStoredUserSession = tokenManager.getStoredSession.bind(tokenManager);

/**
 * @deprecated Use authService.triggerBackgroundVerification()
 */
export const needsSubscriptionVerification = async () => {
  const session = await tokenManager.getStoredSession();
  if (!session) return true;
  const VERIFICATION_INTERVAL = 24 * 60 * 60 * 1000;
  return Date.now() - session.lastVerification > VERIFICATION_INTERVAL;
};

/**
 * @deprecated Use tokenManager.updateLastVerification()
 */
export const updateLastVerification = tokenManager.updateLastVerification.bind(tokenManager);

/**
 * @deprecated Use authService.triggerBackgroundVerification()
 */
export const backgroundVerifySubscription = async () => {
  const session = await tokenManager.getStoredSession();
  if (!session) return null;
  try {
    const success = await authService.triggerBackgroundVerification(session);
    // If verification was needed but failed (returned false), return null to indicate failure
    // If verification was not needed (returned true), or succeeded (returned true), we return stored status
    if (!success) return null;
    return session.isSubscribed;
  } catch (error) {
    return null;
  }
};

/**
 * @deprecated Use tokenManager.storeSession()
 */
export const storeUserSessionWithTokens = tokenManager.storeSession.bind(tokenManager);

/**
 * @deprecated Legacy method, use storeUserSessionWithTokens
 */
export const storeUserSession = async (
  token: string,
  userData: any,
  isSubscribed: boolean,
  isPersistent: boolean = true
) => {
  const tokenData: TokenData = {
    accessToken: token,
    expiresIn: 30 * 24 * 60 * 60,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  return tokenManager.storeSession(tokenData, userData, isSubscribed, isPersistent);
};

// Internal helpers that were exported but shouldn't be used directly in new code
export const getAuthToken = async () => {
  const session = await tokenManager.getStoredSession();
  return session?.tokenData.accessToken || null;
};

export const clearAuthToken = tokenManager.clearSession.bind(tokenManager);

export const isAuthenticated = async () => {
  const session = await tokenManager.getStoredSession();
  return !!session;
};

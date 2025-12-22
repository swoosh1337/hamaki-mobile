/**
 * Authentication-related type definitions
 */

/**
 * Supported authentication methods
 */
export type AuthMethod = 'google' | 'magic_link';

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
 * Supabase session data for magic link auth
 */
export interface SupabaseSessionData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    expiresIn: number;
    user: {
        id: string;
        email: string;
        [key: string]: any;
    };
}

/**
 * Interface for stored user session data
 */
export interface StoredUserSession {
    tokenData: TokenData;
    userData: {
        id: string;
        email: string;
        name: string;
        picture?: string;
        [key: string]: any;
    };
    isSubscribed: boolean;
    lastVerification: number;
    authMethod: AuthMethod;
    token?: string; // Legacy
    expiresAt?: number; // Legacy
}

/**
 * Interface for authentication result
 */
export interface AuthResult {
    success: boolean;
    isSubscribed?: boolean;
    token?: string;
    error?: string;
    userData?: any;
    fromCache?: boolean;
    tokenData?: TokenData;
    allChannelSubscriptions?: Record<string, boolean> | null;
    authMethod?: AuthMethod;
}

/**
 * Result from magic link sign-in initiation
 */
export interface MagicLinkResult {
    success: boolean;
    message?: string;
    error?: string;
}

/**
 * Deep link event data for magic link callback
 */
export interface MagicLinkCallbackData {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
    type: string;
}

/**
 * Email validation result
 */
export interface EmailValidationResult {
    isValid: boolean;
    error?: string;
}

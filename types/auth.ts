/**
 * Authentication-related type definitions
 */

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
    userData: {
        id: string;
        email: string;
        name: string;
        picture?: string;
        [key: string]: any;
    };
    isSubscribed: boolean;
    lastVerification: number;
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
}

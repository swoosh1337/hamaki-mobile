import React, { createContext, useContext, useState, useEffect } from 'react';
import { authenticateWithGoogle, getAuthToken, clearAuthToken, AuthResult } from '../utils/auth';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubscribed: boolean;
  signIn: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  isSubscribed: false,
  signIn: async () => ({ success: false }),
  signOut: async () => {},
  error: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for existing authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getAuthToken();
        setIsAuthenticated(!!token);
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Sign in with Google
  const signIn = async (): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await authenticateWithGoogle();
      
      if (result.success) {
        setIsAuthenticated(true);
        setIsSubscribed(result.isSubscribed || false);
      } else {
        setError(result.error || 'Authentication failed');
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during sign in';
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      await clearAuthToken();
      setIsAuthenticated(false);
      setIsSubscribed(false);
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        isSubscribed,
        signIn,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

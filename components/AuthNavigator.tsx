import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export function AuthNavigator() {
  const { isLoading, isAuthenticated, isSubscribed } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && isSubscribed) {
        // User is authenticated and subscribed, go to main app
        router.replace('/(tabs)');
      } else {
        // User needs to authenticate or is not subscribed
        router.replace('/auth');
      }
    }
  }, [isLoading, isAuthenticated, isSubscribed]);

  return null; // This component doesn't render anything
}
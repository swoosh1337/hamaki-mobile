import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthNavigator } from '@/components/AuthNavigator';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';

export default function Index() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  return <AuthNavigator />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

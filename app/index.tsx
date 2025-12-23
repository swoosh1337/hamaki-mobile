import { AuthNavigator } from '@/components/AuthNavigator';
import { AnimatedMiroLoader } from '@/components/ui/AnimatedMiroLoader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <AnimatedMiroLoader size={140} />
          <Text style={styles.loadingText}>იტვირთება...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'HamakiGeo',
    opacity: 0.7,
  },
});

import { Colors } from '@/constants/Colors';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface NetworkErrorProps {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function NetworkError({ 
  message = 'Unable to connect. Please check your internet connection.', 
  onRetry,
  isRetrying = false 
}: NetworkErrorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📡</Text>
      <Text style={styles.title}>Connection Error</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity 
        style={[styles.button, isRetrying && styles.buttonDisabled]} 
        onPress={onRetry}
        disabled={isRetrying}
      >
        <Text style={styles.buttonText}>
          {isRetrying ? 'Retrying...' : 'Retry'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.dark.background,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
});

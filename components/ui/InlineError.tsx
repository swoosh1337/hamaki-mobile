import { Colors } from '@/constants/Colors';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function InlineError({ message, onRetry, compact = false }: InlineErrorProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 10,
  },
  containerCompact: {
    paddingVertical: 20,
  },
  emoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  message: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  messageCompact: {
    fontSize: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
});

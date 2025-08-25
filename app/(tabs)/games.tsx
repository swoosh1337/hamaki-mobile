import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';

export default function GamesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎮 Mini Games</Text>
      <Text style={styles.subtitle}>Coming Soon!</Text>
      <Text style={styles.description}>
        Play mini-games to earn XP points and climb the leaderboard.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 24,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    opacity: 0.8,
  },
});
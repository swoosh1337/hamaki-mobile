import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';

export default function LeaderboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Leaderboard</Text>
      <Text style={styles.subtitle}>Top Community Members</Text>
      
      <View style={styles.content}>
        <Text style={styles.comingSoonText}>
          Coming Soon!
        </Text>
        <Text style={styles.description}>
          See who&apos;s leading the community with the most XP points and contributions.
          {'\n\n'}
          Rankings, achievements, and rewards are being prepared for you!
        </Text>
      </View>
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
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 40,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: '90%',
  },
  comingSoonText: {
    fontSize: 24,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 24,
  },
});
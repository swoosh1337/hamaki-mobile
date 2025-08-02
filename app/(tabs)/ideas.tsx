import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';

export default function IdeasScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>💡 Video Ideas</Text>
      <Text style={styles.subtitle}>WishKit Feature</Text>
      <Text style={styles.description}>
        Submit and upvote video ideas for the HamaKi Studio channel.
        {'\n\n'}
        Your suggestions help shape future content!
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
    fontFamily: 'HamakiGeo',
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
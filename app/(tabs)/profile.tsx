import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { userProfile } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.profileSection}>
        {userProfile?.avatar_url && (
          <Image source={{ uri: userProfile.avatar_url }} style={styles.avatar} />
        )}
        <Text style={styles.name}>{userProfile?.full_name || 'User'}</Text>
        <Text style={styles.email}>{userProfile?.email}</Text>
      </View>
      
      <View style={styles.statsSection}>
        <Text style={styles.title}>👤 Profile Stats</Text>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>XP Points</Text>
          <Text style={styles.statValue}>{userProfile?.xp_points || 0}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>YouTube Subscriber</Text>
          <Text style={[styles.statValue, { color: userProfile?.youtube_subscribed ? Colors.dark.tint : '#FF6B6B' }]}>
            {userProfile?.youtube_subscribed ? '✅ Yes' : '❌ No'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    padding: 20,
    paddingTop: 60,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
  },
  name: {
    fontSize: 24,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    marginBottom: 5,
  },
  email: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
  statsSection: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    marginBottom: 20,
    textAlign: 'center',
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  statLabel: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
});
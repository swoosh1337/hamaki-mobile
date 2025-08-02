import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const { signOut, userProfile } = useAuth();

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚙️ Settings</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.userInfo}>Signed in as: {userProfile?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.description}>
          Hamaki v1.0.0{'\n'}
          Exclusive app for HamaKi Studio subscribers
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: 32,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    marginBottom: 30,
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  userInfo: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.8,
  },
  description: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 24,
  },
  signOutButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 40,
  },
  signOutText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
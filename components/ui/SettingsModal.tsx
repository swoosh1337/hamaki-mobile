import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    Alert,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
}) => {
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
            onClose();
            await signOut();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <Text style={styles.headerTitle}>Settings</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.accountInfo}>
              <View style={styles.accountRow}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{userProfile?.email}</Text>
              </View>
              <View style={styles.accountRow}>
                <Text style={styles.label}>Name:</Text>
                <Text style={styles.value}>{userProfile?.full_name}</Text>
              </View>
              <View style={styles.accountRow}>
                <Text style={styles.label}>XP Points:</Text>
                <Text style={[styles.value, { color: Colors.dark.tint }]}>{userProfile?.xp_points || 0}</Text>
              </View>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description}>
              Hamaki v1.0.0{'\n'}
              Exclusive app for HamaKi Studio subscribers{'\n\n'}
              Stay connected with the latest content and exclusive features!
            </Text>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  headerLeft: {
    width: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'HamakiEng',
    color: Colors.dark.text,
    marginBottom: 15,
    fontWeight: 'bold',
  },
  accountInfo: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
  value: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
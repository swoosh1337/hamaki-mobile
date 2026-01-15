import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ChannelSubscriptionManager } from '@/components/subscriptions/ChannelSubscriptionManager';
import { VideoLikesManager } from '@/components/subscriptions/VideoLikesManager';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const { signOut, userProfile, isDemoMode, authMethod } = useAuth();
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showVideoLikes, setShowVideoLikes] = useState(false);

  // Get pending action count for badges (only for Google users)
  // Hook automatically loads cached data on mount and polls for updates
  const {
    pendingSubscriptionCount,
    pendingVideoLikeCount,
    subscriptionStatuses,
    videoLikeStatuses,
    refreshAll
  } = useYouTubeVerification();

  // Use pre-calculated counts from hook (ensures consistency with profile badge)
  const pendingSubscriptions = pendingSubscriptionCount;
  const pendingVideoLikes = pendingVideoLikeCount;

  // Track previous modal states to detect when they close
  const prevShowVideoLikes = React.useRef(showVideoLikes);
  const prevShowSubscriptions = React.useRef(showSubscriptions);

  // Refresh data when video likes or subscriptions modals close
  // This ensures badges update after user verifies likes/subscriptions
  React.useEffect(() => {
    // If modal just closed, refresh data
    if ((prevShowVideoLikes.current && !showVideoLikes) || (prevShowSubscriptions.current && !showSubscriptions)) {
      refreshAll();
    }

    // Update refs for next render
    prevShowVideoLikes.current = showVideoLikes;
    prevShowSubscriptions.current = showSubscriptions;
  }, [showVideoLikes, showSubscriptions, refreshAll]);

  const handleSignOut = async () => {
    const title = isDemoMode ? 'Exit Demo' : 'Sign Out';
    const message = isDemoMode
      ? 'Are you sure you want to exit demo mode?'
      : 'Are you sure you want to sign out?';
    const buttonText = isDemoMode ? 'Exit Demo' : 'Sign Out';

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: buttonText,
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

  const handleDeleteAccount = async () => {
    Alert.alert(
      'ანგარიშის წაშლა',
      'დარწმუნებული ხართ, რომ გსურთ ანგარიშის წაშლა? ეს მოქმედება შეუქცევადია და წაიშლება ყველა თქვენი მონაცემი, მათ შორის XP ქულები და პოსტები.',
      [
        { text: 'გაუქმება', style: 'cancel' },
        {
          text: 'წაშლა',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!userProfile?.google_id) {
                Alert.alert('შეცდომა', 'მომხმარებლის პროფილი ვერ მოიძებნა');
                return;
              }

              // Import userService dynamically to avoid circular dependencies
              const { userService } = await import('@/services/supabase/userService');
              const success = await userService.deleteUserAccount(userProfile.google_id);

              if (success) {
                onClose();
                await signOut();
                router.replace('/auth');
                Alert.alert('წარმატება', 'თქვენი ანგარიში წარმატებით წაიშალა');
              } else {
                Alert.alert('შეცდომა', 'ანგარიშის წაშლა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.');
              }
            } catch {
              Alert.alert('შეცდომა', 'ანგარიშის წაშლა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.');
            }
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
            <Text style={styles.sectionTitle}>პროფილი</Text>
            <View style={styles.accountInfo}>
              <View style={styles.accountRow}>
                <Text style={styles.label}>ელფოსტა:</Text>
                <Text style={styles.value}>{userProfile?.email}</Text>
              </View>
              <View style={styles.accountRow}>
                <Text style={styles.label}>სახელი:</Text>
                <Text style={styles.value}>{userProfile?.full_name}</Text>
              </View>
              {isDemoMode && (
                <View style={styles.accountRow}>
                  <Text style={styles.label}>Account Type:</Text>
                  <View style={styles.demoTag}>
                    <Text style={styles.demoTagText}>Demo Account</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Earn XP Section */}
          {!isDemoMode && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>დააგროვე მეტი XP</Text>

              {/* Magic Link users can't verify YouTube */}
              {authMethod !== 'google' ? (
                <View style={styles.magicLinkNotice}>
                  <Ionicons name="information-circle-outline" size={24} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.magicLinkNoticeText}>
                    YouTube ვერიფიკაციისთვის საჭიროა Google ანგარიშით შესვლა.
                    გამოდით და შედით Google-ით XP-ს მისაღებად.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Channel Subscriptions */}
                  <TouchableOpacity
                    style={styles.subscriptionsCard}
                    onPress={() => setShowSubscriptions(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.subscriptionsCardContent}>
                      <View style={styles.subscriptionsIcon}>
                        <Ionicons name="logo-youtube" size={24} color="#FF0000" />
                        {/* Badge for pending subscriptions */}
                        {pendingSubscriptions > 0 && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{pendingSubscriptions}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.subscriptionsText}>
                        <Text style={styles.subscriptionsTitle}>არხის გამოწერა</Text>
                        <Text style={styles.subscriptionsDescription}>
                          მიიღე 3,100 XP-მდე ყველა არხის გამოწერით
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color={Colors.dark.tint} />
                    </View>
                  </TouchableOpacity>

                  {/* Video Likes */}
                  <TouchableOpacity
                    style={[styles.subscriptionsCard, { marginTop: 12 }]}
                    onPress={() => setShowVideoLikes(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.subscriptionsCardContent}>
                      <View style={styles.subscriptionsIcon}>
                        <Ionicons name="thumbs-up" size={24} color={Colors.dark.tint} />
                        {/* Badge for pending video likes */}
                        {pendingVideoLikes > 0 && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{pendingVideoLikes}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.subscriptionsText}>
                        <Text style={styles.subscriptionsTitle}>დაალაიქე უახლესი ვიდეოები</Text>
                        <Text style={styles.subscriptionsDescription}>
                          დააგროვე 500 XP-მდე ბოლო ვიდეობის დალაიქებით
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color={Colors.dark.tint} />
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* About Section */}
          {/* <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description}> 
              Hamaki v1.0.0{'\n'}
              {isDemoMode
                ? 'Demo Mode - For Apple Review' + '\n\n' + 'This is a demonstration version showing all app features without requiring YouTube subscription.'
                : 'Exclusive app for HamaKi Studio subscribers' + '\n\n' + 'Stay connected with the latest content and exclusive features!'
              }
            </Text>
          </View> */}

          {/* Delete Account Button - Required for Apple App Store */}
          {!isDemoMode && (
            <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={styles.deleteAccountText}>ანგარიშის წაშლა</Text>
            </TouchableOpacity>
          )}

          {/* Sign Out Button */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
            <Text style={styles.signOutText}>{isDemoMode ? 'Exit Demo' : 'გამოსვლა'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Channel Subscriptions Modal */}
      <Modal
        visible={showSubscriptions}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubscriptions(false)}
      >
        <SafeAreaView style={styles.subscriptionsModal}>
          {/* Subscriptions Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowSubscriptions(false)}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>არხის გამოწერა</Text>
            <View style={styles.headerLeft} />
          </View>

          {/* Subscriptions Content */}
          <View style={styles.subscriptionsContent}>
            <ChannelSubscriptionManager initialStatuses={subscriptionStatuses} />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Video Likes Modal */}
      <Modal
        visible={showVideoLikes}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowVideoLikes(false)}
      >
        <SafeAreaView style={styles.subscriptionsModal}>
          {/* Video Likes Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowVideoLikes(false)}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}> უახლესი ვიდეოები</Text>
            <View style={styles.headerLeft} />
          </View>

          {/* Video Likes Content */}
          <View style={styles.subscriptionsContent}>
            <VideoLikesManager initialStatuses={videoLikeStatuses} />
          </View>
        </SafeAreaView>
      </Modal>
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
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    paddingHorizontal: 3, // Prevent italic font cropping
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
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 15,
    fontWeight: 'bold',
    paddingHorizontal: 6, // Prevent italic font cropping
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
  demoTag: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  demoTagText: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 24,
  },
  deleteAccountButton: {
    backgroundColor: 'transparent',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  deleteAccountText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  signOutButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
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
  subscriptionsCard: {
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  subscriptionsCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  subscriptionsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionsText: {
    flex: 1,
  },
  subscriptionsTitle: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  subscriptionsDescription: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
  subscriptionsModal: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  backButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionsContent: {
    flex: 1,
    padding: 20,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  magicLinkNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  magicLinkNoticeText: {
    flex: 1,
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
    lineHeight: 20,
  },
});

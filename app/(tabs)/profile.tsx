import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { StatsCard } from '@/components/profile/StatsCard';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { ProfilePostSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
import { postService } from '@/services/supabase/postService';
import type { Post as UserPost } from '@/types/post';
import type { XPStats } from '@/types/user';
import { getAvatarSource } from '@/utils/avatars';
import { createLogger } from '@/utils/logger';

const log = createLogger('Profile');

export default function ProfileScreen() {
  const { userProfile, updateUserProfile, isDemoMode, authMethod } = useAuth();

  // Use profile hook for XP stats
  const {
    xpStats,
    isLoading: isXpLoading,
    refetch: refetchProfile,
    updateAvatar: updateAvatarViaHook,
    updateUsername: updateUsernameViaHook,
  } = useUserProfile({
    googleId: userProfile?.google_id,
    autoFetch: true,
  });

  // Get pending XP count for settings badge (with refresh function)
  const { pendingActionCount: pendingXPCount, refreshAll } = useYouTubeVerification();

  // Refresh verification data when Profile screen is focused
  useFocusEffect(
    useCallback(() => {
      if (authMethod === 'google') {
        refreshAll();
      }
    }, [authMethod, refreshAll])
  );

  // UI state management
  const [selectedAvatar, setSelectedAvatar] = useState<string>('avatar-1');
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [isUsernameLoading, setIsUsernameLoading] = useState(false);
  const [userPosts, setUserPosts] = useState<(UserPost & { isUpvoted?: boolean })[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const POSTS_PER_PAGE = 10;

  // Demo data for demo mode
  const demoXPStats: XPStats = {
    totalXP: 1250,
    weeklyXP: 350,
    weeklyStartDate: new Date().toISOString(),
    weeklyEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const demoPosts: (UserPost & { isUpvoted?: boolean })[] = [
    {
      id: 'demo-post-1',
      title: 'Mobile App Tutorial Series',
      content: 'What if we created a step-by-step mobile app development tutorial series covering React Native?',
      upvotes: 23,
      user_id: 'demo-user-id',
      status: 'approved',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'tutorial',
      isUpvoted: false,
    },
    {
      id: 'demo-post-2',
      title: 'Advanced JavaScript Concepts',
      content: 'Could you cover advanced JS concepts like closures, prototypes, and async/await in detail?',
      upvotes: 18,
      user_id: 'demo-user-id',
      status: 'approved',
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'content',
      isUpvoted: true,
    },
  ];

  // Initialize data only when the user identity changes (not on avatar/name updates)
  useEffect(() => {
    if (userProfile?.google_id) {
      initializeProfileData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.google_id]);

  // Only load XP stats on initial mount, not on every focus
  // This allows caching to work properly
  // User can pull-to-refresh to force update

  // Pull-to-refresh handler
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePullToRefresh = async () => {
    log.debug('Pull-to-refresh triggered');
    setIsRefreshing(true);
    await refetchProfile(); // Refresh profile and XP stats
    setIsRefreshing(false);
  };

  const initializeProfileData = async () => {
    if (!userProfile?.google_id) return;

    // Set initial avatar from user profile
    if (userProfile.avatar_url) {
      setSelectedAvatar(userProfile.avatar_url);
    }

    // Load user posts
    await loadUserPosts(0, true);
  };

  const loadUserPosts = async (page: number = 0, reset: boolean = false) => {
    if (!userProfile?.id) return;

    try {
      if (reset) {
        setIsPostsLoading(true);
        setUserPosts([]);
      }

      if (isDemoMode) {
        // Use demo data for demo mode
        setTimeout(() => {
          if (reset) {
            setUserPosts(demoPosts);
          } else {
            // For demo, don't add more posts on pagination
            setUserPosts(prev => [...prev]);
          }
          setHasMorePosts(false); // Demo has limited posts
          setCurrentPage(page);
          setIsPostsLoading(false);
        }, 600); // Simulate loading delay
        return;
      }

      const posts = await postService.getUserPosts(
        userProfile.id,
        POSTS_PER_PAGE,
        page * POSTS_PER_PAGE
      );

      if (reset) {
        setUserPosts(posts);
      } else {
        setUserPosts(prev => [...prev, ...posts]);
      }

      setHasMorePosts(posts.length === POSTS_PER_PAGE);
      setCurrentPage(page);
    } catch (error) {
      log.error('Error loading user posts', error);
    } finally {
      if (!isDemoMode) {
        setIsPostsLoading(false);
      }
    }
  };

  // Handle avatar selection
  const handleAvatarSelect = async (avatarId: string) => {
    if (!userProfile?.google_id) return;

    try {
      setIsAvatarLoading(true);
      const success = await updateAvatarViaHook(avatarId);

      if (success) {
        setSelectedAvatar(avatarId);
        // reflect immediately in global state so header image updates
        updateUserProfile({ avatar_url: avatarId });
        Alert.alert('Success', 'Avatar updated successfully!');
      } else {
        Alert.alert('Error', 'Failed to update avatar. Please try again.');
      }
    } catch (error) {
      log.error('Error updating avatar', error);
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to update avatar. Please try again.');
      }
    } finally {
      setIsAvatarLoading(false);
    }
  };

  // Handle nickname editing
  const handleEditName = () => {
    setIsEditingName(true);
    setEditedName(userProfile?.full_name || '');
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const handleSaveName = async () => {
    if (!userProfile?.google_id || !editedName.trim()) return;

    try {
      setIsUsernameLoading(true);
      const success = await updateUsernameViaHook(editedName.trim());

      if (success) {
        setIsEditingName(false);
        updateUserProfile({ full_name: editedName.trim() });
        Alert.alert('Success', 'სახელი წარმატებით შეიცვალა!');
      } else {
        Alert.alert('Error', 'სახელის ცვლილება ვერ მოხერხდა');
      }
    } catch (error) {
      log.error('Error updating name', error);
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'სახელის ცვლილება ვერ მოხერხდა. გთხოვთ ახლიდან სცადოთ.');
      }
    } finally {
      setIsUsernameLoading(false);
    }
  };

  // Note: Users cannot upvote their own posts, so no upvote handler needed

  // Handle load more posts
  const handleLoadMorePosts = async () => {
    if (!hasMorePosts || isPostsLoading) return;
    await loadUserPosts(currentPage + 1, false);
  };

  if (!userProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.errorState}>
          <Ionicons name="person-circle-outline" size={64} color={Colors.dark.tabIconDefault} />
          <Text style={styles.errorText}>Profile not loaded</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Settings Button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowSettingsModal(true)}
      >
        <Ionicons name="settings-outline" size={24} color={Colors.dark.text} />
        {pendingXPCount > 0 && (
          <View style={styles.settingsBadge}>
            <Text style={styles.settingsBadgeText}>{pendingXPCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Demo Mode Indicator */}
      {isDemoMode && (
        <View style={styles.demoModeIndicator}>
          <Text style={styles.demoModeText}>Demo Mode</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            colors={[Colors.dark.tint]}
            tintColor={Colors.dark.tint}
          />
        }
      >
        {/* Profile Header Section */}
        <View style={styles.profileSection}>
          {/* Avatar - Google Profile Photo */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => setShowAvatarPicker(!showAvatarPicker)}
            disabled={isAvatarLoading}
          >
            {userProfile.avatar_url ? (
              <Image source={getAvatarSource(userProfile.avatar_url)} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person-circle" size={80} color={Colors.dark.tint} />
              </View>
            )}
          </TouchableOpacity>

          {/* Name + Edit */}
          {!isEditingName ? (
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{userProfile.full_name}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditName}
                disabled={isUsernameLoading}
              >
                <Ionicons name="pencil" size={16} color={Colors.dark.tint} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editNameSection}>
              <TextInput
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Enter your name"
                placeholderTextColor={Colors.dark.tabIconDefault}
                autoFocus
                maxLength={30}
              />
              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelEdit}
                  disabled={isUsernameLoading}
                >
                  <Text style={styles.cancelButtonText}>გაუქმება</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveName}
                  disabled={isUsernameLoading}
                >
                  <Text style={styles.saveButtonText}>შენახვა</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.email}>{userProfile.email}</Text>
        </View>

        {/* Avatar Picker Modal */}
        {showAvatarPicker && (
          <AvatarPicker
            selectedAvatar={selectedAvatar}
            onSelect={(avatarId) => {
              handleAvatarSelect(avatarId);
              setShowAvatarPicker(false);
            }}
            isLoading={isAvatarLoading}
          />
        )}

        {/* Points Section */}
        <View style={styles.pointsSection}>
          <StatsCard xpStats={xpStats} isLoading={isXpLoading} />
        </View>

        {/* My Posts Section */}
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>ჩემი პოსტები</Text>

          {isPostsLoading ? (
            <ScrollView style={styles.postsScrollView} nestedScrollEnabled>
              {[...Array(3)].map((_, index) => (
                <ProfilePostSkeleton key={`profile-post-skeleton-${index}`} />
              ))}
            </ScrollView>
          ) : userPosts.length === 0 ? (
            <View style={styles.emptyPostsContainer}>
              <Text style={styles.emptyPostsText}>ჯერ არ გაქვს დადასტურებული პოსტები.</Text>
              {/* <Text style={styles.emptyPostsSubtext}>
                Submit ideas in the Community tab. Once approved by admins, they&apos;ll appear here!
              </Text> */}
            </View>
          ) : (
            <ScrollView style={styles.postsScrollView} nestedScrollEnabled>
              {userPosts.map((post) => (
                <View key={post.id} style={styles.postItem}>
                  <Text style={styles.postTitle}>{post.title}</Text>
                  <View style={styles.postMeta}>
                    {/* Show upvote count but make it non-interactive for own posts */}
                    <View style={styles.upvoteDisplay}>
                      <Ionicons
                        name="heart-outline"
                        size={16}
                        color={Colors.dark.tabIconDefault}
                      />
                      <Text style={styles.upvoteCount}>
                        {post.upvotes}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              {hasMorePosts && (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={handleLoadMorePosts}
                  disabled={isPostsLoading}
                >
                  <Text style={styles.loadMoreText}>Load More</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  settingsButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBadge: {
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
  settingsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  demoModeIndicator: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(196, 255, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  demoModeText: {
    fontSize: 12,
    fontFamily: 'HamakiEng',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },

  // Profile Header Section
  profileSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarContainer: {
    marginBottom: 15,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Name + Edit Section
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  userName: {
    fontSize: 24,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    marginRight: 8,
  },
  editButton: {
    padding: 4,
  },
  editNameSection: {
    alignItems: 'center',
    marginBottom: 5,
    width: '100%',
  },
  nameInput: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    textAlign: 'center',
    marginBottom: 12,
    width: '80%',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 245, 245, 0.2)',
  },
  cancelButtonText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.tint,
  },
  saveButtonText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '600',
  },
  email: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
    textAlign: 'center',
  },

  // Section Titles
  sectionTitle: {
    fontSize: 28,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    marginBottom: 20,
    textAlign: 'center',
  },

  // Points Section
  pointsSection: {
    marginBottom: 40,
  },
  // Posts Section
  postsSection: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'HamakiGeo',
  },
  emptyPostsContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyPostsText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'HamakiGeo',
    opacity: 0.7,
    textAlign: 'center',
  },
  postsScrollView: {
    maxHeight: 300,
  },
  postItem: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  postTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  upvoteDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    opacity: 0.7, // Make it look disabled
  },
  upvoteCount: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
    fontWeight: '500',
  },
  loadMoreButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  loadMoreText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: '500',
  },
});
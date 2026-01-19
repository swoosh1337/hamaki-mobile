import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { StatsCard } from '@/components/profile/StatsCard';
import { ProfilePostSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
import { postService } from '@/services/supabase/postService';
import type { Post as UserPost } from '@/types/post';
import { getAvatarSource } from '@/utils/avatars';
import { createLogger } from '@/utils/logger';

const log = createLogger('Profile');

// Demo posts defined outside component to prevent recreation on every render
const DEMO_POSTS: (UserPost & { isUpvoted?: boolean })[] = [
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

export default function ProfileScreen() {
  const { userProfile, updateUserProfile, isDemoMode, authMethod } = useAuth();

  // Use profile hook for XP stats
  const {
    xpStats,
    isLoading: isXpLoading,
    forceRefetch: forceRefetchProfile,
    updateAvatar: updateAvatarViaHook,
    updateUsername: updateUsernameViaHook,
  } = useUserProfile({
    googleId: userProfile?.google_id,
    autoFetch: true,
  });

  // Get refresh function for YouTube verification data
  const { refreshAll } = useYouTubeVerification();

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

  const POSTS_PER_PAGE = 10;

  // Pull-to-refresh handler
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Define loadUserPosts with useCallback before useFocusEffect
  const loadUserPosts = useCallback(async (page: number = 0, reset: boolean = false) => {
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
            setUserPosts(DEMO_POSTS);
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
  }, [userProfile?.id, isDemoMode]);

  // Realtime subscription for user's posts - listen for when their posts get approved
  useRealtimeSubscription<{ id: string; status: string; user_id: string }>({
    table: 'posts',
    event: 'UPDATE',
    filter: userProfile?.id ? `user_id=eq.${userProfile.id}` : undefined,
    enabled: !!userProfile?.id && !isDemoMode,
    onPayload: (payload) => {
      // Refresh when user's post is approved
      if (payload.new?.status === 'approved') {
        log.debug('User post approved, refreshing list', { postId: payload.new.id });
        loadUserPosts(0, true);
      }
    },
  });

  // Realtime subscription for user's posts - listen for DELETE
  useRealtimeSubscription<{ id: string; user_id: string }>({
    table: 'posts',
    event: 'DELETE',
    filter: userProfile?.id ? `user_id=eq.${userProfile.id}` : undefined,
    enabled: !!userProfile?.id && !isDemoMode,
    onPayload: (payload) => {
      log.debug('User post deleted, refreshing list', { postId: payload.old?.id });
      loadUserPosts(0, true);
    },
  });

  // Refresh YouTube verification data and posts when Profile screen is focused
  useFocusEffect(
    useCallback(() => {
      if (authMethod === 'google') {
        refreshAll();
      }
      // Refresh posts when screen is focused to show newly approved posts
      if (userProfile?.id) {
        loadUserPosts(0, true);
      }
    }, [authMethod, refreshAll, userProfile?.id, loadUserPosts])
  );

  // Initialize data only when the user identity changes (not on avatar/name updates)
  useEffect(() => {
    if (userProfile?.google_id) {
      // Set initial avatar from user profile
      if (userProfile.avatar_url) {
        setSelectedAvatar(userProfile.avatar_url);
      }
    }
  }, [userProfile?.google_id, userProfile?.avatar_url]);

  const handlePullToRefresh = async () => {
    log.debug('Pull-to-refresh triggered');
    setIsRefreshing(true);
    await forceRefetchProfile();
    await loadUserPosts(0, true);
    setIsRefreshing(false);
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
        Alert.alert('წარმატება', 'ავატარი წარმატებით შეიცვალა!');
      } else {
        Alert.alert('შეცდომა', 'ავატარის ცვლილება ვერ მოხერხდა. გთხოვთ ახლიდან სცადოთ.');
      }
    } catch (error) {
      log.error('Error updating avatar', error);
      if (error instanceof Error) {
        Alert.alert('შეცდომა', error.message);
      } else {
        Alert.alert('შეცდომა', 'ავატარის ცვლილება ვერ მოხერხდა. გთხოვთ ახლიდან სცადოთ.');
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
        Alert.alert('წარმატება', 'სახელი წარმატებით შეიცვალა!');
      } else {
        Alert.alert('შეცდომა', 'სახელის ცვლილება ვერ მოხერხდა');
      }
    } catch (error) {
      log.error('Error updating name', error);
      if (error instanceof Error) {
        Alert.alert('შეცდომა', error.message);
      } else {
        Alert.alert('შეცდომა', 'სახელის ცვლილება ვერ მოხერხდა. გთხოვთ ახლიდან სცადოთ.');
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
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarGlow} />
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={() => setShowAvatarPicker(!showAvatarPicker)}
              disabled={isAvatarLoading}
            >
              {!userProfile.avatar_url ? (
                <View style={[styles.avatar, { backgroundColor: 'rgba(196, 255, 0, 0.15)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
                  <Image
                    source={require('@/assets/images/logo-transparent.webp')}
                    style={{ width: '70%', height: '70%', tintColor: Colors.dark.tint }}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <Image source={getAvatarSource(userProfile.avatar_url)} style={styles.avatar} />
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color={Colors.dark.background} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Name + Edit */}
          {!isEditingName ? (
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{userProfile.full_name}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditName}
                disabled={isUsernameLoading}
              >
                <View style={styles.editIconCircle}>
                  <Ionicons name="pencil" size={12} color={Colors.dark.tint} />
                </View>
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

          <View style={styles.emailContainer}>
            <Ionicons name="mail-outline" size={14} color={Colors.dark.text} style={{ opacity: 0.5, marginRight: 6 }} />
            <Text style={styles.email}>{userProfile.email}</Text>
          </View>
        </View>

        {/* Avatar Picker Modal */}
        {showAvatarPicker && (
          <AvatarPicker
            selectedAvatar={selectedAvatar}
            onSelect={(avatarId) => {
              handleAvatarSelect(avatarId);
              setShowAvatarPicker(false);
            }}
            onClose={() => setShowAvatarPicker(false)}
            isLoading={isAvatarLoading}
          />
        )}

        {/* Points Section */}
        <View style={styles.pointsSection}>
          <StatsCard xpStats={xpStats} isLoading={isXpLoading} />
        </View>

        {/* My Posts Section */}
        <View style={styles.postsSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitle}>ჩემი პოსტები</Text>
          </View>

          {isPostsLoading ? (
            <View style={styles.postsScrollView}>
              {[...Array(3)].map((_, index) => (
                <ProfilePostSkeleton key={`profile-post-skeleton-${index}`} />
              ))}
            </View>
          ) : userPosts.length === 0 ? (
            <View style={styles.emptyPostsContainer}>
              <Ionicons name="document-text-outline" size={48} color={Colors.dark.tabIconDefault} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={styles.emptyPostsText}>ჯერ არ გაქვს დადასტურებული პოსტები.</Text>
            </View>
          ) : (
            <View style={styles.postsColumn}>
              {userPosts.map((post) => (
                <View key={post.id} style={styles.postItem}>
                  <View style={styles.postItemHeader}>
                    <Text style={styles.postTitle} numberOfLines={1}>{post.title}</Text>
                    <View style={styles.postStatusBadge}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>APPROVED</Text>
                    </View>
                  </View>
                  <View style={styles.postMeta}>
                    <View style={styles.upvoteDisplay}>
                      <Ionicons
                        name="heart"
                        size={14}
                        color="#FF3B30"
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
                  <Text style={styles.loadMoreText}>იხილეთ მეტი</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.dark.tint} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
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
  avatarWrapper: {
    position: 'relative',
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.dark.tint,
    opacity: 0.1,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: Colors.dark.tint,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  email: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.5,
  },
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
  },
  editButton: {
    marginLeft: 10,
  },
  editIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editNameSection: {
    alignItems: 'center',
    marginBottom: 5,
    width: '100%',
  },
  nameInput: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderRadius: 12,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
  },
  sectionTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.tint,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 24,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    fontWeight: 'bold',
  },
  pointsSection: {
    marginBottom: 40,
  },
  postsSection: {
    flex: 1,
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
  postsColumn: {
    gap: 12,
  },
  postItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
  },
  postItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  postTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 12,
  },
  postStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.tint,
    marginRight: 6,
  },
  statusText: {
    color: Colors.dark.tint,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  upvoteDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upvoteCount: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 8,
  },
  loadMoreText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

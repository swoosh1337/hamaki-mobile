/**
 * Community Screen
 *
 * Displays community posts and allows users to create new posts.
 *
 * Architecture:
 * - usePosts: Data fetching and mutations via postService
 * - useRealtimeSubscription: Realtime updates for posts (uses unified hook)
 *
 * NO direct Supabase imports. NO direct DB queries.
 * All data comes through hooks which use services.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { CreatePostFAB } from '@/components/community/CreatePostFAB';
import { PostList } from '@/components/community/PostList';
import { SortFilter } from '@/components/community/SortFilter';
import { CreatePostModal } from '@/components/ideas/CreatePostModal';
import { NetworkError } from '@/components/ui/NetworkError';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { usePosts, useRealtimeSubscription } from '@/hooks';
import { postService } from '@/services/supabase/postService';
import type { PostSortOption } from '@/types';
import { isNetworkError as checkNetworkError, getUserFriendlyErrorMessage } from '@/utils/errorHandling';
import { createLogger } from '@/utils/logger';

const log = createLogger('Community');

export default function IdeasScreen() {
  const { userProfile, isDemoMode } = useAuth();

  // UI state
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [sortBy, setSortBy] = useState<PostSortOption>('upvotes');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [upvotingPosts, setUpvotingPosts] = useState<Set<string>>(new Set());

  // Use the posts hook for data management
  const {
    posts,
    isLoading,
    error: postsError,
    hasMore,
    refetch,
    loadMore,
    upvote,
    removeUpvote,
    isUpvoted: checkIsUpvoted,
  } = usePosts({
    userId: userProfile?.id,
    sortBy,
    limit: 20,
    autoFetch: true,
  });

  // Error handling state
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [showPartialError, setShowPartialError] = useState(false);

  // Convert hook error to string for compatibility with existing error UI
  const error = postsError ? getUserFriendlyErrorMessage(postsError) : null;

  // Update network error state when hook error changes
  useEffect(() => {
    if (postsError) {
      setIsNetworkError(checkNetworkError(postsError));
    }
  }, [postsError]);

  // Realtime subscription for approved posts changes (uses unified hook)
  useRealtimeSubscription<{ id: string; status: string }>({
    table: 'posts',
    filter: 'status=eq.approved',
    event: '*',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      log.debug('Posts subscription triggered', { eventType: payload.eventType });
      refetch();
    },
  });

  // Realtime subscription for upvotes changes
  useRealtimeSubscription<{ post_id: string; user_id: string }>({
    table: 'post_upvotes',
    event: '*',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      log.debug('Upvotes subscription triggered', { eventType: payload.eventType });
      refetch();
    },
  });

  // Refresh posts
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setShowPartialError(false);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  // Load more posts
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      loadMore();
    }
  }, [isLoading, hasMore, loadMore]);

  // Handle post upvote
  const handlePostUpvote = useCallback(async (postId: string) => {
    if (!userProfile?.id || upvotingPosts.has(postId)) return;

    try {
      setUpvotingPosts(prev => new Set([...prev, postId]));

      const isCurrentlyUpvoted = checkIsUpvoted(postId);

      // Call hook method for upvote/remove
      const success = isCurrentlyUpvoted
        ? await removeUpvote(postId)
        : await upvote(postId);

      if (!success) {
        Alert.alert('Error', 'Failed to update upvote. Please try again.');
      }
    } catch (error) {
      log.error('Error in handlePostUpvote', error);
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setUpvotingPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  }, [userProfile?.id, checkIsUpvoted, upvote, removeUpvote, upvotingPosts]);

  // Handle create post
  const handleCreatePost = useCallback(async (title: string, content: string) => {
    log.debug('handleCreatePost called', { title, content, userId: userProfile?.id });

    if (!userProfile?.id) {
      log.error('No user profile ID');
      throw new Error('User not authenticated');
    }

    log.debug('Setting isSubmittingPost to true');
    setIsSubmittingPost(true);

    try {
      log.debug('Calling postService.createPost...');
      const newPost = await postService.createPost({ userId: userProfile.id, title, content });
      log.info('Post created successfully', newPost);

      // Close modal
      setIsCreateModalVisible(false);

      // Success - show alert after modal closes
      setTimeout(() => {
        log.debug('Showing success alert');
        Alert.alert(
          'წარმატება!',
          'შენი იდეა გაიგზავნა განხილვისთვის! შეტყობინებას მიიღებ როცა დადასტურდება.',
          [{ text: 'OK' }]
        );
      }, 300);

      // Refresh posts after successful creation
      await refetch();
    } catch (error) {
      log.error('Error creating post', error);
      if (error instanceof Error) {
        throw error; // Let the modal handle the error
      }
      throw new Error('Failed to create post');
    } finally {
      log.debug('Setting isSubmittingPost to false');
      setIsSubmittingPost(false);
    }
  }, [userProfile?.id, refetch]);




  // Render content based on state
  const renderContent = () => {
    // Full error state (only when no posts loaded yet)
    if (error && posts.length === 0 && !isLoading) {
      return (
        <NetworkError
          message={error}
          onRetry={() => refetch()}
        />
      );
    }

    // Normal state - show centered title like Leaderboard, then scrollable content
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.topTitleContainer}>
          <Image
            source={require('@/assets/images/community.png')}
            style={styles.topTitleIcon}
            resizeMode="contain"
          />
          <Text style={styles.topTitleText}>COMMUNITY</Text>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[Colors.dark.tint]}
              tintColor={Colors.dark.tint}
            />
          }
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const paddingToBottom = 20;
            if (layoutMeasurement.height + contentOffset.y >=
              contentSize.height - paddingToBottom) {
              handleLoadMore();
            }
          }}
          scrollEventThrottle={400}
        >
          {/* Header under centered title */}
          <View style={styles.header}>
            <Text style={styles.subtitle}>გააზიარე ვიდეოს იდეა</Text>

            {isDemoMode && (
              <View style={styles.demoNotice}>
                <Text style={styles.demoNoticeText}>
                  🎭 Demo Mode - Viewing as demouser@apple.com
                </Text>
              </View>
            )}

            {/* Partial Error Banner */}
            {showPartialError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  ⚠️ Connection issue. Some content may not load.
                </Text>
              </View>
            )}

            {/* Sort Toggle Buttons */}
            <SortFilter sortBy={sortBy} onSortChange={setSortBy} />
          </View>

          {/* Posts List - Shows skeleton, empty, or posts */}
          <View style={styles.postsContainer}>
            <PostList
              posts={posts}
              isLoading={isLoading}
              error={error}
              hasMore={hasMore}
              upvotingPosts={upvotingPosts}
              onUpvote={handlePostUpvote}
              onLoadMore={handleLoadMore}
            />
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderContent()}

      {/* Floating Action Button */}
      <CreatePostFAB onPress={() => setIsCreateModalVisible(true)} />

      {/* Create Post Modal - Fixed version without ScrollView */}
      <CreatePostModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onSubmit={handleCreatePost}
        isSubmitting={isSubmittingPost}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Space for FAB
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  demoNotice: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
  },
  demoNoticeText: {
    fontSize: 13,
    fontFamily: 'HamakiGeo',
    color: '#FFA500',
    textAlign: 'center',
  },
  errorBanner: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'HamakiGeo',
    color: '#FF6B6B',
    textAlign: 'center',
  },
  connectionStatus: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  connectionStatusText: {
    fontSize: 14,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    opacity: 0.7,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleIcon: {
    width: 32,
    height: 32,
    tintColor: Colors.dark.tint,
    marginRight: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    paddingHorizontal: 8, // Prevent italic font cropping
  },
  topTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    marginBottom: 12,
    gap: 12,
  },
  topTitleIcon: {
    width: 32,
    height: 32,
    tintColor: Colors.dark.tint,
  },
  topTitleText: {
    fontSize: 32,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    opacity: 0.7,
    marginBottom: 14,
    textAlign: 'center',
  },
  postsContainer: {
    padding: 20,
  },
});

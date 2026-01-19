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

import React, { useCallback, useRef, useState } from 'react';
import {
    Alert,
    Image,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
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
import { getUserFriendlyErrorMessage } from '@/utils/errorHandling';
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

  // Ref to track which posts are currently being upvoted (used to skip realtime refetch)
  // Using a Set instead of boolean to handle multiple concurrent upvotes correctly
  const upvotingPostsRef = useRef(new Set<string>());

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

  // Convert hook error to string for compatibility with existing error UI
  const error = postsError ? getUserFriendlyErrorMessage(postsError) : null;

  // Realtime subscription for posts changes - listen for UPDATE to catch approval
  // Note: We don't filter by status because we need to catch when status changes TO approved
  useRealtimeSubscription<{ id: string; status: string }>({
    table: 'posts',
    event: 'UPDATE',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      // Only refetch if the post was just approved
      if (payload.new?.status === 'approved') {
        log.debug('Post approved, refreshing list', { postId: payload.new.id });
        refetch();
      }
    },
  });

  // Also listen for INSERT in case posts are created directly as approved (admin)
  useRealtimeSubscription<{ id: string; status: string }>({
    table: 'posts',
    event: 'INSERT',
    filter: 'status=eq.approved',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      log.debug('New approved post inserted', { postId: payload.new?.id });
      refetch();
    },
  });

  // Listen for DELETE to remove posts from the list
  useRealtimeSubscription<{ id: string }>({
    table: 'posts',
    event: 'DELETE',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      log.debug('Post deleted, refreshing list', { postId: payload.old?.id });
      refetch();
    },
  });

  // Realtime subscription for upvotes changes
  // Note: We skip refetch when the current user is upvoting to avoid
  // overwriting optimistic updates with potentially stale data
  useRealtimeSubscription<{ post_id: string; user_id: string }>({
    table: 'post_upvotes',
    event: '*',
    enabled: !!userProfile?.id,
    onPayload: (payload) => {
      // Skip refetch if we're currently upvoting any post (to preserve optimistic updates)
      if (upvotingPostsRef.current.size > 0) {
        log.debug('Upvotes subscription triggered but skipping refetch (user is upvoting)', {
          eventType: payload.eventType,
          upvotingCount: upvotingPostsRef.current.size,
        });
        return;
      }
      log.debug('Upvotes subscription triggered, refreshing', { eventType: payload.eventType });
      refetch();
    },
  });

  // Refresh posts
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
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
      upvotingPostsRef.current.add(postId); // Block realtime refetch during upvote

      const isCurrentlyUpvoted = checkIsUpvoted(postId);

      // Call hook method for upvote/remove
      const success = isCurrentlyUpvoted
        ? await removeUpvote(postId)
        : await upvote(postId);

      if (!success) {
        Alert.alert('შეცდომა', 'ლაიქის განახლება ვერ მოხერხდა. გთხოვთ ახლიდან სცადოთ.');
      }
    } catch (error) {
      log.error('Error in handlePostUpvote', error);
      if (error instanceof Error) {
        Alert.alert('შეცდომა', error.message);
      }
    } finally {
      setUpvotingPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
      upvotingPostsRef.current.delete(postId);
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
            source={require('@/assets/images/community.webp')}
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
      <StatusBar barStyle="light-content" />
      
      {/* Background Decor */}
      <View style={styles.bgDecorCircle1} />
      <View style={styles.bgDecorCircle2} />

      <SafeAreaView style={styles.safeArea}>
        {renderContent()}
      </SafeAreaView>

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
  },
  safeArea: {
    flex: 1,
  },
  bgDecorCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.dark.tint + '05',
  },
  bgDecorCircle2: {
    position: 'absolute',
    bottom: 100,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: Colors.dark.tint + '03',
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
    paddingBottom: 20,
  },
  demoNotice: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
    marginBottom: 10,
  },
  demoNoticeText: {
    fontSize: 13,
    fontFamily: 'HamakiGeo',
    color: '#FFA500',
    textAlign: 'center',
  },
  topTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    marginBottom: 12,
    gap: 12,
    zIndex: 10,
  },
  topTitleIcon: {
    width: 32,
    height: 32,
    tintColor: Colors.dark.tint,
  },
  topTitleText: {
    fontSize: 32,
    fontFamily: 'SpaceMono',
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
    width: '100%',
    paddingHorizontal: 0,
  },
  postsContainer: {
    paddingHorizontal: 20,
  },
});

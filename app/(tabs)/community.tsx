import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { CreatePostModal } from '@/components/ideas/CreatePostModal';
import { PostListItem } from '@/components/ideas/PostListItem';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, UserPost, userService } from '@/utils/supabase';

type PostWithUserData = UserPost & { 
  isUpvoted?: boolean; 
  user?: { full_name: string; avatar_url?: string } 
};

type SortOption = 'upvotes' | 'latest';

export default function IdeasScreen() {
  const { userProfile } = useAuth();
  
  // State management
  const [posts, setPosts] = useState<PostWithUserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [upvotingPosts, setUpvotingPosts] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('upvotes');

  const POSTS_PER_PAGE = 20;

  // Load posts
  const loadPosts = useCallback(async (page: number = 0, reset: boolean = false) => {
    if (!userProfile?.id) return;

    try {
      if (reset) {
        setIsLoading(true);
        setPosts([]);
      } else {
        setIsLoadingMore(true);
      }

      const newPosts = await userService.getApprovedPostsWithUserUpvotes(
        userProfile.id,
        POSTS_PER_PAGE,
        page * POSTS_PER_PAGE,
        sortBy
      );

      if (reset) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setHasMorePosts(newPosts.length === POSTS_PER_PAGE);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading posts:', error);
      Alert.alert('Error', 'Failed to load posts. Please try again.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsRefreshing(false);
    }
  }, [userProfile?.id, sortBy]);

  // Initial load
  useEffect(() => {
    if (userProfile?.id) {
      loadPosts(0, true);
    }
  }, [userProfile?.id, loadPosts]);

  // Reload posts when sort option changes
  useEffect(() => {
    if (userProfile?.id) {
      loadPosts(0, true);
    }
  }, [sortBy, loadPosts, userProfile?.id]);

  // Real-time subscriptions
  useEffect(() => {
    if (!userProfile?.id) return;

    // Subscribe to posts table changes (for new approved posts or status changes)
    const postsSubscription = supabase
      .channel('posts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: 'status=eq.approved',
        },
        (payload) => {
          console.log('Posts subscription triggered:', payload);
          
          if (payload.eventType === 'INSERT') {
            // New post approved, refresh to show it
            loadPosts(0, true);
          } else if (payload.eventType === 'UPDATE') {
            // Post updated (possibly upvotes changed), refresh if we have it in our list
            const updatedPost = payload.new as UserPost;
            const existingPost = posts.find(p => p.id === updatedPost.id);
            if (existingPost) {
              loadPosts(0, true);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to post_upvotes changes (for real-time upvote updates)
    const upvotesSubscription = supabase
      .channel('post-upvotes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_upvotes',
        },
        (payload) => {
          console.log('Upvotes subscription triggered:', payload);
          
          // Check if the upvote change affects any of our displayed posts
          const postId = payload.new?.post_id || payload.old?.post_id;
          const affectedPost = posts.find(p => p.id === postId);
          
          if (affectedPost) {
            // Refresh the specific post or all posts to get updated counts
            loadPosts(0, true);
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      console.log('Cleaning up real-time subscriptions');
      supabase.removeChannel(postsSubscription);
      supabase.removeChannel(upvotesSubscription);
    };
  }, [userProfile?.id, posts, loadPosts]);

  // Refresh posts
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadPosts(0, true);
  }, [loadPosts]);

  // Load more posts
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMorePosts && !isLoading) {
      loadPosts(currentPage + 1, false);
    }
  }, [isLoadingMore, hasMorePosts, isLoading, currentPage, loadPosts]);

  // Handle post upvote
  const handlePostUpvote = async (postId: string) => {
    if (!userProfile?.id || upvotingPosts.has(postId)) return;

    try {
      setUpvotingPosts(prev => new Set([...prev, postId]));

      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return;

      const post = posts[postIndex];
      const isCurrentlyUpvoted = post.isUpvoted;

      // Optimistic update
      const updatedPosts = [...posts];
      updatedPosts[postIndex] = {
        ...post,
        upvotes: isCurrentlyUpvoted ? post.upvotes - 1 : post.upvotes + 1,
        isUpvoted: !isCurrentlyUpvoted,
      };
      setPosts(updatedPosts);

      // Make API call
      if (isCurrentlyUpvoted) {
        await userService.downvotePost(postId, userProfile.id);
      } else {
        await userService.upvotePost(postId, userProfile.id);
      }
    } catch (error) {
      console.error('Error updating post upvote:', error);
      // Revert optimistic update on error
      loadPosts(0, true);
      
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to update upvote. Please try again.');
      }
    } finally {
      setUpvotingPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  // Handle create post
  const handleCreatePost = async (title: string, content: string, category?: string) => {
    if (!userProfile?.id) return;

    try {
      setIsSubmittingPost(true);
      await userService.createUserPost(userProfile.id, title, content, category);
      Alert.alert(
        'Success', 
        'Your idea has been submitted for review! You\'ll be notified when it\'s approved.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error creating post:', error);
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to submit your idea. Please try again.');
    } finally {
      setIsSubmittingPost(false);
    }
  };

  // Loading state
  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.loadingText}>Loading Posts...</Text>
        </View>
      </View>
    );
  }

  // Empty state
  if (!isLoading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[Colors.dark.tint]}
              tintColor={Colors.dark.tint}
            />
          }
        >
          <Ionicons name="people-outline" size={64} color={Colors.dark.tabIconDefault} />
          <Text style={styles.emptyTitle}>No Community Posts Yet</Text>
          <Text style={styles.emptyDescription}>
            Be the first to share a video idea! Your suggestions help shape future content.
          </Text>
        </ScrollView>
        
        {/* Floating Action Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setIsCreateModalVisible(true)}
        >
          <Ionicons name="add" size={24} color={Colors.dark.background} />
        </TouchableOpacity>

        {/* Create Post Modal */}
        <CreatePostModal
          visible={isCreateModalVisible}
          onClose={() => setIsCreateModalVisible(false)}
          onSubmit={handleCreatePost}
          isSubmitting={isSubmittingPost}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🌟 Community</Text>
          <Text style={styles.subtitle}>Share video ideas and vote on suggestions</Text>
          <TouchableOpacity
            style={styles.sortToggle}
            onPress={() => setSortBy(sortBy === 'latest' ? 'upvotes' : 'latest')}
          >
            <Text style={styles.sortToggleText}>
              {sortBy === 'latest' ? 'Latest' : 'Popular'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Posts List */}
        <View style={styles.postsContainer}>
          {posts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              onUpvote={handlePostUpvote}
              isUpvoting={upvotingPosts.has(post.id)}
            />
          ))}
          
          {/* Load More Button */}
          {hasMorePosts && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={Colors.dark.tint} />
              ) : (
                <Text style={styles.loadMoreText}>Load More</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsCreateModalVisible(true)}
      >
        <Ionicons name="add" size={24} color={Colors.dark.background} />
      </TouchableOpacity>

      {/* Create Post Modal */}
      <CreatePostModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onSubmit={handleCreatePost}
        isSubmitting={isSubmittingPost}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'SpaceMono',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Space for FAB
  },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  sortToggle: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    alignSelf: 'flex-start',
  },
  sortToggleText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
  postsContainer: {
    padding: 20,
  },
  loadMoreButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  loadMoreText: {
    color: Colors.dark.tint,
    fontSize: 16,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
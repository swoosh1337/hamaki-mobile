import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { UserPost } from '@/utils/supabase';

interface PostsListProps {
  posts: (UserPost & { isUpvoted?: boolean })[];
  onUpvote: (postId: string) => void;
  onLoadMore: () => void;
  isLoading?: boolean;
  hasMore?: boolean;
  currentUserId: string;
}

const MAX_CONTENT_LENGTH = 200;

export const PostsList: React.FC<PostsListProps> = ({
  posts,
  onUpvote,
  onLoadMore,
  isLoading = false,
  hasMore = true,
  currentUserId,
}) => {
  // Format date to readable format
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'Just now';
      return `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)} hours ago`;
    } else if (diffDays < 1) {
      return 'Today';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  };

  // Truncate long content
  const truncateContent = (content: string): string => {
    if (content.length <= MAX_CONTENT_LENGTH) {
      return content;
    }
    return content.slice(0, MAX_CONTENT_LENGTH) + '...';
  };

  // Handle scroll to load more
  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
    
    if (isCloseToBottom && hasMore && !isLoading) {
      onLoadMore();
    }
  };

  // Handle upvote press
  const handleUpvote = (postId: string) => {
    if (!isLoading) {
      onUpvote(postId);
    }
  };

  if (posts.length === 0 && !isLoading) {
    return (
      <View style={styles.container} testID="posts-list-container">
        <View style={styles.emptyState} testID="posts-empty-state">
          <Ionicons name="document-text-outline" size={64} color={Colors.dark.tabIconDefault} />
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySubtitle}>Share your first post to get started!</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="posts-list-container">
      <Text style={styles.sectionTitle}>Your Posts</Text>
      
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        testID="posts-scroll-view"
      >
        {posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <Text 
                style={styles.postTitle}
                testID={`post-title-${post.id}`}
              >
                {post.title}
              </Text>
              <Text style={styles.postDate}>
                {formatDate(post.created_at)}
              </Text>
            </View>
            
            <Text 
              style={styles.postContent}
              testID={`post-content-${post.id}`}
            >
              {truncateContent(post.content)}
            </Text>
            
            <View style={styles.postFooter}>
              <TouchableOpacity
                style={[
                  styles.upvoteButton,
                  post.isUpvoted && styles.upvotedButton,
                  isLoading && styles.disabledButton,
                ]}
                onPress={() => handleUpvote(post.id)}
                disabled={isLoading}
                testID={`upvote-button-${post.id}`}
                accessibilityLabel={`Upvote post ${post.title}, current count ${post.upvotes}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading }}
              >
                <Ionicons
                  name={post.isUpvoted ? "heart" : "heart-outline"}
                  size={18}
                  color={post.isUpvoted ? Colors.dark.tint : Colors.dark.tabIconDefault}
                />
                <Text 
                  style={[
                    styles.upvoteCount,
                    post.isUpvoted && styles.upvotedCount,
                  ]}
                  testID={`upvote-count-${post.id}`}
                >
                  {post.upvotes}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <View style={styles.loadingContainer} testID="posts-loading">
            <ActivityIndicator size="large" color={Colors.dark.tint} />
          </View>
        )}
        
        {/* Load more indicator */}
        {hasMore && !isLoading && posts.length > 0 && (
          <View style={styles.loadMoreContainer} testID="load-more-indicator">
            <Text style={styles.loadMoreText}>Scroll for more posts</Text>
          </View>
        )}
        
        {/* End of list message */}
        {!hasMore && posts.length > 0 && (
          <View style={styles.endOfListContainer} testID="end-of-list">
            <Text style={styles.endOfListText}>You&apos;ve reached the end!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    minHeight: 300,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
  postCard: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  postTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  postDate: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
    fontWeight: '400',
  },
  postContent: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    gap: 4,
  },
  upvotedButton: {
    backgroundColor: 'rgba(196, 255, 0, 0.2)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  upvoteCount: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
    fontWeight: '500',
  },
  upvotedCount: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadMoreContainer: {
    alignItems: 'center',
    padding: 16,
  },
  loadMoreText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
  },
  endOfListContainer: {
    alignItems: 'center',
    padding: 16,
  },
  endOfListText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
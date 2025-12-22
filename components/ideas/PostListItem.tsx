import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import type { Post as UserPost } from '@/types/post';

interface PostListItemProps {
  post: UserPost & { 
    isUpvoted?: boolean; 
    user?: { full_name: string; avatar_url?: string } 
  };
  onUpvote: (postId: string) => void;
  isUpvoting?: boolean;
}

export const PostListItem: React.FC<PostListItemProps> = React.memo(({ 
  post, 
  onUpvote,
  isUpvoting = false,
}) => {
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'tutorial': return '#4ECDC4';
      case 'feature': return '#45B7D1';
      case 'bug': return '#FF6B6B';
      case 'content': return '#96CEB4';
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'tutorial': return 'school-outline';
      case 'feature': return 'bulb-outline';
      case 'bug': return 'bug-outline';
      case 'content': return 'videocam-outline';
      default: return 'chatbubble-outline';
    }
  };

  const formattedDate = useMemo(() => {
    const date = new Date(post.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }, [post.created_at]);

  const truncateContent = (content: string, maxLength: number = 120) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <View style={styles.container}>
      {/* Header with user info and category */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          {post.user?.avatar_url ? (
            <Image source={{ uri: post.user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color={Colors.dark.tint} />
            </View>
          )}
          <View style={styles.userTextInfo}>
            <Text style={styles.userName}>{post.user?.full_name || 'Anonymous'}</Text>
            <Text style={styles.postDate}>{formattedDate}</Text>
          </View>
        </View>
        
        {post.category && (
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(post.category) + '20' }]}>
            <Ionicons 
              name={getCategoryIcon(post.category) as any} 
              size={12} 
              color={getCategoryColor(post.category)} 
            />
            <Text style={[styles.categoryText, { color: getCategoryColor(post.category) }]}>
              {post.category}
            </Text>
          </View>
        )}
      </View>

      {/* Post content */}
      <View style={styles.content}>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.description}>{truncateContent(post.content)}</Text>
      </View>

      {/* Footer with upvote button */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.upvoteButton, isUpvoting && styles.upvoteButtonDisabled]}
          onPress={() => onUpvote(post.id)}
          disabled={isUpvoting}
        >
          <Ionicons 
            name={post.isUpvoted ? "heart" : "heart-outline"} 
            size={20} 
            color={post.isUpvoted ? Colors.dark.tint : Colors.dark.tabIconDefault} 
          />
          <Text style={[
            styles.upvoteCount,
            post.isUpvoted && { color: Colors.dark.tint }
          ]}>
            {post.upvotes}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  userTextInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  postDate: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  content: {
    marginBottom: 16,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 24,
  },
  description: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    gap: 6,
  },
  upvoteButtonDisabled: {
    opacity: 0.5,
  },
  upvoteCount: {
    color: Colors.dark.tabIconDefault,
    fontSize: 16,
    fontWeight: '600',
  },
});
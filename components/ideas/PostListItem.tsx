import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import type { Post as UserPost } from '@/types/post';
import { getAvatarSource } from '@/utils/avatars';

interface PostListItemProps {
  post: UserPost & {
    isUpvoted?: boolean;
    user?: { full_name: string; avatar_url?: string }
  };
  onUpvote: (postId: string) => void;
  isUpvoting?: boolean;
}

const MAX_CONTENT_LENGTH = 120;

export const PostListItem: React.FC<PostListItemProps> = React.memo(({
  post,
  onUpvote,
  isUpvoting = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const isContentLong = post.content.length > MAX_CONTENT_LENGTH;
  const displayContent = isExpanded || !isContentLong
    ? post.content
    : post.content.substring(0, MAX_CONTENT_LENGTH) + '...';

  return (
    <View style={styles.container}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Header with user info */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image
            source={getAvatarSource(post.user?.avatar_url)}
            style={styles.avatar}
          />
          <View style={styles.userTextInfo}>
            <Text style={styles.userName}>{post.user?.full_name || 'Anonymous'}</Text>
            <Text style={styles.postDate}>{formattedDate}</Text>
          </View>
        </View>
      </View>

      {/* Post content */}
      <View style={styles.content}>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.description}>{displayContent}</Text>
        {isContentLong && (
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.seeMoreButton}
          >
            <Text style={styles.seeMoreText}>
              {isExpanded ? 'ნაკლები' : 'მეტი'}
            </Text>
          </TouchableOpacity>
        )}
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
PostListItem.displayName = 'PostListItem';

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    zIndex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 255, 0, 0.3)',
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
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 1,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 24,
    flexWrap: 'wrap', // Ensure long titles wrap
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
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    zIndex: 1,
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
  seeMoreButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: '500',
  },
});

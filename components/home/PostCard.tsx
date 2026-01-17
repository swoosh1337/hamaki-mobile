/**
 * PostCard Component
 *
 * Displays a content post (video, blog, hiring, announcement) in the home feed.
 * Supports expanded/collapsed states and type-specific actions.
 */

import React from 'react';
import {
  Alert,
  GestureResponderEvent,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import type { ContentPost } from '@/types';
import { trackVideoWatch } from '@/utils/analytics';
import { isNewPost } from '@/utils/contentSorting';
import { formatRelativeDate } from '@/utils/dateFormatting';
import { t } from '@/utils/i18n';
import { createLogger } from '@/utils/logger';

const log = createLogger('PostCard');

interface PostCardProps {
  post: ContentPost;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

/**
 * PostCard Component
 *
 * Renders a content post card with support for different post types
 * and expandable content.
 */
export const PostCard: React.FC<PostCardProps> = ({
  post,
  isExpanded,
  onToggleExpand,
}) => {
  const handleWatchVideo = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (post.type === 'video' && post.metadata.videoId) {
      trackVideoWatch(
        post.metadata.videoId,
        post.metadata.channelKey || 'unknown',
        post.title,
        post.metadata.channelName
      );

      const appUrl = `youtube://watch?v=${post.metadata.videoId}`;
      const webUrl = `https://www.youtube.com/watch?v=${post.metadata.videoId}`;
      try {
        const canOpen = await Linking.canOpenURL(appUrl);
        await Linking.openURL(canOpen ? appUrl : webUrl);
      } catch (error) {
        log.error('Error opening video URL', error, { appUrl, webUrl });
        await Linking.openURL(webUrl);
      }
    }
  };

  const handleApply = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (post.type === 'hiring' && post.metadata.applicationUrl) {
      try {
        const canOpen = await Linking.canOpenURL(post.metadata.applicationUrl);
        if (canOpen) {
          await Linking.openURL(post.metadata.applicationUrl);
        } else {
          Alert.alert(
            'ბმული მიუწვდომელია',
            'ბმულის გახსნა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        log.error('Error opening application URL', error);
        Alert.alert(
          'ბმულის შეცდომა',
          'ბმულის გახსნა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, isExpanded && styles.containerExpanded]}
      onPress={onToggleExpand}
      activeOpacity={0.85}
    >
      <Image source={{ uri: post.thumbnail }} style={styles.thumbnail} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{post.title}</Text>
          {post.type === 'announcement' && post.metadata.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{post.metadata.badge}</Text>
            </View>
          )}
        </View>

        {/* Company name for hiring posts */}
        {post.type === 'hiring' && post.metadata.company && (
          <Text style={styles.company}>{post.metadata.company}</Text>
        )}

        {/* Watch button and NEW badge for video posts */}
        {post.type === 'video' && post.metadata.videoId && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.watchButton}
              onPress={handleWatchVideo}
              activeOpacity={0.7}
            >
              <Text style={styles.watchText}>ყურება</Text>
            </TouchableOpacity>
            {isNewPost(post.publishedAt) && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>ახალი</Text>
              </View>
            )}
          </View>
        )}

        {/* Apply button for hiring posts */}
        {post.type === 'hiring' && post.metadata.applicationUrl && (
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Text style={styles.applyText}>გაგზავნა</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.excerpt} numberOfLines={isExpanded ? undefined : 2}>
          {post.excerpt}
        </Text>

        {isExpanded && <Text style={styles.fullContent}>{post.content}</Text>}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatRelativeDate(post.createdAt)}</Text>
          {post.metadata.readTimeMinutes && (
            <Text style={styles.metaText}>
              • {t('post.readTime', { minutes: post.metadata.readTimeMinutes })}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  containerExpanded: {
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#111318',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  badge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  badgeText: {
    fontFamily: 'HamakiEng',
    fontSize: 8,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  company: {
    fontSize: 13,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    opacity: 0.8,
    marginTop: 2,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    gap: 10,
  },
  watchButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  watchText: {
    fontFamily: 'HamakiGeo',
    fontSize: 13,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  newBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  newBadgeText: {
    fontFamily: 'HamakiEng',
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  applyButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
  },
  applyText: {
    fontFamily: 'HamakiGeo',
    fontSize: 13,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  excerpt: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
    marginBottom: 10,
  },
  fullContent: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.9,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 255, 0, 0.2)',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  metaText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
  },
});

export default PostCard;

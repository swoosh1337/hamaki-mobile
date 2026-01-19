/**
 * PostCard Component
 *
 * Displays a content post (video, blog, hiring, announcement) in the home feed.
 * Supports expanded/collapsed states and type-specific actions.
 */

import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
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
        let url = post.metadata.applicationUrl;

        // Add proper scheme if missing
        if (url.includes('@') && !url.includes(':')) {
          // It's an email address without mailto: scheme
          url = `mailto:${url}`;
        } else if (!url.includes('://')) {
          // It's a URL without scheme
          url = `https://${url}`;
        }

        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
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
      activeOpacity={0.9}
    >
      <BlurView
        intensity={isExpanded ? 30 : 15}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.innerContent}>
        {post.thumbnail && (
          <View style={styles.thumbnailContainer}>
            <Image source={{ uri: post.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
            {post.type === 'video' && (
              <View style={styles.playIconOverlay}>
                <View style={styles.playIconCircle}>
                  <Ionicons name="play" size={24} color="#FFFFFF" />
                </View>
              </View>
            )}
          </View>
        )}
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={isExpanded ? undefined : 2}>{post.title}</Text>
          {post.type === 'announcement' && post.metadata.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{post.metadata.badge}</Text>
            </View>
          )}
        </View>

        {/* Company name for hiring posts */}
        {post.type === 'hiring' && post.metadata.company && (
          <View style={styles.metaRow}>
            <Ionicons name="briefcase-outline" size={14} color={Colors.dark.tint} style={styles.iconMargin} />
            <Text style={styles.company}>{post.metadata.company}</Text>
          </View>
        )}

        <Text style={styles.excerpt} numberOfLines={isExpanded ? undefined : 2}>
          {post.excerpt}
        </Text>

        {/* Watch button and NEW badge for video posts */}
        {post.type === 'video' && post.metadata.videoId && isExpanded && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.watchButton}
              onPress={handleWatchVideo}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-youtube" size={20} color={Colors.dark.background} style={styles.iconMarginLarge} />
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
        {post.type === 'hiring' && post.metadata.applicationUrl && isExpanded && (
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Ionicons name="paper-plane" size={20} color={Colors.dark.background} style={styles.iconMarginLarge} />
            <Text style={styles.applyText}>გაგზავნა</Text>
          </TouchableOpacity>
        )}

        {isExpanded && <Text style={styles.fullContent}>{post.content}</Text>}

        <View style={styles.footerRow}>
          <View style={styles.metaInfo}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} style={styles.iconMargin} />
            <Text style={styles.metaText}>{formatRelativeDate(post.createdAt)}</Text>
            {post.metadata.readTimeMinutes && (
              <Text style={styles.metaText}>
                • {t('post.readTime', { minutes: post.metadata.readTimeMinutes })}
              </Text>
            )}
          </View>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={isExpanded ? Colors.dark.tint : Colors.dark.tabIconDefault} 
          />
        </View>
      </View>
    </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  innerContent: {
    flexDirection: 'row',
    padding: 12,
  },
  containerExpanded: {
    borderColor: 'rgba(196, 255, 0, 0.3)',
    backgroundColor: 'transparent',
  },
  thumbnailContainer: {
    position: 'relative',
    marginRight: 12,
    alignSelf: 'flex-start',
    width: 80,
    height: 80,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.2 }], // Scale up to crop out letterboxing
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 14,
  },
  playIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 17,
    fontFamily: 'SpaceMono',
    fontWeight: 'bold',
    flex: 1,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    flexWrap: 'wrap', // Allow title to wrap
  },
  badge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 8,
    color: Colors.dark.background,
    fontWeight: '900',
  },
  company: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  watchButton: {
    backgroundColor: Colors.dark.tint,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  watchText: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  newBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newBadgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  applyButton: {
    backgroundColor: Colors.dark.tint,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  applyText: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  excerpt: {
    color: Colors.dark.text,
    fontSize: 13,
    fontFamily: 'SpaceMono',
    lineHeight: 18,
    opacity: 0.7,
    marginTop: 2,
  },
  fullContent: {
    color: Colors.dark.text,
    fontSize: 14,
    fontFamily: 'SpaceMono',
    lineHeight: 22,
    opacity: 0.9,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 11,
    fontFamily: 'SpaceMono',
    opacity: 0.6,
  },
  iconMargin: {
    marginRight: 4,
  },
  iconMarginLarge: {
    marginRight: 6,
  },
});

export default PostCard;

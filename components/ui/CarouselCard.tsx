import { Colors } from '@/constants/Colors';
import { youtubeService } from '@/services';
import { trackCarouselTap } from '@/utils/analytics';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Post {
  id: string;
  type: 'video' | 'blog' | 'hiring' | 'announcement';
  title: string;
  excerpt: string;
  content: string;
  thumbnail: string;
  isPublished: boolean;
  publishedAt: string;
  isFeatured: boolean;
  featuredOrder: number;
  metadata: {
    videoId?: string;
    duration?: string;
    viewCount?: string;
    position?: string;
    company?: string;
    applicationUrl?: string;
    badge?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    readTimeMinutes?: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface CarouselCardProps {
  post: Post;
  onPostTap: (post: Post) => void;
}

export const CarouselCard: React.FC<CarouselCardProps> = ({ post, onPostTap }) => {
  return (
    <TouchableOpacity
      style={styles.carouselCard}
      activeOpacity={0.85}
      onPress={() => {
        trackCarouselTap(post.id, post.type);
        onPostTap(post);
      }}
      accessibilityRole="button"
      accessibilityLabel={`ნახვა ${post.type} პოსტი: ${post.title}`}
      testID={`carousel-card-${post.id}`}
    >
      <Image
        source={{ uri: post.thumbnail }}
        style={styles.carouselThumb}
        testID={`carousel-thumbnail-${post.id}`}
      />
      {post.type === 'announcement' && post.metadata.badge && (
        <View style={styles.carouselBadge} testID={`carousel-badge-${post.id}`}>
          <Text style={styles.carouselBadgeText}>{post.metadata.badge}</Text>
        </View>
      )}
      {post.type === 'video' && youtubeService.isVideoNew(post.publishedAt) && (
        <View style={styles.carouselBadge} testID={`carousel-new-badge-${post.id}`}>
          <Text style={styles.carouselBadgeText}>NEW</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  carouselCard: {
    width: 180,
    height: 100,
    marginHorizontal: 4,
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  carouselThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111318',
  },
  carouselBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  carouselBadgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 8,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
});
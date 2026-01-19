import { Colors } from '@/constants/Colors';
import { trackCarouselTap } from '@/utils/analytics';
import { isNewPost } from '@/utils/contentSorting';
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
      {post.type === 'video' && isNewPost(post.publishedAt) && (
        <View style={styles.carouselNewBadge} testID={`carousel-new-badge-${post.id}`}>
          <Text style={styles.carouselNewBadgeText}>ახალი</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  carouselCard: {
    width: 200,
    height: 112,
    marginHorizontal: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  carouselThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0B0C1A',
  },
  carouselBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  carouselBadgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    color: Colors.dark.background,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  carouselNewBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  carouselNewBadgeText: {
    fontFamily: 'HamakiGeo',
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
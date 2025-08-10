import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
// import { useAuth } from '@/contexts/AuthContext';
import { useVideos } from '@/contexts/VideoContext';
import { formatTimeAgo, isVideoNew, YouTubeVideo } from '@/utils/youtube';
import { VideoSkeleton, PostSkeleton } from '@/components/ui/SkeletonLoader';

export default function HomeScreen() {
  // Keep auth available for future header personalization
  // const { userProfile } = useAuth();
  const { videos, isLoading, error, hasNewVideos } = useVideos();
  

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header with Logo */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo-transparent.png')}
          style={[styles.logo, { width: 180, height: 150}]}
          resizeMode="contain"
        />
      </View>


      {/* Latest Videos Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>LATEST VIDEOS</Text>
        {hasNewVideos && (
          <View style={styles.newIndicator}>
            <Text style={styles.newIndicatorText}>NEW</Text>
          </View>
        )}
      </View>

      {isLoading && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.videoRow}
        >
          {[...Array(5)].map((_, index) => (
            <VideoSkeleton key={`video-skeleton-${index}`} />
          ))}
        </ScrollView>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !error && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.videoRow}
        >
          {videos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No videos found</Text>
            </View>
          ) : (
            videos.slice(0, 10).map((video) => (
              <HorizontalVideoCard key={video.id} video={video} />
            ))
          )}
        </ScrollView>
      )}

      {/* Latest Posts mock */}
      <Text style={[styles.sectionTitle, { marginLeft: 20, marginTop: 24 }]}>LATEST POSTS</Text>
      <View style={styles.postsColumn}>
        {isLoading ? (
          // Show skeleton loading for posts while videos are loading
          [...Array(3)].map((_, index) => (
            <PostSkeleton key={`post-skeleton-${index}`} />
          ))
        ) : (
          mockPosts.map((p) => (
            <View key={p.id} style={styles.postCard}>
              <Text style={styles.postTitle}>{p.title}</Text>
              <Text style={styles.postExcerpt} numberOfLines={3}>{p.excerpt}</Text>
              <View style={styles.postMetaRow}>
                <Text style={styles.postMetaText}>{formatDate(p.createdAt)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// Video Card Component (type reused by HorizontalVideoCard)
type VideoCardProps = { video: YouTubeVideo };

// Retained for potential future vertical list usage (currently unused)
// Note: keep for potential future vertical feed, not exported/used now

// Horizontal compact video card used in the carousel
function HorizontalVideoCard({ video }: VideoCardProps) {
  const timeAgo = formatTimeAgo(video.publishedAt);
  const isNew = isVideoNew(video.publishedAt);

  const handlePress = async () => {
    const appUrl = `youtube://watch?v=${video.videoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpen ? appUrl : webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  };

  return (
    <TouchableOpacity
      style={styles.hVideoCard}
      activeOpacity={0.85}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Watch ${video.title}`}
    >
      <Image source={{ uri: video.thumbnail }} style={styles.hVideoThumb} />
      <View style={styles.hVideoInfo}>
        <Text style={styles.hVideoTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.hVideoMeta} numberOfLines={1}>
          {timeAgo}{isNew ? ' • NEW' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Mock posts for now
const mockPosts = [
  {
    id: 'p-1',
    title: 'სტატია 1',
    excerpt: 'გაგოშა გამოგვიყლევდა...',
    createdAt: '2025-08-01T12:00:00Z',
  },
  {
    id: 'p-2',
    title: 'სტატია 2',
    excerpt: 'კოსტა წაგვექცა და ძირს ტისკი იპოვა...',
    createdAt: '2025-08-03T09:00:00Z',
  },
  {
    id: 'p-3',
    title: 'სტატია 3',
    excerpt: 'ვერაა კაი ამბავი',
    createdAt: '2025-08-05T19:30:00Z',
  },
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) {
    const m = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return m <= 1 ? 'Just now' : `${m} minutes ago`;
  }
  if (diffHours < 24) return `${Math.floor(diffHours)} hours ago`;
  if (diffDays < 7) return `${Math.floor(diffDays)} day(s) ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 0,
    paddingHorizontal: 20,
  },
  logo: {
    width: 180,
    height: 72,
    marginBottom: 0,
  },
  brandText: {
    fontFamily: 'HamakiGeo',
    fontSize: 32,
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  videoRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  hVideoCard: {
    width: 220,
    marginHorizontal: 4,
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  hVideoThumb: {
    width: '100%',
    height: 120,
    backgroundColor: '#111318',
  },
  hVideoInfo: {
    padding: 10,
  },
  hVideoTitle: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 36,
  },
  hVideoMeta: {
    color: Colors.dark.tabIconDefault,
    fontSize: 11,
    marginTop: 2,
  },
  xpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 30,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    paddingVertical: 15,
    borderRadius: 15,
    marginHorizontal: 20,
  },
  xpLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
    marginRight: 10,
  },
  xpValue: {
    fontFamily: 'SpaceMono',
    fontSize: 20,
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginLeft: 20,
  },
  sectionTitle: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: 'bold',
    marginRight: 10,
  },
  newIndicator: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newIndicatorText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  videoCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(196, 255, 0, 0.05)',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  videoContent: {
    flexDirection: 'row',
  },
  thumbnailContainer: {
    marginRight: 15,
  },
  thumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    marginBottom: 8,
  },
  videoInfo: {
    flex: 1,
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  videoTitle: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 10,
  },
  newBadge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  videoMeta: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  watchButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: 'center',
    width: 80,
  },
  watchText: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
    marginTop: 15,
    opacity: 0.7,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  postsColumn: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  postCard: {
    backgroundColor: 'rgba(245,245,245,0.05)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,255,0,0.2)',
  },
  postTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  postExcerpt: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
    marginBottom: 10,
  },
  postMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  postMetaText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
  },
});

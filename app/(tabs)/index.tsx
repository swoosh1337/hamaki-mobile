import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
// import { useAuth } from '@/contexts/AuthContext';
import { CarouselCard } from '@/components/ui/CarouselCard';
import { InlineError } from '@/components/ui/InlineError';
import { CarouselSkeleton, PostSkeleton } from '@/components/ui/SkeletonLoader';
import { useContent } from '@/contexts/ContentContext';
import { trackPostClose, trackPostOpen } from '@/utils/analytics';
import { isNewPost, sortPostsHybrid } from '@/utils/contentSorting';
import { createLogger } from '@/utils/logger';

const log = createLogger('Home');

// Unified Post Types
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

export default function HomeScreen() {
  // Keep auth available for future header personalization
  // const { userProfile } = useAuth();
  const { posts, featuredPosts, isLoading, error, refreshContent, isNetworkError } = useContent();
  const [expandedPostId, setExpandedPostId] = React.useState<string | null>(null);
  const expandStartedAtRef = React.useRef<number | null>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);

  // Sort posts using extracted utility
  const sortedPosts = React.useMemo(() => sortPostsHybrid(posts), [posts]);

  const handleCarouselPostTap = async (post: Post) => {
    if (post.type === 'video' && post.metadata.videoId) {
      // Open video in YouTube app
      const appUrl = `youtube://watch?v=${post.metadata.videoId}`;
      const webUrl = `https://www.youtube.com/watch?v=${post.metadata.videoId}`;
      try {
        const canOpen = await Linking.canOpenURL(appUrl);
        await Linking.openURL(canOpen ? appUrl : webUrl);
      } catch {
        await Linking.openURL(webUrl);
      }
    } else {
      // Scroll to post in list and expand it
      if (expandedPostId !== post.id) {
        expandStartedAtRef.current = Date.now();
        trackPostOpen(post.id, 'carousel');
      }
      setExpandedPostId(post.id);
      // Scroll to posts section (approximate position)
      scrollViewRef.current?.scrollTo({ y: 500, animated: true });
    }
  };

  const handleToggleExpand = (post: Post) => {
    const now = Date.now();
    if (expandedPostId === post.id) {
      // collapsing
      if (expandStartedAtRef.current) {
        const dwell = Math.max(0, now - expandStartedAtRef.current);
        trackPostClose(post.id, dwell, 'list');
      }
      expandStartedAtRef.current = null;
      setExpandedPostId(null);
    } else {
      // expanding
      expandStartedAtRef.current = now;
      trackPostOpen(post.id, 'list');
      setExpandedPostId(post.id);
    }
  };

  const handleRetry = async () => {
    await refreshContent();
  };

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header with Logo */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo-transparent.png')}
          style={[styles.logo, { width: 140, height: 120 }]}
          resizeMode="contain"
        />
      </View>


      {/* Featured Carousel Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>გამორჩეული</Text>
      </View>

      {isLoading && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselRow}
        >
          {[...Array(4)].map((_, index) => (
            <CarouselSkeleton key={`carousel-skeleton-${index}`} />
          ))}
        </ScrollView>
      )}

      {error && (
        <InlineError
          message={isNetworkError ? 'Unable to connect. Check your internet connection.' : error}
          onRetry={handleRetry}
          compact
        />
      )}

      {!isLoading && !error && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselRow}
        >
          {featuredPosts.map((post) => (
            <CarouselCard key={post.id} post={post} onPostTap={handleCarouselPostTap} />
          ))}
        </ScrollView>
      )}

      {/* Latest Posts mock */}
      <Text style={[styles.sectionTitle, { marginLeft: 20, marginTop: 24 }]}>ბოლო პოსტები</Text>
      <View style={styles.postsColumn}>
        {isLoading ? (
          // Show skeleton loading for posts while videos are loading
          [...Array(3)].map((_, index) => (
            <PostSkeleton key={`post-skeleton-${index}`} />
          ))
        ) : error ? (
          <InlineError
            message={isNetworkError ? 'Unable to load posts. Check your connection.' : 'Failed to load posts'}
            onRetry={handleRetry}
          />
        ) : (
          sortedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isExpanded={expandedPostId === post.id}
              onToggleExpand={() => handleToggleExpand(post)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

// Legacy components removed - using new carousel system

// CarouselCard component extracted to separate file

// Post Card Component for the posts list
function PostCard({ post, isExpanded, onToggleExpand }: { post: Post; isExpanded: boolean; onToggleExpand: () => void }) {
  const handleWatchVideo = async (e: any) => {
    e.stopPropagation(); // Prevent card expansion when button is pressed
    if (post.type === 'video' && post.metadata.videoId) {
      const appUrl = `youtube://watch?v=${post.metadata.videoId}`;
      const webUrl = `https://www.youtube.com/watch?v=${post.metadata.videoId}`;
      try {
        const canOpen = await Linking.canOpenURL(appUrl);
        await Linking.openURL(canOpen ? appUrl : webUrl);
      } catch {
        await Linking.openURL(webUrl);
      }
    }
  };

  const handleApply = async (e: any) => {
    e.stopPropagation(); // Prevent card expansion when button is pressed
    if (post.type === 'hiring' && post.metadata.applicationUrl) {
      try {
        const canOpen = await Linking.canOpenURL(post.metadata.applicationUrl);
        if (canOpen) {
          await Linking.openURL(post.metadata.applicationUrl);
        }
      } catch (error) {
        log.error('Error opening application URL', error);
      }
    }
  };

  return (
    <TouchableOpacity
      style={[styles.postCard, isExpanded && styles.postCardExpanded]}
      onPress={onToggleExpand}
      activeOpacity={0.85}
    >
      <Image source={{ uri: post.thumbnail }} style={styles.postThumbnail} />
      <View style={styles.postContent}>
        <View style={styles.postHeader}>
          <Text style={styles.postTitle}>{post.title}</Text>
          {post.type === 'announcement' && post.metadata.badge && (
            <View style={styles.postBadge}>
              <Text style={styles.postBadgeText}>{post.metadata.badge}</Text>
            </View>
          )}
        </View>
        {/* Company name for hiring posts */}
        {post.type === 'hiring' && post.metadata.company && (
          <Text style={styles.postCompany}>{post.metadata.company}</Text>
        )}
        {/* Watch button and NEW badge for video posts */}
        {post.type === 'video' && post.metadata.videoId && (
          <View style={styles.postButtonRow}>
            <TouchableOpacity
              style={styles.postWatchButton}
              onPress={handleWatchVideo}
              activeOpacity={0.7}
            >
              <Text style={styles.postWatchText}>ყურება</Text>
            </TouchableOpacity>
            {/* NEW badge for posts published within 24 hours */}
            {isNewPost(post.publishedAt) && (
              <View style={styles.postNewBadge}>
                <Text style={styles.postNewBadgeText}>ახალი</Text>
              </View>
            )}
          </View>
        )}
        {/* Apply button for hiring posts */}
        {post.type === 'hiring' && post.metadata.applicationUrl && (
          <TouchableOpacity
            style={styles.postApplyButton}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Text style={styles.postApplyText}>Apply</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.postExcerpt} numberOfLines={isExpanded ? undefined : 2}>
          {post.excerpt}
        </Text>
        {isExpanded && (
          <Text style={styles.postFullContent}>{post.content}</Text>
        )}
        <View style={styles.postMetaRow}>
          <Text style={styles.postMetaText}>{formatDate(post.createdAt)}</Text>
          {post.metadata.readTimeMinutes && (
            <Text style={styles.postMetaText}>• {post.metadata.readTimeMinutes} min read</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}


// Mock data removed - now using real-time database content

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
    fontFamily: 'HamakiEng',
    fontSize: 32,
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  videoRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  carouselRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
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
    fontFamily: 'HamakiGeo',
    fontSize: 16,
    color: Colors.dark.text,
    marginRight: 10,
  },
  xpValue: {
    fontFamily: 'HamakiGeo',
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
    fontFamily: 'HamakiGeo',
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: 'bold',
    marginRight: 10,
  },
  newIndicator: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newIndicatorText: {
    fontFamily: 'HamakiGeo',
    fontSize: 10,
    color: '#FFFFFF',
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
    fontFamily: 'HamakiGeo',
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
    fontFamily: 'HamakiEng',
    fontSize: 10,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  videoMeta: {
    fontFamily: 'HamakiGeo',
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
    fontFamily: 'HamakiGeo',
    fontSize: 12,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: 'HamakiGeo',
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
    fontFamily: 'HamakiGeo',
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'HamakiGeo',
    fontSize: 16,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  // Carousel Styles
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
    fontFamily: 'HamakiEng',
    fontSize: 8,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },

  // Posts Styles
  postsColumn: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  postCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245,245,245,0.05)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,255,0,0.2)',
  },
  postThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#111318',
  },
  postContent: {
    flex: 1,
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
    justifyContent: 'flex-start',
  },
  postMetaText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
  },

  // New styles for expanded posts
  postCardExpanded: {
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  postBadge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  postBadgeText: {
    fontFamily: 'HamakiEng',
    fontSize: 8,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  postNewBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  postNewBadgeText: {
    fontFamily: 'HamakiEng',
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  postFullContent: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.9,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 255, 0, 0.2)',
  },
  expandedActions: {
    marginTop: 12,
    alignItems: 'center',
  },
  postButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    gap: 10,
  },
  postWatchButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  postWatchText: {
    fontFamily: 'HamakiGeo',
    fontSize: 13,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  postCompany: {
    fontSize: 13,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    opacity: 0.8,
    marginTop: 2,
    marginBottom: 4,
  },
  postApplyButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
  },
  postApplyText: {
    fontFamily: 'HamakiEng',
    fontSize: 13,
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  // tapToCollapseText style removed
});

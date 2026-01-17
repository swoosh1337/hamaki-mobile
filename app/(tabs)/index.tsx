import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PostCard } from '@/components/home/PostCard';
import { CarouselCard } from '@/components/ui/CarouselCard';
import { InlineError } from '@/components/ui/InlineError';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { CarouselSkeleton, PostSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/Colors';
import { useContent } from '@/contexts/ContentContext';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
import type { ContentPost } from '@/types';
import { trackPostClose, trackPostOpen } from '@/utils/analytics';
import { sortPostsHybrid } from '@/utils/contentSorting';

export default function HomeScreen() {
  const { posts, featuredPosts, isLoading, error, refreshContent, isNetworkError } = useContent();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const expandStartedAtRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Get pending XP count for settings badge
  const { pendingActionCount: pendingXPCount } = useYouTubeVerification();

  // Sort posts using extracted utility
  const sortedPosts = useMemo(() => sortPostsHybrid(posts), [posts]);

  const handleCarouselPostTap = async (post: ContentPost) => {
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

  const handleToggleExpand = (post: ContentPost) => {
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
    <SafeAreaView style={styles.safeArea}>
      {/* Settings Button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowSettingsModal(true)}
      >
        <Ionicons name="settings-outline" size={24} color={Colors.dark.text} />
        {pendingXPCount > 0 && (
          <View style={styles.settingsBadge}>
            <Text style={styles.settingsBadgeText}>{pendingXPCount}</Text>
          </View>
        )}
      </TouchableOpacity>

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
          message={isNetworkError ? 'კავშირის დამყარება ვერ მოხერხდა. შეამოწმეთ ინტერნეტ კავშირი.' : error}
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
            message={isNetworkError ? 'პოსტების ჩატვირთვა ვერ მოხერხდა. შეამოწმეთ კავშირი.' : 'პოსტების ჩატვირთვა ვერ მოხერხდა'}
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

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 10,
  },
  settingsButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  settingsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
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
  carouselRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
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
  postsColumn: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
});

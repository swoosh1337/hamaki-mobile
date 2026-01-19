import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Linking, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const [postsSectionY, setPostsSectionY] = useState<number | null>(null);

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
      if (postsSectionY !== null) {
        scrollViewRef.current?.scrollTo({ y: postsSectionY, animated: true });
      }
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

  const handlePostsLayout = useCallback((event: { nativeEvent: { layout: { y: number } } }) => {
    setPostsSectionY(event.nativeEvent.layout.y);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Background Decor */}
      <View style={styles.bgDecorCircle1} />
      <View style={styles.bgDecorCircle2} />

      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLogoContainer}>
            <Image
              source={require('@/assets/images/logo-transparent.webp')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettingsModal(true)}
            activeOpacity={0.7}
          >
            <BlurView intensity={20} tint="light" style={styles.settingsBlur}>
              <Ionicons name="settings-sharp" size={22} color={Colors.dark.text} />
              {pendingXPCount > 0 && (
                <View style={styles.settingsBadge}>
                  <Text style={styles.settingsBadgeText}>{pendingXPCount}</Text>
                </View>
              )}
            </BlurView>
          </TouchableOpacity>
        </View>

        <ScrollView 
          ref={scrollViewRef} 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Featured Carousel Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleDot} />
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
            <View style={styles.errorContainer}>
              <InlineError
                message={isNetworkError ? 'კავშირის დამყარება ვერ მოხერხდა. შეამოწმეთ ინტერნეტ კავშირი.' : error}
                onRetry={handleRetry}
                compact
              />
            </View>
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

          {/* Latest Posts */}
          <View style={styles.postsSection} onLayout={handlePostsLayout}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleDot} />
              <Text style={styles.sectionTitle}>ბოლო პოსტები</Text>
            </View>
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
          </View>
        </ScrollView>

        {/* Settings Modal */}
        <SettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  safeArea: {
    flex: 1,
  },
  bgDecorCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.dark.tint + '05',
  },
  bgDecorCircle2: {
    position: 'absolute',
    bottom: 100,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: Colors.dark.tint + '03',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 10,
  },
  headerLogoContainer: {
    flex: 1,
    alignItems: 'center',
    marginLeft: 44, // Offset for settings button to keep logo centered
  },
  logo: {
    width: 280,
    height: 120,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  settingsBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingsBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: Colors.dark.background,
  },
  settingsBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  carouselRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  errorContainer: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.tint,
    marginRight: 10,
  },
  sectionTitle: {
    fontFamily: 'HamakiGeo',
    fontSize: 18,
    color: Colors.dark.text,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  postsSection: {
    marginTop: 32,
  },
  postsColumn: {
    paddingHorizontal: 16,
    gap: 12,
  },
});

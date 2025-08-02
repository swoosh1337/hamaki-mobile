import React from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useVideos } from '@/contexts/VideoContext';
import { formatTimeAgo, isVideoNew, YouTubeVideo } from '@/utils/youtube';

export default function HomeScreen() {
  const { userProfile } = useAuth();
  const { videos, isLoading, error, hasNewVideos } = useVideos();
  
  // Calculate XP percentage for progress bar (mock calculation)
  const xpProgress = Math.min((userProfile?.xp_points || 0) / 1000, 1); // Assuming 1000 XP = 100%
  const xpPercentage = Math.round(xpProgress * 100);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header with Logo */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo-transparent.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>HAMAKI</Text>
      </View>

      {/* XP Progress Bar */}
      <View style={styles.xpContainer}>
        <View style={styles.xpBar}>
          <View style={[styles.xpProgress, { width: `${xpPercentage}%` }]} />
        </View>
        <Text style={styles.xpText}>{xpPercentage}%</Text>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.loadingText}>Loading latest videos...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !error && videos.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No videos found</Text>
        </View>
      )}
      
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </ScrollView>
  );
}

// Video Card Component
interface VideoCardProps {
  video: YouTubeVideo;
}

function VideoCard({ video }: VideoCardProps) {
  const timeAgo = formatTimeAgo(video.publishedAt);
  const isNew = isVideoNew(video.publishedAt);

  const handleWatchPress = () => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    Linking.openURL(youtubeUrl);
  };

  return (
    <View style={styles.videoCard}>
      <View style={styles.videoContent}>
        <Image source={{ uri: video.thumbnail }} style={styles.thumbnail} />
        <View style={styles.videoInfo}>
          <View style={styles.videoHeader}>
            <Text style={styles.videoTitle} numberOfLines={2}>
              {video.title}
            </Text>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={styles.videoMeta}>
            {video.viewCount ? `${video.viewCount} views • ` : ''}{timeAgo}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.watchButton} onPress={handleWatchPress}>
        <Text style={styles.watchText}>WATCH</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  brandText: {
    fontFamily: 'HamakiGeo',
    fontSize: 32,
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  xpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  xpBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(196, 255, 0, 0.2)',
    borderRadius: 4,
    marginRight: 15,
  },
  xpProgress: {
    height: '100%',
    backgroundColor: Colors.dark.tint,
    borderRadius: 4,
  },
  xpText: {
    fontFamily: 'SpaceMono',
    fontSize: 16,
    color: Colors.dark.text,
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
    marginBottom: 15,
  },
  thumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
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
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignSelf: 'center',
  },
  watchText: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
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
});

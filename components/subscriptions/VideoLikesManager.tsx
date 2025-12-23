import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
import { createLogger } from '@/utils/logger';

const log = createLogger('VideoLikesManager');

export const VideoLikesManager: React.FC = () => {
  const {
    videoLikeStatuses,
    isLoadingVideoLikes,
    videoLikeError,
    verifyVideoLikes,
    totalVideoLikeXP,
  } = useYouTubeVerification();

  const handleCheckVideoLikes = async () => {
    try {
      await verifyVideoLikes();
      Alert.alert('Success', 'Video likes checked successfully!');
    } catch (error) {
      log.error('Error checking video likes', error);
      Alert.alert('Error', 'Failed to check video likes. Please try again.');
    }
  };

  const openVideo = (videoId: string) => {
    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
  };

  const earnedXP = videoLikeStatuses
    .filter(s => s.xpAwarded)
    .reduce((sum, status) => sum + status.xpReward, 0);
  const rawPercent = totalVideoLikeXP > 0 ? (earnedXP / totalVideoLikeXP) * 100 : 0;
  const percent = Math.max(0, Math.min(100, rawPercent));

  if (isLoadingVideoLikes && videoLikeStatuses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.loadingText}>Checking video likes...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>დაალაიქე ჩვენი ვიდეობი</Text>
        <Text style={styles.subtitle}>
          დააგროვე XP ჩვენი ახალი ვიდეოების დალაიქებით
        </Text>

        {/* XP Progress */}
        <View style={styles.xpProgress}>
          <Text style={styles.xpText}>
            {earnedXP} / {totalVideoLikeXP} XP მიღებულია
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${percent}%` }
              ]}
            />
          </View>
        </View>

        {/* Refresh Button */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleCheckVideoLikes}
          disabled={isLoadingVideoLikes}
        >
          {isLoadingVideoLikes ? (
            <ActivityIndicator size="small" color={Colors.dark.background} />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color={Colors.dark.background} />
              <Text style={styles.refreshButtonText}>გადაამოწმე</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Video List */}
      <View style={styles.videoList}>
        {videoLikeStatuses.map((status) => (
          <View key={status.channelKey} style={styles.videoCard}>
            <View style={styles.videoHeader}>
              <View style={styles.channelInfo}>
                <Ionicons
                  name="logo-youtube"
                  size={24}
                  color="#FF0000"
                />
                <Text style={styles.channelName}>{status.channelName}</Text>
              </View>
              <View style={styles.xpBadge}>
                <Text style={styles.xpBadgeText}>+{status.xpReward} XP</Text>
              </View>
            </View>

            {status.latestVideoId && status.videoTitle ? (
              <>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {status.videoTitle}
                </Text>

                {/* Like Status and Actions */}
                <View style={styles.videoActions}>
                  <View style={styles.likeStatus}>
                    <Ionicons
                      name={status.isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                      size={20}
                      color={status.isLiked ? Colors.dark.tint : Colors.dark.tabIconDefault}
                    />
                    <Text style={[
                      styles.likeStatusText,
                      status.isLiked && styles.likeStatusTextActive
                    ]}>
                      {status.isLiked ? 'Liked' : 'Not Liked'}
                    </Text>
                  </View>

                  {/* XP Status */}
                  {status.xpAwarded ? (
                    <View style={styles.xpAwarded}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.tint} />
                      <Text style={styles.xpAwardedText}>XP Earned</Text>
                    </View>
                  ) : status.isLiked ? (
                    <View style={styles.xpPending}>
                      <Ionicons name="time-outline" size={20} color="#FFA500" />
                      <Text style={styles.xpPendingText}>Processing...</Text>
                    </View>
                  ) : null}
                </View>

                {/* Watch/Like Button */}
                {!status.isLiked && (
                  <TouchableOpacity
                    style={styles.watchButton}
                    onPress={() => openVideo(status.latestVideoId!)}
                  >
                    <Ionicons name="play-circle-outline" size={20} color={Colors.dark.background} />
                    <Text style={styles.watchButtonText}>Watch & Like</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.noVideo}>No recent video found</Text>
            )}
          </View>
        ))}
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={24} color={Colors.dark.tint} />
        <Text style={styles.infoText}>
          XP გემატება ავტომატურად, როდესაც დაალაიქებ ჩვენს ვიდეოს. დააჭირე გადამოწმების ღილაკს რომ ნახო ცვლილება.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'SpaceMono',
    marginTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'HamakiENG',
    color: Colors.dark.tint,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
    marginBottom: 16,
  },
  xpProgress: {
    marginBottom: 16,
  },
  xpText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(196, 255, 0, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dark.tint,
    borderRadius: 4,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.tint,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
    marginBottom: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: '600',
  },
  lastChecked: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.5,
    textAlign: 'center',
  },
  videoList: {
    gap: 16,
    marginBottom: 24,
  },
  videoCard: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelName: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: '600',
  },
  xpBadge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  xpBadgeText: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  videoTitle: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 12,
    lineHeight: 20,
  },
  videoActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  likeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeStatusText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tabIconDefault,
  },
  likeStatusTextActive: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  xpAwarded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  xpAwardedText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  xpPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  xpPendingText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.tint,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  watchButtonText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: '600',
  },
  noVideo: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.5,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    lineHeight: 20,
  },
});

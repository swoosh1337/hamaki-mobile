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

interface VideoLikesManagerProps {
  // Optional initial data from parent to avoid loading on mount
  initialStatuses?: import('@/types/youtube').VideoLikeStatus[];
}

export const VideoLikesManager: React.FC<VideoLikesManagerProps> = ({ initialStatuses }) => {
  const {
    videoLikeStatuses: hookStatuses,
    isLoadingVideoLikes,
    videoLikeError,
    verifyVideoLikes,
    totalVideoLikeXP,
  } = useYouTubeVerification();

  // Use initial statuses if provided and hook hasn't loaded yet
  const videoLikeStatuses = hookStatuses.length > 0 ? hookStatuses : (initialStatuses || []);

  const handleCheckVideoLikes = async () => {
    try {
      await verifyVideoLikes();
      Alert.alert('ვერიფიკაცია დასრულდა', 'ლაიქები წარმატებით გადამოწმდა!');
    } catch (error) {
      log.error('Error checking video likes', error);
      Alert.alert('ვერიფიკაცია ვერ მოხერხდა', 'სამწუხაროდ ვერიფიკაცია ვერ მოხერხდა. გთხოვთ სცადოთ თავიდან.');
    }
  };

  const openVideo = (videoId: string) => {
    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
  };

  const earnedXP = videoLikeStatuses
    .filter(s => s.xpAwarded)
    .reduce((sum, status) => sum + status.xpReward, 0);

  // Only show loading if no data at all (not even from props)
  if (isLoadingVideoLikes && videoLikeStatuses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.loadingText}>Checking video likes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{earnedXP}</Text>
          <Text style={styles.statLabel}>XP მიღებული</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalVideoLikeXP}</Text>
          <Text style={styles.statLabel}>ჯამური XP</Text>
        </View>
      </View>

      {/* Video List */}
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>დაალაიქე ახალი ვიდეობი</Text>
        <Text style={styles.sectionDescription}>
          დააგროვე XP ჩვენი ახალი ვიდეოების დალაიქებით
        </Text>

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

              {status.latestVideoId ? (
                <>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {status.videoTitle || 'Loading video details...'}
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
                        <Text style={styles.xpAwardedText}>XP მიღებულია</Text>
                      </View>
                    ) : status.isLiked ? (
                      <View style={styles.xpPending}>
                        <Ionicons name="time-outline" size={20} color="#FFA500" />
                        <Text style={styles.xpPendingText}>მუშავდება...</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Watch/Like Button or Verified State */}
                  {status.xpAwarded ? (
                    <View style={styles.likedButton}>
                      <Ionicons name="thumbs-up" size={16} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.likedButtonText}>დალაიქებულია</Text>
                    </View>
                  ) : !status.isLiked ? (
                    <TouchableOpacity
                      style={styles.watchButton}
                      onPress={() => openVideo(status.latestVideoId!)}
                    >
                      <Ionicons name="play-circle-outline" size={20} color={Colors.dark.background} />
                      <Text style={styles.watchButtonText}>უყურე და დაალაიქე</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <Text style={styles.noVideo}>ვიდეო სინქრონიზირდება...</Text>
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

      {/* Verify Button Section - Fixed at bottom */}
      <View style={styles.verifySection}>
        {videoLikeStatuses.length > 0 && videoLikeStatuses.every(s => !s.latestVideoId || s.xpAwarded) ? (
          <View style={styles.allVerifiedButton}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.tint} />
            <Text style={styles.allVerifiedButtonText}>ყველა ვიდეო გადამოწმებულია</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.verifyButton, isLoadingVideoLikes && styles.verifyButtonDisabled]}
            onPress={handleCheckVideoLikes}
            disabled={isLoadingVideoLikes}
            activeOpacity={0.7}
          >
            {isLoadingVideoLikes ? (
              <ActivityIndicator size="small" color={Colors.dark.background} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color={Colors.dark.background} />
                <Text style={styles.verifyButtonText}>დაადასტურე ლაიქები</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'SpaceMono',
    fontWeight: 'bold',
    color: Colors.dark.tint,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(196, 255, 0, 0.3)',
    marginHorizontal: 16,
  },
  scrollArea: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'HamakiENG',
    color: Colors.dark.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
    marginBottom: 16,
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
  likedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  likedButtonText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tabIconDefault,
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
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    lineHeight: 20,
  },
  verifySection: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 255, 0, 0.2)',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.tint,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  allVerifiedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(196, 255, 0, 0.15)',
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  allVerifiedButtonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
});

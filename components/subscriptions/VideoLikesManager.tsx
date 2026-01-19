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
import type { VideoLikeStatus } from '@/types/youtube';
import { createLogger } from '@/utils/logger';

const log = createLogger('VideoLikesManager');

interface VideoLikesManagerProps {
  // Optional initial data from parent to avoid loading on mount
  initialStatuses?: VideoLikeStatus[];
}

export const VideoLikesManager: React.FC<VideoLikesManagerProps> = ({ initialStatuses }) => {
  const {
    videoLikeStatuses: hookStatuses,
    isLoadingVideoLikes,
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
    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`).catch((error) => {
      log.error('Failed to open video URL', error, { videoId });
      Alert.alert('შეცდომა', 'ვიდეოს გახსნა ვერ მოხერხდა. გთხოვთ დააინსტალიროთ YouTube აპლიკაცია.');
    });
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
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleDot} />
          <Text style={styles.sectionTitle}>დაალაიქე ახალი ვიდეობი</Text>
        </View>
        <Text style={styles.sectionDescription}>
          დააგროვე XP ჩვენი ახალი ვიდეოების დალაიქებით
        </Text>

        <View style={styles.videoList}>
          {videoLikeStatuses.map((status) => (
            <View key={status.channelKey} style={styles.videoCard}>
              <View style={styles.videoHeader}>
                <View style={styles.channelInfo}>
                  <View style={styles.channelIconContainer}>
                    <Ionicons
                      name="logo-youtube"
                      size={20}
                      color="#FF0000"
                    />
                  </View>
                  <Text style={styles.channelName}>{status.channelName}</Text>
                </View>
                <View style={styles.xpBadge}>
                  <Text style={styles.xpBadgeText}>+{status.xpReward} XP</Text>
                </View>
              </View>

              {status.latestVideoId ? (
                <>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {status.videoTitle || 'ვიდეოს დეტალები იტვირთება...'}
                  </Text>

                  {/* Like Status and Actions */}
                  <View style={styles.videoActions}>
                    <View style={styles.likeStatus}>
                      <Ionicons
                        name={status.isLiked ? 'heart' : 'heart-outline'}
                        size={18}
                        color={status.isLiked ? '#FF3B30' : Colors.dark.tabIconDefault}
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
                        <View style={styles.statusDot} />
                        <Text style={styles.xpAwardedText}>XP მიღებულია</Text>
                      </View>
                    ) : status.isLiked ? (
                      <View style={styles.xpPending}>
                        <Ionicons name="time" size={16} color="#FFA500" />
                        <Text style={styles.xpPendingText}>მუშავდება...</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Watch/Like Button or Verified State */}
                  {status.xpAwarded ? (
                    <View style={styles.verifiedState}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.dark.tint} />
                      <Text style={styles.verifiedText}>გადამოწმებულია</Text>
                    </View>
                  ) : !status.isLiked ? (
                    <TouchableOpacity
                      style={styles.watchButton}
                      onPress={() => openVideo(status.latestVideoId!)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={18} color={Colors.dark.background} />
                      <Text style={styles.watchButtonText}>უყურე და დაალაიქე</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.likedState}>
                      <Ionicons name="heart" size={18} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.likedStateText}>დალაიქებულია</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.noVideo}>ვიდეო სინქრონიზირდება...</Text>
              )}
            </View>
          ))}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors.dark.tint} />
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.tint,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: 'bold',
  },
  sectionDescription: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: 16,
    lineHeight: 18,
  },
  videoList: {
    gap: 12,
    marginBottom: 24,
  },
  videoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
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
    flex: 1,
    gap: 10,
  },
  channelIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  channelName: {
    fontSize: 15,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: 'bold',
  },
  xpBadge: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  xpBadgeText: {
    fontSize: 11,
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
    opacity: 0.9,
  },
  videoActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  likeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeStatusText: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tabIconDefault,
  },
  likeStatusTextActive: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  xpAwarded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.tint,
  },
  xpAwardedText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  xpPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  xpPendingText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
    fontWeight: 'bold',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.tint,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  watchButtonText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  verifiedState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 255, 0, 0.05)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
  },
  verifiedText: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  likedState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  likedStateText: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tabIconDefault,
    fontWeight: 'bold',
  },
  noVideo: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.4,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 10,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(196, 255, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    lineHeight: 18,
    opacity: 0.8,
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

/**
 * Channel Subscription Manager Component
 * Displays all YouTube channels with subscription status and XP rewards
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import {
  ChannelSubscriptionStatus,
  getChannelSubscriptionStatus,
  getTotalPossibleXP,
  openYouTubeChannel,
  verifyAndSyncSubscriptions,
  YOUTUBE_CHANNELS,
} from '@/utils/channelSubscriptions';
import { createLogger } from '@/utils/logger';

const log = createLogger('ChannelSubscriptionManager');

export const ChannelSubscriptionManager: React.FC = () => {
  const { userProfile, updateUserProfile } = useAuth();
  const [subscriptions, setSubscriptions] = useState<ChannelSubscriptionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (userProfile?.google_id) {
      loadSubscriptionStatus();
    }
  }, [userProfile?.google_id]);

  const loadSubscriptionStatus = async () => {
    if (!userProfile?.google_id) return;

    try {
      setIsLoading(true);
      const statuses = await getChannelSubscriptionStatus(userProfile.google_id);
      setSubscriptions(statuses);
    } catch (error) {
      log.error('Error loading subscription status', error);
      Alert.alert('Error', 'Failed to load subscription status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (channelId: string, channelName: string) => {
    try {
      const url = openYouTubeChannel(channelId);
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open YouTube. Please install the YouTube app.');
      }
    } catch (error) {
      log.error('Error opening YouTube channel', error);
      Alert.alert('Error', 'Failed to open YouTube channel');
    }
  };

  const handleVerifySubscriptions = async () => {
    if (!userProfile?.google_id) return;

    try {
      setIsVerifying(true);

      // Get access token from auth
      const { getValidAccessToken } = await import('@/utils/auth');
      const accessToken = await getValidAccessToken();

      if (!accessToken) {
        Alert.alert(
          'Authentication Required',
          'Please sign out and sign in again to verify subscriptions.'
        );
        return;
      }

      // Verify and sync subscriptions
      const result = await verifyAndSyncSubscriptions(accessToken, userProfile.google_id);

      // Update local state
      await loadSubscriptionStatus();

      // Update user profile in context safely
      if (!result || !result.updatedUser) {
        throw new Error('Missing updated user payload from verifyAndSyncSubscriptions');
      }

      const safeXp = typeof result.updatedUser.xp_points === 'number' ? result.updatedUser.xp_points : (userProfile?.xp_points ?? 0);
      const safeYouTube = typeof result.updatedUser.youtube_subscribed === 'boolean' ? result.updatedUser.youtube_subscribed : (userProfile?.youtube_subscribed ?? false);
      const safeMiro = typeof result.updatedUser.miro_channel_subscribed === 'boolean' ? result.updatedUser.miro_channel_subscribed : (userProfile?.miro_channel_subscribed ?? false);
      const safeBastos = typeof result.updatedUser.bastos_channel_subscribed === 'boolean' ? result.updatedUser.bastos_channel_subscribed : (userProfile?.bastos_channel_subscribed ?? false);
      const safeKoro = typeof result.updatedUser.koro_channel_subscribed === 'boolean' ? result.updatedUser.koro_channel_subscribed : (userProfile?.koro_channel_subscribed ?? false);

      updateUserProfile({
        xp_points: safeXp,
        youtube_subscribed: safeYouTube,
        miro_channel_subscribed: safeMiro,
        bastos_channel_subscribed: safeBastos,
        koro_channel_subscribed: safeKoro,
      });

      // Show success message
      if (result.totalXPAwarded > 0) {
        Alert.alert(
          'Subscriptions Verified!',
          `Congratulations! You earned ${result.totalXPAwarded} XP from your channel subscriptions! 🎉`,
          [{ text: 'Awesome!', style: 'default' }]
        );
      } else {
        Alert.alert(
          'Subscriptions Verified',
          'Your subscription status has been updated. Subscribe to more channels to earn XP!'
        );
      }
    } catch (error) {
      log.error('Error verifying subscriptions', error);
      Alert.alert(
        'Verification Failed',
        'Failed to verify subscriptions. Please try again later.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const renderChannelCard = (status: ChannelSubscriptionStatus) => {
    const channel = YOUTUBE_CHANNELS[status.channelKey];

    return (
      <View key={status.channelKey} style={styles.channelCard}>
        <View style={styles.channelHeader}>
          <View style={styles.channelInfo}>
            <Ionicons
              name={status.isSubscribed ? 'checkmark-circle' : 'radio-button-off-outline'}
              size={24}
              color={status.isSubscribed ? Colors.dark.tint : Colors.dark.tabIconDefault}
            />
            <View style={styles.channelTextInfo}>
              <Text style={styles.channelName}>{status.channelName}</Text>
              {status.xpAwarded && (
                <View style={styles.awardedBadge}>
                  <Ionicons name="star" size={12} color={Colors.dark.background} />
                  <Text style={styles.awardedText}>XP Claimed</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.xpBadge}>
            <Text style={styles.xpAmount}>+{status.xpReward}</Text>
            <Text style={styles.xpLabel}>XP</Text>
          </View>
        </View>

        <View style={styles.channelActions}>
          {status.isSubscribed ? (
            <View style={styles.subscribedIndicator}>
              <Ionicons name="checkmark" size={16} color={Colors.dark.tint} />
              <Text style={styles.subscribedText}>Subscribed</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => handleSubscribe(status.channelId, status.channelName)}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-youtube" size={16} color={Colors.dark.background} />
              <Text style={styles.subscribeButtonText}>Subscribe</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.loadingText}>Loading subscriptions...</Text>
      </View>
    );
  }

  const totalPossibleXP = getTotalPossibleXP();
  const earnedXP = subscriptions
    .filter((s) => s.isSubscribed && s.xpAwarded)
    .reduce((sum, s) => sum + s.xpReward, 0);
  const subscribedCount = subscriptions.filter((s) => s.isSubscribed).length;
  const totalChannels = subscriptions.length;

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{subscribedCount}/{totalChannels}</Text>
          <Text style={styles.statLabel}>Channels</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{earnedXP}</Text>
          <Text style={styles.statLabel}>XP Earned</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalPossibleXP}</Text>
          <Text style={styles.statLabel}>Total XP</Text>
        </View>
      </View>

      {/* Channel List */}
      <ScrollView style={styles.channelList} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>YouTube Channels</Text>
        <Text style={styles.sectionDescription}>
          Subscribe to our channels and verify to earn bonus XP points!
        </Text>

        {subscriptions.map(renderChannelCard)}

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.dark.tint} />
          <Text style={styles.infoBannerText}>
            Subscribe on YouTube, then tap "Verify Subscriptions" to claim your XP rewards
          </Text>
        </View>
      </ScrollView>

      {/* Verify Button */}
      <View style={styles.verifySection}>
        <TouchableOpacity
          style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
          onPress={handleVerifySubscriptions}
          disabled={isVerifying}
          activeOpacity={0.7}
        >
          {isVerifying ? (
            <ActivityIndicator size="small" color={Colors.dark.background} />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={20} color={Colors.dark.background} />
              <Text style={styles.verifyButtonText}>Verify Subscriptions</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontFamily: 'HamakiENG',
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
    backgroundColor: 'rgba(196, 255, 0, 0.2)',
    marginHorizontal: 12,
  },
  channelList: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'HamakiENG',
    color: Colors.dark.tint,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
    marginBottom: 20,
    lineHeight: 20,
  },
  channelCard: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  channelTextInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  xpBadge: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  xpAmount: {
    fontSize: 18,
    fontFamily: 'HamakiENG',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  xpLabel: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    opacity: 0.8,
  },
  channelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  subscribeButtonText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF',
    fontWeight: '600',
  },
  subscribedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  subscribedText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: '500',
  },
  awardedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    alignSelf: 'flex-start',
  },
  awardedText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: '600',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(196, 255, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    lineHeight: 18,
  },
  verifySection: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 255, 0, 0.1)',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.tint,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: '700',
  },
});

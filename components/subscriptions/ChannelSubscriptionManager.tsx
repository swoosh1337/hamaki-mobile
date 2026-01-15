/**
 * Channel Subscription Manager Component
 * Displays all YouTube channels with subscription status and XP rewards
 */

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
import { useAuth } from '@/contexts/AuthContext';
import { useYouTubeVerification } from '@/hooks/useYouTubeVerification';
import type { SubscriptionStatus } from '@/types/youtube';
import { createLogger } from '@/utils/logger';

const log = createLogger('ChannelSubscriptionManager');

interface ChannelSubscriptionManagerProps {
  // Optional initial data from parent to avoid loading on mount
  initialStatuses?: import('@/types/youtube').SubscriptionStatus[];
}

export const ChannelSubscriptionManager: React.FC<ChannelSubscriptionManagerProps> = ({ initialStatuses }) => {
  const { updateUserProfile } = useAuth();
  const {
    subscriptionStatuses: hookStatuses,
    isLoadingSubscriptions,
    verifySubscriptions,
    lastSubscriptionCheck,
    totalSubscriptionXP,
    earnedSubscriptionXP,
  } = useYouTubeVerification();

  // Use initial statuses if provided and hook hasn't loaded yet
  const subscriptionStatuses = hookStatuses.length > 0 ? hookStatuses : (initialStatuses || []);

  // Debug: Log subscription statuses to see xpAwarded values
  console.log('[ChannelSubscriptionManager] statuses:',
    subscriptionStatuses.map(s => ({ key: s.channelKey, xpAwarded: s.xpAwarded, isSubscribed: s.isSubscribed })));
  console.log('[ChannelSubscriptionManager] all xpAwarded:',
    subscriptionStatuses.every(s => s.xpAwarded),
    'length:', subscriptionStatuses.length);

  const handleSubscribe = async (channelId: string, channelName: string) => {
    try {
      const url = `https://www.youtube.com/channel/${channelId}?sub_confirmation=1`;
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
    try {
      await verifySubscriptions();

      // Update user profile in context if XP changed
      if (subscriptionStatuses.some(s => s.xpAwarded)) {
        const subStatuses = subscriptionStatuses.reduce((acc, s) => {
          if (s.channelKey === 'hamaki') acc.youtube_subscribed = s.isSubscribed;
          else acc[`${s.channelKey}_channel_subscribed`] = s.isSubscribed;
          return acc;
        }, {} as Record<string, boolean>);
        updateUserProfile(subStatuses);
      }

      // Show success message
      Alert.alert(
        'ვერიფიკაცია დასრულდა',
        `ვერიფიკაცია წარმატებით დასრულდა!`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      log.error('Error verifying subscriptions', error);
      Alert.alert(
        'ვერიფიკაცია ვერ მოხერხდა',
        'სამწუხაროდ ვერიფიკაცია ვერ მოხერხდა. გთხოვთ სცადოთ თავიდან.'
      );
    }
  };

  const renderChannelCard = (status: SubscriptionStatus) => {
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
                  <Text style={styles.awardedText}>XP მიღებულია</Text>
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
              <Text style={styles.subscribedText}>გამოწერილია</Text>
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

  // Only show loading if no data at all (not even from props)
  if (isLoadingSubscriptions && subscriptionStatuses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.loadingText}>მიმდინარეობის შემოწმება...</Text>
      </View>
    );
  }

  const subscribedCount = subscriptionStatuses.filter((s) => s.isSubscribed).length;
  const totalChannels = subscriptionStatuses.length;

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{subscribedCount}/{totalChannels}</Text>
          <Text style={styles.statLabel}>არხი</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{earnedSubscriptionXP}</Text>
          <Text style={styles.statLabel}>XP მიღებული</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalSubscriptionXP}</Text>
          <Text style={styles.statLabel}>ჯამური XP</Text>
        </View>
      </View>

      {/* Channel List */}
      <ScrollView style={styles.channelList} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>YouTube არხები</Text>
        <Text style={styles.sectionDescription}>
          გამოიწერე ჩვენი არხები და დააგროვე დამატებით XP
        </Text>

        {subscriptionStatuses.map(renderChannelCard)}

        {/* Last Verified Timestamp */}
        {lastSubscriptionCheck && (
          <Text style={styles.lastVerified}>
            Last verified: {lastSubscriptionCheck.toLocaleDateString()} at {lastSubscriptionCheck.toLocaleTimeString()}
          </Text>
        )}

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.dark.tint} />
          <Text style={styles.infoBannerText}>
            თუ არხი გამოწერილი გაქვს და ვერიფიკაცია ვერ მოხერხდა, მაშინ თავიდან გამოიწერე არხი და სცადე ვერიფიკაცია ხელახლა
          </Text>
        </View>
      </ScrollView>

      {/* Verify Button */}
      <View style={styles.verifySection}>
        {/* Check if all XP has been awarded (must have items and all awarded) */}
        {subscriptionStatuses.length > 0 && subscriptionStatuses.every(s => s.xpAwarded) ? (
          <View style={styles.allVerifiedButton}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.tint} />
            <Text style={styles.allVerifiedButtonText}>ყველა არხი გამოწერილია</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.verifyButton, isLoadingSubscriptions && styles.verifyButtonDisabled]}
            onPress={handleVerifySubscriptions}
            disabled={isLoadingSubscriptions}
            activeOpacity={0.7}
          >
            {isLoadingSubscriptions ? (
              <ActivityIndicator size="small" color={Colors.dark.background} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color={Colors.dark.background} />
                <Text style={styles.verifyButtonText}>დაადასტურე გამოწერა</Text>
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
  lastVerified: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tabIconDefault,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
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
  allVerifiedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 255, 0, 0.15)',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  allVerifiedButtonText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: '700',
  },
});

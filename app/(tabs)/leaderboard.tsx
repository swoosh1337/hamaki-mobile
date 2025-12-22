import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { NetworkError } from '@/components/ui/NetworkError';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { supabase } from '@/services/supabase/client';
import { getUserFriendlyErrorMessage } from '@/utils/errorHandling';
import { createLogger } from '@/utils/logger';

const log = createLogger('Leaderboard');

type TabType = 'weekly' | 'main' | 'prizes';

interface LeaderboardEntry {
  user_id: string;
  name: string;
  points: number;
  rank: number;
  avatar_url?: string;
}

interface PrizeItem {
  id: string;
  sponsor: string;
  thumbnail: string;
  prizes: Array<{
    rank: number;
    amount: string;
    description?: string;
  }>;
  expanded: boolean;
}

export default function LeaderboardScreen() {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('weekly');
  const [prizes, setPrizes] = useState<PrizeItem[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(true);

  // Use hooks for leaderboard data
  const {
    entries: weeklyEntries,
    isLoading: weeklyLoading,
    error: weeklyError,
    refetch: refetchWeekly,
    currentUserEntry: currentUserWeekly,
  } = useLeaderboard({
    period: 'weekly',
    limit: 10,
    currentUserId: userProfile?.id,
    autoFetch: true,
  });

  const {
    entries: mainEntries,
    isLoading: mainLoading,
    error: mainError,
    refetch: refetchMain,
    currentUserEntry: currentUserMain,
  } = useLeaderboard({
    period: 'all_time',
    limit: 10,
    currentUserId: userProfile?.id,
    autoFetch: true,
  });

  // Convert hook entries to component format
  const weeklyData = weeklyEntries.map(e => ({
    user_id: e.userId,
    name: e.fullName,
    points: e.points,
    rank: e.rank,
    avatar_url: e.avatarUrl,
  }));

  const mainData = mainEntries.map(e => ({
    user_id: e.userId,
    name: e.fullName,
    points: e.points,
    rank: e.rank,
    avatar_url: e.avatarUrl,
  }));

  // Convert current user entries to component format
  const currentUserWeeklyFormatted = currentUserWeekly ? {
    user_id: currentUserWeekly.userId,
    name: currentUserWeekly.fullName,
    points: currentUserWeekly.points,
    rank: currentUserWeekly.rank,
    avatar_url: currentUserWeekly.avatarUrl,
  } : null;

  const currentUserMainFormatted = currentUserMain ? {
    user_id: currentUserMain.userId,
    name: currentUserMain.fullName,
    points: currentUserMain.points,
    rank: currentUserMain.rank,
    avatar_url: currentUserMain.avatarUrl,
  } : null;

  // Determine loading state based on active tab
  const loading = activeTab === 'weekly' ? weeklyLoading : activeTab === 'main' ? mainLoading : prizesLoading;
  
  // Determine error state
  const error = activeTab === 'weekly' ? weeklyError : activeTab === 'main' ? mainError : null;
  const errorMessage = error ? getUserFriendlyErrorMessage(error) : null;

  useEffect(() => {
    fetchPrizes();

    // Set up realtime subscriptions
    const leaderboardChannel = supabase
      .channel('leaderboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leaderboard_entries',
        },
        (payload) => {
          log.debug('Leaderboard updated', payload);
          // Refresh leaderboard data using hooks
          refetchWeekly();
          refetchMain();
        }
      )
      .subscribe();

    const sponsorChannel = supabase
      .channel('sponsor-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sponsors',
        },
        (payload) => {
          log.debug('Sponsor updated', payload);
          // Refresh prizes data
          fetchPrizes();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sponsor_prizes',
        },
        (payload) => {
          log.debug('Prize updated', payload);
          // Refresh prizes data
          fetchPrizes();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      log.debug('Cleaning up leaderboard subscriptions');
      supabase.removeChannel(leaderboardChannel);
      supabase.removeChannel(sponsorChannel);
    };
  }, [refetchWeekly, refetchMain]);

  const fetchPrizes = async () => {
    try {
      setPrizesLoading(true);
      const { data: sponsors, error } = await supabase
        .from('sponsors')
        .select('id, name, thumbnail, description, sponsor_prizes(rank, amount, description)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        log.error('Error fetching sponsors', error);
        return;
      }

      const formattedPrizes: PrizeItem[] = sponsors?.map((sponsor: any) => ({
        id: sponsor.id,
        sponsor: sponsor.name,
        thumbnail: sponsor.thumbnail,
        prizes: sponsor.sponsor_prizes || [],
        expanded: false,
      })) || [];

      setPrizes(formattedPrizes);
    } catch (error) {
      log.error('Error fetching prizes', error);
    } finally {
      setPrizesLoading(false);
    }
  };

  const togglePrize = (prizeId: string) => {
    setPrizes(prev => 
      prev.map(prize => 
        prize.id === prizeId 
          ? { ...prize, expanded: !prize.expanded }
          : { ...prize, expanded: false }
      )
    );
  };

  const renderLeaderboardItem = (item: LeaderboardEntry) => (
    <View key={item.user_id} style={styles.leaderboardItem}>
      <Text style={styles.rankText}>{item.rank}.</Text>
      <Text style={styles.nameText}>{item.name}</Text>
      <Text style={styles.pointsText}>{item.points}</Text>
    </View>
  );

  const renderPrizeItem = (item: PrizeItem) => (
    <View key={item.id} style={styles.prizeCard}>
      <TouchableOpacity 
        style={styles.prizeThumbnailContainer}
        onPress={() => togglePrize(item.id)}
        activeOpacity={0.8}
      >
        <Image 
          source={{ uri: item.thumbnail }} 
          style={styles.prizeThumbnail}
          resizeMode="cover"
        />
        <View style={styles.sponsorLabel}>
          <Text style={styles.sponsorLabelText}>{item.sponsor}</Text>
        </View>
        <View style={styles.expandIconContainer}>
          <Text style={styles.expandIcon}>{item.expanded ? '✓' : '+'}</Text>
        </View>
      </TouchableOpacity>
      {item.expanded && (
        <View style={styles.prizeDetails}>
          {item.prizes
            .sort((a, b) => a.rank - b.rank)
            .map((prize) => (
              <Text key={prize.rank} style={styles.prizeDetailText}>
                {prize.rank}. {prize.amount}
                {prize.description ? ` - ${prize.description}` : ''}
              </Text>
            ))}
        </View>
      )}
    </View>
  );

  if (loading && !error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>LEADERBOARD</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>LEADERBOARD</Text>
        <NetworkError 
          message={errorMessage}
          onRetry={() => {
            refetchWeekly();
            refetchMain();
          }}
          isRetrying={loading}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LEADERBOARD</Text>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'weekly' && styles.activeTab]}
          onPress={() => setActiveTab('weekly')}
        >
          <Text style={[styles.tabText, activeTab === 'weekly' && styles.activeTabText]}>
            კვირის
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'main' && styles.activeTab]}
          onPress={() => setActiveTab('main')}
        >
          <Text style={[styles.tabText, activeTab === 'main' && styles.activeTabText]}>
            მთავარი
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'prizes' && styles.activeTab]}
          onPress={() => setActiveTab('prizes')}
        >
          <Text style={[styles.tabText, activeTab === 'prizes' && styles.activeTabText]}>
            პრიზები
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'weekly' && (
          <View style={styles.leaderboardContainer}>
            {currentUserWeeklyFormatted && (
              <View style={styles.currentUserItem}>
                <Text style={styles.rankText}>{currentUserWeeklyFormatted.rank}.</Text>
                <Text style={styles.nameText}>{currentUserWeeklyFormatted.name}</Text>
                <Text style={styles.pointsText}>{currentUserWeeklyFormatted.points}</Text>
              </View>
            )}
            {weeklyData.length > 0 ? (
              weeklyData.map(renderLeaderboardItem)
            ) : (
              <Text style={styles.emptyText}>No weekly data yet</Text>
            )}
          </View>
        )}

        {activeTab === 'main' && (
          <View style={styles.leaderboardContainer}>
            {currentUserMainFormatted && (
              <View style={styles.currentUserItem}>
                <Text style={styles.rankText}>{currentUserMainFormatted.rank}.</Text>
                <Text style={styles.nameText}>{currentUserMainFormatted.name}</Text>
                <Text style={styles.pointsText}>{currentUserMainFormatted.points}</Text>
              </View>
            )}
            {mainData.length > 0 ? (
              mainData.map(renderLeaderboardItem)
            ) : (
              <Text style={styles.emptyText}>No leaderboard data yet</Text>
            )}
          </View>
        )}

        {activeTab === 'prizes' && (
          <View style={styles.prizesContainer}>
            {prizes.length > 0 ? (
              prizes.map(renderPrizeItem)
            ) : (
              <Text style={styles.emptyText}>No prizes available</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.tint,
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: Colors.dark.tint,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
  },
  activeTabText: {
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  leaderboardContainer: {
    flex: 1,
  },
  currentUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginBottom: 10,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginBottom: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
  },
  rankText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    width: 40,
    textAlign: 'left',
  },
  nameText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    flex: 1,
    marginLeft: 10,
  },
  pointsText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    marginTop: 40,
    opacity: 0.5,
  },
  prizesContainer: {
    flex: 1,
    paddingBottom: 20,
  },
  prizeCard: {
    marginBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  prizeThumbnailContainer: {
    width: '100%',
    height: 150,
    position: 'relative',
  },
  prizeThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111318',
  },
  sponsorLabel: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sponsorLabelText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: 'bold',
  },
  expandIconContainer: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandIcon: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  prizeDetails: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  prizeDetailText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 8,
  },
});

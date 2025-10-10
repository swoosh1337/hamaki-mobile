import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { NetworkError } from '@/components/ui/NetworkError';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { isNetworkError as checkNetworkError, getUserFriendlyErrorMessage } from '@/utils/errorHandling';
import { supabase } from '@/utils/supabase';

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

// Helper function to get week start date (Monday)
function getWeekStartDate(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

export default function LeaderboardScreen() {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('weekly');
  const [weeklyData, setWeeklyData] = useState<LeaderboardEntry[]>([]);
  const [mainData, setMainData] = useState<LeaderboardEntry[]>([]);
  const [prizes, setPrizes] = useState<PrizeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserWeekly, setCurrentUserWeekly] = useState<LeaderboardEntry | null>(null);
  const [currentUserMain, setCurrentUserMain] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    fetchLeaderboardData();
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
          console.log('Leaderboard updated:', payload);
          // Refresh leaderboard data
          fetchLeaderboardData();
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
          console.log('Sponsor updated:', payload);
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
          console.log('Prize updated:', payload);
          // Refresh prizes data
          fetchPrizes();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      console.log('Cleaning up leaderboard subscriptions');
      supabase.removeChannel(leaderboardChannel);
      supabase.removeChannel(sponsorChannel);
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNetworkError(false);

      // Fetch weekly leaderboard
      const weekStartDate = getWeekStartDate();
      
      // First, try to fetch with user join
      let { data: weeklyEntries, error: weeklyError } = await supabase
        .from('leaderboard_entries')
        .select('user_id, points, users(full_name, avatar_url)')
        .eq('period_type', 'weekly')
        .eq('week_start_date', weekStartDate)
        .order('points', { ascending: false })
        .limit(10);

      // If foreign key relationship doesn't exist, fetch separately
      if (weeklyError && weeklyError.code === 'PGRST200') {
        console.log('Foreign key not found, fetching users separately');
        
        const { data: entries } = await supabase
          .from('leaderboard_entries')
          .select('user_id, points')
          .eq('period_type', 'weekly')
          .eq('week_start_date', weekStartDate)
          .order('points', { ascending: false })
          .limit(10);

        if (entries && entries.length > 0) {
          const userIds = entries.map(e => e.user_id);
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', userIds);

          const userMap = new Map(users?.map(u => [u.id, u]) || []);
          
          weeklyEntries = entries.map((entry: any) => ({
            ...entry,
            users: userMap.get(entry.user_id),
          }));
        }
      } else if (weeklyError) {
        console.error('Error fetching weekly leaderboard:', weeklyError);
      }

      if (weeklyEntries) {
        const formattedWeekly = weeklyEntries.map((entry: any, index: number) => ({
          user_id: entry.user_id,
          name: entry.users?.full_name || 'Unknown',
          points: entry.points,
          rank: index + 1,
          avatar_url: entry.users?.avatar_url,
        }));
        setWeeklyData(formattedWeekly);
      }

      // Fetch all-time leaderboard
      let { data: mainEntries, error: mainError } = await supabase
        .from('leaderboard_entries')
        .select('user_id, points, users(full_name, avatar_url)')
        .eq('period_type', 'all_time')
        .order('points', { ascending: false })
        .limit(10);

      // If foreign key relationship doesn't exist, fetch separately
      if (mainError && mainError.code === 'PGRST200') {
        console.log('Foreign key not found, fetching users separately');
        
        const { data: entries } = await supabase
          .from('leaderboard_entries')
          .select('user_id, points')
          .eq('period_type', 'all_time')
          .order('points', { ascending: false })
          .limit(10);

        if (entries && entries.length > 0) {
          const userIds = entries.map(e => e.user_id);
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', userIds);

          const userMap = new Map(users?.map(u => [u.id, u]) || []);
          
          mainEntries = entries.map((entry: any) => ({
            ...entry,
            users: userMap.get(entry.user_id),
          }));
        }
      } else if (mainError) {
        console.error('Error fetching main leaderboard:', mainError);
      }

      if (mainEntries) {
        const formattedMain = mainEntries.map((entry: any, index: number) => ({
          user_id: entry.user_id,
          name: entry.users?.full_name || 'Unknown',
          points: entry.points,
          rank: index + 1,
          avatar_url: entry.users?.avatar_url,
        }));
        setMainData(formattedMain);
      }

      // Fetch current user's position if logged in
      if (userProfile?.id) {
        // Weekly position
        const { data: userWeekly } = await supabase
          .from('leaderboard_entries')
          .select('points')
          .eq('period_type', 'weekly')
          .eq('week_start_date', weekStartDate)
          .eq('user_id', userProfile.id)
          .single();

        if (userWeekly) {
          // Get rank by counting users with higher points
          const { count } = await supabase
            .from('leaderboard_entries')
            .select('*', { count: 'exact', head: true })
            .eq('period_type', 'weekly')
            .eq('week_start_date', weekStartDate)
            .gt('points', userWeekly.points);

          setCurrentUserWeekly({
            user_id: userProfile.id,
            name: userProfile.full_name,
            points: userWeekly.points,
            rank: (count || 0) + 1,
            avatar_url: userProfile.avatar_url,
          });
        }

        // All-time position
        const { data: userMain } = await supabase
          .from('leaderboard_entries')
          .select('points')
          .eq('period_type', 'all_time')
          .eq('user_id', userProfile.id)
          .single();

        if (userMain) {
          const { count } = await supabase
            .from('leaderboard_entries')
            .select('*', { count: 'exact', head: true })
            .eq('period_type', 'all_time')
            .gt('points', userMain.points);

          setCurrentUserMain({
            user_id: userProfile.id,
            name: userProfile.full_name,
            points: userMain.points,
            rank: (count || 0) + 1,
            avatar_url: userProfile.avatar_url,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      const isNetwork = checkNetworkError(err);
      setIsNetworkError(isNetwork);
      setError(getUserFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchPrizes = async () => {
    try {
      const { data: sponsors, error } = await supabase
        .from('sponsors')
        .select('id, name, thumbnail, description, sponsor_prizes(rank, amount, description)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching sponsors:', error);
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
      console.error('Error fetching prizes:', error);
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

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>LEADERBOARD</Text>
        <NetworkError 
          message={isNetworkError ? 'Unable to connect. Check your internet connection.' : error}
          onRetry={fetchLeaderboardData}
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
            {currentUserWeekly && (
              <View style={styles.currentUserItem}>
                <Text style={styles.rankText}>{currentUserWeekly.rank}.</Text>
                <Text style={styles.nameText}>{currentUserWeekly.name}</Text>
                <Text style={styles.pointsText}>{currentUserWeekly.points}</Text>
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
            {currentUserMain && (
              <View style={styles.currentUserItem}>
                <Text style={styles.rankText}>{currentUserMain.rank}.</Text>
                <Text style={styles.nameText}>{currentUserMain.name}</Text>
                <Text style={styles.pointsText}>{currentUserMain.points}</Text>
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

/**
 * Leaderboard Screen
 *
 * Displays global leaderboard rankings and prizes.
 *
 * Architecture (Hybrid Leaderboard - see documentation/hybrid-leaderboard-plan.md):
 * - useLeaderboardSnapshot: Global truth (batched, no per-XP spam)
 * - useMyLeaderboardStatus: Personal rank/XP (instant from Edge Function)
 * - useSponsors: Prizes from sponsors
 *
 * NO direct Supabase imports. NO direct DB queries. NO realtime subscriptions.
 * All data comes through hooks which use services.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { NetworkError } from '@/components/ui/NetworkError';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboardSnapshot, useMyLeaderboardStatus, useSponsors } from '@/hooks';
import { trackSponsorClick } from '@/utils/analytics';
import { getUserFriendlyErrorMessage } from '@/utils/errorHandling';

type TabType = 'weekly' | 'main' | 'prizes';

interface LeaderboardDisplayEntry {
    user_id: string;
    name: string;
    points: number;
    rank: number;
    avatar_url?: string | null;
}

interface PrizeItem {
    id: string;
    sponsor: string;
    thumbnail: string;
    prizes: {
        rank: number;
        amount: string;
        description?: string;
    }[];
    expanded: boolean;
}

export default function LeaderboardScreen() {
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('weekly');
    const [expandedPrizeId, setExpandedPrizeId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Personal truth: User's own rank and XP (instant updates from Edge Function)
    const {
        isLoading: personalLoading,
    } = useMyLeaderboardStatus({
        userId: userProfile?.id,
    });

    // Global truth: Weekly leaderboard snapshot (batched refresh)
    const {
        entries: weeklyEntries,
        isLoading: weeklyLoading,
        error: weeklyError,
        refetch: refetchWeekly,
    } = useLeaderboardSnapshot({
        periodType: 'weekly',
        limit: 10,
    });

    // Global truth: Monthly leaderboard snapshot (batched refresh)
    const {
        entries: mainEntries,
        isLoading: mainLoading,
        error: mainError,
        refetch: refetchMain,
    } = useLeaderboardSnapshot({
        periodType: 'monthly',
        limit: 10,
    });

    // Sponsors and prizes
    const {
        sponsors,
        isLoading: prizesLoading,
        refetch: refetchPrizes,
    } = useSponsors();

    // Convert snapshot entries to display format
    const weeklyData: LeaderboardDisplayEntry[] = weeklyEntries.map(e => ({
        user_id: e.userId,
        name: e.fullName,
        points: e.totalXP, // Weekly uses total XP (game + subscription + video)
        rank: e.rank,
        avatar_url: e.avatarUrl,
    }));

    const mainData: LeaderboardDisplayEntry[] = mainEntries.map(e => ({
        user_id: e.userId,
        name: e.fullName,
        points: e.totalXP, // Main uses total XP
        rank: e.rank,
        avatar_url: e.avatarUrl,
    }));

    // Convert sponsors to prize display format
    const prizes: PrizeItem[] = sponsors.map(s => ({
        id: s.id,
        sponsor: s.name,
        thumbnail: s.thumbnail,
        prizes: s.prizes,
        expanded: s.id === expandedPrizeId,
    }));

    // Determine loading state based on active tab
    const loading = activeTab === 'weekly'
        ? weeklyLoading || personalLoading
        : activeTab === 'main'
            ? mainLoading || personalLoading
            : prizesLoading;

    // Determine error state
    const error = activeTab === 'weekly' ? weeklyError : activeTab === 'main' ? mainError : null;
    const errorMessage = error ? getUserFriendlyErrorMessage(error) : null;

    const togglePrize = (prizeId: string) => {
        // Track sponsor click for analytics dashboard
        const sponsor = sponsors.find(s => s.id === prizeId);
        if (sponsor) {
            trackSponsorClick(prizeId, sponsor.name);
        }

        setExpandedPrizeId(prev => prev === prizeId ? null : prizeId);
    };

    const handleRetry = () => {
        refetchWeekly();
        refetchMain();
        refetchPrizes();
    };

    // Pull-to-refresh handler
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            if (activeTab === 'weekly') {
                await refetchWeekly();
            } else if (activeTab === 'main') {
                await refetchMain();
            } else {
                await refetchPrizes();
            }
        } finally {
            setIsRefreshing(false);
        }
    }, [activeTab, refetchWeekly, refetchMain, refetchPrizes]);

    const renderLeaderboardItem = (item: LeaderboardDisplayEntry) => {
        const isCurrentUser = userProfile?.id === item.user_id;
        return (
            <View
                key={`${item.user_id}-${item.rank}`}
                style={[styles.leaderboardItem, isCurrentUser && styles.currentUserItem]}
            >
                <Text style={[styles.rankText, isCurrentUser && styles.currentUserText]}>{item.rank}.</Text>
                <Text style={[styles.nameText, isCurrentUser && styles.currentUserText]}>{item.name}</Text>
                <Text style={[styles.pointsText, isCurrentUser && styles.currentUserText]}>{item.points}</Text>
            </View>
        );
    };

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
                    {item.prizes.map((prize) => (
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
                    onRetry={handleRetry}
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
                        თვის
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

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        colors={[Colors.dark.tint]}
                        tintColor={Colors.dark.tint}
                        progressBackgroundColor={Colors.dark.background}
                    />
                }
            >
                {activeTab === 'weekly' && (
                    <View style={styles.leaderboardContainer}>
                        {weeklyData.length > 0 ? (
                            weeklyData.map(renderLeaderboardItem)
                        ) : (
                            <Text style={styles.emptyText}>No weekly data yet</Text>
                        )}
                    </View>
                )}

                {activeTab === 'main' && (
                    <View style={styles.leaderboardContainer}>
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
        fontFamily: 'HamakiGeo',
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
    currentUserText: {
        color: Colors.dark.tint,
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
        fontFamily: 'HamakiGeo',
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
        fontFamily: 'HamakiGeo',
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
        fontFamily: 'HamakiGeo',
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

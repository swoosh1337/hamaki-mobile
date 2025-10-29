import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HammockJumpGame } from '@/components/games/HammockJumpGame';
import { NoPogodGame } from '@/components/games/NoPogodGame';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { checkGameCooldown, formatCooldownTime, GameCooldownStatus } from '@/utils/gameCooldowns';

interface GameItem {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isAvailable: boolean;
}

const GAMES: GameItem[] = [
  {
    id: 'no-pogodi',
    title: 'No Pogodi!',
    description: 'Help Miro catch good items and avoid the bad ones!',
    icon: 'game-controller',
    color: '#FF6B6B',
    isAvailable: true,
  },
  {
    id: 'hammock-jump',
    title: 'Hammock Jump',
    description: 'Jump to avoid the hammock and score points!',
    icon: 'person',
    color: '#4ECDC4',
    isAvailable: true,
  },
];

export default function GamesScreen() {
  const { userProfile, isDemoMode } = useAuth();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, GameCooldownStatus>>({});

  // Check cooldowns on mount and when returning to screen
  useEffect(() => {
    if (userProfile?.id) {
      checkAllCooldowns();
    }
  }, [userProfile?.id, isDemoMode]);

  const checkAllCooldowns = async () => {
    if (!userProfile?.id) return;

    try {
      const nopogodStatus = await checkGameCooldown(userProfile.id, 'nopogod', isDemoMode);
      // Add more games here as they become available
      
      setCooldowns({
        'no-pogodi': nopogodStatus,
      });
    } catch (error) {
      console.error('Error checking cooldowns:', error);
    }
  };

  const handleGamePress = async (gameId: string) => {
    if (!userProfile?.id) {
      Alert.alert('Error', 'Please sign in to play games');
      return;
    }

    if (gameId === 'no-pogodi') {
      // Enforce cooldown for No Pogodi only
      const cooldownStatus = cooldowns[gameId];
      if (cooldownStatus && !cooldownStatus.canPlay) {
        Alert.alert(
          '⏰ Cooldown Active',
          `You can play again in ${formatCooldownTime(cooldownStatus.remainingMs)}.\n\nYou'll get a notification when it's ready!`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Open selected game (hammock-jump has no cooldown gating yet)
    setSelectedGame(gameId);
  };

  const closeGame = () => {
    setSelectedGame(null);
    // Refresh cooldowns after closing game
    checkAllCooldowns();
  };

  const renderGameCard = (game: GameItem) => {
    const cooldownStatus = cooldowns[game.id];
    const isOnCooldown = cooldownStatus && !cooldownStatus.canPlay;

    return (
      <TouchableOpacity
        key={game.id}
        style={[
          styles.gameCard,
          { borderColor: game.color },
          (!game.isAvailable || isOnCooldown) && styles.gameCardDisabled
        ]}
        onPress={() => handleGamePress(game.id)}
        disabled={!game.isAvailable || isOnCooldown}
      >
        <View style={[styles.gameIconContainer, { backgroundColor: game.color + '20' }]}>
          <Ionicons
            name={game.icon}
            size={32}
            color={game.isAvailable && !isOnCooldown ? game.color : Colors.dark.tabIconDefault}
          />
        </View>
        <View style={styles.gameInfo}>
          <Text style={[styles.gameTitle, (!game.isAvailable || isOnCooldown) && styles.gameDisabledText]}>
            {game.title}
          </Text>
          <Text style={[styles.gameDescription, (!game.isAvailable || isOnCooldown) && styles.gameDisabledText]}>
            {game.description}
          </Text>
          {!game.isAvailable && (
            <Text style={styles.comingSoonBadge}>Coming Soon</Text>
          )}
          {game.isAvailable && isOnCooldown && (
            <View style={styles.cooldownBadge}>
              <Ionicons name="time-outline" size={14} color="#FFA500" />
              <Text style={styles.cooldownText}>
                {formatCooldownTime(cooldownStatus.remainingMs)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top centered title with icon (original font) */}
      <View style={styles.topTitleContainer}>
        <Image
          source={require('@/assets/images/mini_games.png')}
          style={styles.topTitleIcon}
          resizeMode="contain"
        />
        <Text style={styles.topTitleText}>Mini Games</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <View style={styles.header}
        >
          <Text style={styles.subtitle}>Play games to earn XP and climb the leaderboard!</Text>
        </View>

        {/* Games Grid */}
        <View style={styles.gamesGrid}>
          {GAMES.map(renderGameCard)}
        </View>

        {/* XP Info */}
        <View style={styles.xpInfoContainer}>
          <Ionicons name="star" size={24} color={Colors.dark.tint} />
          <Text style={styles.xpInfoText}>
            Each game completion earns you XP points for the leaderboard!
          </Text>
        </View>
      </ScrollView>

      {/* Hammock Jump Game Modal */}
      <HammockJumpGame
        visible={selectedGame === 'hammock-jump'}
        onClose={closeGame}
      />

      {/* No Pogodi Game Modal */}
      <NoPogodGame
        visible={selectedGame === 'no-pogodi'}
        onClose={closeGame}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  topTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
  },
  topTitleIcon: {
    width: 32,
    height: 32,
    tintColor: Colors.dark.tint,
  },
  topTitleText: {
    fontSize: 32,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    paddingHorizontal: 12, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 22,
    textAlign: 'left',
    paddingHorizontal: 0,
  },
  gamesGrid: {
    gap: 16,
  },
  gameCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  gameCardDisabled: {
    opacity: 0.5,
    borderColor: 'rgba(245, 245, 245, 0.2)',
  },
  gameIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  gameInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  gameTitle: {
    fontSize: 18,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.text,
    marginBottom: 4,
    fontWeight: 'bold',
    paddingHorizontal: 6, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  gameDescription: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 18,
  },
  gameDisabledText: {
    opacity: 0.5,
  },
  comingSoonBadge: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    backgroundColor: 'rgba(196, 255, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
    fontWeight: 'bold',
  },
  cooldownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  cooldownText: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
    fontWeight: '600',
  },
  xpInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginTop: 30,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  xpInfoText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});

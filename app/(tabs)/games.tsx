import GamesIcon from '@/components/GamesIcon';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HammockJumpGame } from '@/components/games/HammockJumpGame';
import { NoPogodGame } from '@/components/games/NoPogodGame';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useGameCooldown } from '@/hooks/useGameCooldown';
import { createLogger } from '@/utils/logger';

const log = createLogger('Games');

interface GameItem {
  id: string;
  title: string;
  titleFont: 'HamakiGeo' | 'HamakiEng';
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isAvailable: boolean;
}

const GAMES: GameItem[] = [
  {
    id: 'no-pogodi',
    title: 'მისაღებზე',
    titleFont: 'HamakiGeo',
    description: 'დააჭერინე მიროს საჭმელი და აარიდე ცუდი რაღაცეები!',
    icon: 'game-controller',
    color: '#FF6B6B',
    isAvailable: true,
  },
  {
    id: 'hammock-jump',
    title: 'Hammock Jump',
    titleFont: 'HamakiEng',
    description: 'იხტუნავე სანამ შეგიძლია!',
    icon: 'person',
    color: '#4ECDC4',
    isAvailable: true,
  },
];

export default function GamesScreen() {
  const { userProfile, isDemoMode } = useAuth();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  // Use cooldown hooks for each game
  const noPogodCooldown = useGameCooldown({
    gameId: 'no-pogodi',
    cooldownMs: isDemoMode ? 0 : 15 * 60 * 1000, // 15 minutes, or no cooldown in demo
    persist: true,
  });

  const hammockJumpCooldown = useGameCooldown({
    gameId: 'hammock-jump',
    cooldownMs: isDemoMode ? 0 : 15 * 60 * 1000, // 15 minutes, or no cooldown in demo
    persist: true,
  });

  const handleGamePress = async (gameId: string) => {
    if (!userProfile?.id) {
      Alert.alert('Error', 'Please sign in to play games');
      return;
    }

    // Check cooldown based on game
    const cooldown = gameId === 'no-pogodi' ? noPogodCooldown : hammockJumpCooldown;

    if (cooldown.isOnCooldown) {
      Alert.alert(
        '⏰ Cooldown-ი',
        `You can play again in ${cooldown.remainingFormatted}.\n\nYou'll get a notification when it's ready!`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Open selected game
    setSelectedGame(gameId);
  };

  const closeGame = () => {
    setSelectedGame(null);
    // Cooldowns are automatically managed by hooks
  };

  const renderGameCard = (game: GameItem) => {
    const cooldown = game.id === 'no-pogodi' ? noPogodCooldown : hammockJumpCooldown;
    const isOnCooldown = cooldown.isOnCooldown;

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
          {game.id === 'no-pogodi' ? (
            <Ionicons
              name={game.icon}
              size={32}
              color={game.isAvailable && !isOnCooldown ? game.color : Colors.dark.tabIconDefault}
            />
          ) : (
            <GamesIcon size={32} />
          )}
        </View>
        <View style={styles.gameInfo}>
          <Text style={[styles.gameTitle, { fontFamily: game.titleFont }, (!game.isAvailable || isOnCooldown) && styles.gameDisabledText]}>
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
                {cooldown.remainingFormatted}
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
        <GamesIcon size={32} style={styles.topTitleIcon} />
        <Text style={styles.topTitleText}>MINI GAMES</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <View style={styles.header}
        >
          <Text style={styles.subtitle}>ითამაშე თამაშები რომ დააგროვო ქულები</Text>
        </View>

        {/* Games Grid */}
        <View style={styles.gamesGrid}>
          {GAMES.map(renderGameCard)}
        </View>

        {/* XP Info */}
        <View style={styles.xpInfoContainer}>
          <Ionicons name="star" size={24} color={Colors.dark.tint} />
          <Text style={styles.xpInfoText}>
            თითოეული თამაში გაძლევს საშუალებას გამოიმუაშვო XP და დაწინაურდე ლიდერბორდში
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
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 22,
    textAlign: 'center',
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
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    marginBottom: 4,
    fontWeight: 'bold',
    paddingHorizontal: 6, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  gameDescription: {
    fontSize: 14,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 18,
  },
  gameDisabledText: {
    opacity: 0.5,
  },
  comingSoonBadge: {
    fontSize: 12,
    fontFamily: 'HamakiEng',
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
    fontFamily: 'HamakiEng',
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
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HammockJumpGame } from '@/components/games/HammockJumpGame';
import { NoPogodGame } from '@/components/games/NoPogodGame';
import { Colors } from '@/constants/Colors';

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
    isAvailable: false,
  },
];

export default function GamesScreen() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  const handleGamePress = (gameId: string) => {
    // Only No Pogodi is playable
    if (gameId === 'no-pogodi') {
      setSelectedGame(gameId);
    }
  };

  const closeGame = () => {
    setSelectedGame(null);
  };

  const renderGameCard = (game: GameItem) => {
    return (
      <TouchableOpacity
        key={game.id}
        style={[
          styles.gameCard,
          { borderColor: game.color },
          !game.isAvailable && styles.gameCardDisabled
        ]}
        onPress={() => handleGamePress(game.id)}
        disabled={!game.isAvailable}
      >
        <View style={[styles.gameIconContainer, { backgroundColor: game.color + '20' }]}>
          <Ionicons
            name={game.icon}
            size={32}
            color={game.isAvailable ? game.color : Colors.dark.tabIconDefault}
          />
        </View>
        <View style={styles.gameInfo}>
          <Text style={[styles.gameTitle, !game.isAvailable && styles.gameDisabledText]}>
            {game.title}
          </Text>
          <Text style={[styles.gameDescription, !game.isAvailable && styles.gameDisabledText]}>
            {game.description}
          </Text>
          {!game.isAvailable && (
            <Text style={styles.comingSoonBadge}>Coming Soon</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Image
              source={require('@/assets/images/mini_games.png')}
              style={styles.titleIcon}
              resizeMode="contain"
            />
            <Text style={styles.title}>Mini Games</Text>
          </View>
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
    </SafeAreaView>
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
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleIcon: {
    width: 32,
    height: 32,
    tintColor: Colors.dark.tint,
    marginRight: 12,
  },
  title: {
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
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

import { GamesIcon } from '@/components/GamesIcon';
import { HammockJumpGame } from '@/components/games/HammockJumpGame';
import { NoPogodGame } from '@/components/games/NoPogodGame';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useGameCooldown } from '@/hooks/useGameCooldown';
import { trackGamePlay } from '@/utils/analytics';
import { GAME_COOLDOWN_MS, getAllGameCooldowns } from '@/utils/gameCooldowns';

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
  const [serverCooldownsSynced, setServerCooldownsSynced] = useState(false);

  // Use cooldown hooks for each game
  // IDs must match server-side GameType: 'nopogod' and 'hammockjump'
  const noPogodCooldown = useGameCooldown({
    gameId: 'nopogod',
    cooldownMs: isDemoMode ? 0 : GAME_COOLDOWN_MS, // 1 hour, or no cooldown in demo
    persist: true,
  });

  const hammockJumpCooldown = useGameCooldown({
    gameId: 'hammockjump',
    cooldownMs: isDemoMode ? 0 : GAME_COOLDOWN_MS, // 1 hour, or no cooldown in demo
    persist: true,
  });

  // Sync cooldown state from server on mount
  // This ensures the UI reflects the actual server-side cooldown state
  useEffect(() => {
    if (!userProfile?.id || serverCooldownsSynced || isDemoMode) return;

    const syncCooldowns = async () => {
      try {
        const serverCooldowns = await getAllGameCooldowns(userProfile.id, isDemoMode);

        // Sync nopogod cooldown
        const nopogodStatus = serverCooldowns.nopogod;
        if (nopogodStatus && !nopogodStatus.canPlay && nopogodStatus.cooldownEndsAt) {
          await noPogodCooldown.syncFromServer(nopogodStatus.cooldownEndsAt.getTime());
        }

        // Sync hammockjump cooldown
        const hammockStatus = serverCooldowns.hammockjump;
        if (hammockStatus && !hammockStatus.canPlay && hammockStatus.cooldownEndsAt) {
          await hammockJumpCooldown.syncFromServer(hammockStatus.cooldownEndsAt.getTime());
        }

        setServerCooldownsSynced(true);
      } catch (error) {
        console.error('Failed to sync game cooldowns from server:', error);
      }
    };

    syncCooldowns();
  }, [userProfile?.id, serverCooldownsSynced, isDemoMode]);

  const handleGamePress = async (gameId: string) => {
    if (!userProfile?.id) {
      Alert.alert('Error', 'Please sign in to play games');
      return;
    }

    // Check cooldown based on game
    // Map display IDs to server IDs: 'no-pogodi' -> 'nopogod', 'hammock-jump' -> 'hammockjump'
    const cooldown = gameId === 'no-pogodi' ? noPogodCooldown : hammockJumpCooldown;

    if (cooldown.isOnCooldown) {
      Alert.alert(
        '⏰ Cooldown-ი',
        `You can play again in ${cooldown.remainingFormatted}.\n\nYou'll get a notification when it's ready!`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Track game play for analytics dashboard
    const game = GAMES.find(g => g.id === gameId);
    trackGamePlay(gameId, game?.title || gameId);

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

    // Pulse animation for lock icon
    const pulse = useSharedValue(1);
    
    useEffect(() => {
      if (isOnCooldown) {
        pulse.value = withRepeat(
          withSequence(
            withTiming(1.2, { duration: 1000 }),
            withTiming(1, { duration: 1000 })
          ),
          -1,
          true
        );
      } else {
        pulse.value = 1;
      }
    }, [isOnCooldown]);

    const animatedLockStyle = useAnimatedStyle(() => ({
      transform: [{ scale: pulse.value }],
      opacity: pulse.value === 1 ? 1 : 0.8,
    }));

    return (
      <TouchableOpacity
        key={game.id}
        style={[
          styles.gameCard,
          { borderColor: game.color + '40' },
          (!game.isAvailable || isOnCooldown) && styles.gameCardDisabled
        ]}
        onPress={() => handleGamePress(game.id)}
        disabled={!game.isAvailable || isOnCooldown}
      >
        {/* Cooldown overlay with lock icon and countdown */}
        {game.isAvailable && isOnCooldown && (
          <BlurView intensity={80} tint="dark" style={styles.cooldownOverlay}>
            <View style={styles.cooldownInner}>
              <Animated.View style={[styles.lockIconContainer, animatedLockStyle]}>
                <Ionicons name="lock-closed" size={20} color={Colors.dark.tint} />
              </Animated.View>
              <View style={styles.timerContainer}>
                <Text style={styles.cooldownTimerText}>
                  {cooldown.remainingFormatted}
                </Text>
                <View style={styles.cooldownBadge}>
                  <Text style={styles.cooldownLabelText}>COOLDOWN</Text>
                </View>
              </View>
            </View>
          </BlurView>
        )}
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
    fontFamily: 'SpaceMono',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 255, 0, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  gameCardDisabled: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cooldownOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    overflow: 'hidden',
  },
  cooldownInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  lockIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerContainer: {
    alignItems: 'flex-start',
  },
  cooldownTimerText: {
    fontSize: 32,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cooldownBadge: {
    backgroundColor: 'rgba(196, 255, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  cooldownLabelText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    letterSpacing: 1,
    fontWeight: 'bold',
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

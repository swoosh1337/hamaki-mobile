import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { GameAssets, HammockGameEngine } from '@/utils/gameEngine';
import { userService } from '@/utils/supabase';
import { GameCanvas } from './GameCanvas';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Import game assets
const GAME_ASSETS: GameAssets = {
  background: require('@/assets/background.png'),
  player: require('@/assets/images/person-3-idle.png'),
};

interface HammockJumpGameProps {
  visible: boolean;
  onClose: () => void;
}

export const HammockJumpGame: React.FC<HammockJumpGameProps> = ({
  visible,
  onClose,
}) => {
  const { userProfile, updateUserProfile, isDemoMode } = useAuth();
  const gameEngineRef = useRef<HammockGameEngine | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [xpAwarded, setXpAwarded] = useState(false);
  const accelerometerSubscription = useRef<any>(null);
  const [hasAccelerometer, setHasAccelerometer] = useState(true);
  const lastTapTime = useRef<number>(0);
  const doubleTapDelay = 400; // ms - increased for better detection
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // Load high score on mount
  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const stored = await AsyncStorage.getItem('hammock_high_score');
        if (stored) {
          setHighScore(parseInt(stored, 10));
        }
      } catch (error) {
        console.error('Error loading high score:', error);
      }
    };
    loadHighScore();
  }, []);

  // Initialize game engine and accelerometer
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (visible && !gameEngineRef.current) {
        gameEngineRef.current = new HammockGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT);
        if (cancelled) return; // respect unmount
        setGameState(gameEngineRef.current.getState());

        // Setup accelerometer with fallback
        const setupAccelerometer = async () => {
          try {
            const isAvailable = await Accelerometer.isAvailableAsync();
            if (cancelled) return;
            if (!isAvailable) {
              console.log('Accelerometer not available on this device');
              setHasAccelerometer(false);
              return;
            }

            Accelerometer.setUpdateInterval(16);
            // Add listener only if still mounted
            if (!cancelled) {
              accelerometerSubscription.current = Accelerometer.addListener(({ x }: { x: number }) => {
                if (gameEngineRef.current) {
                  const tiltValue = x * 2;
                  const clampedValue = Math.max(-1, Math.min(1, tiltValue));
                  gameEngineRef.current.setMoveAnalog(clampedValue);
                }
              });
              console.log('✅ Accelerometer setup successful');
            }
          } catch (error) {
            if (!cancelled) {
              console.log('Accelerometer setup failed, using touch controls as fallback:', error);
              setHasAccelerometer(false);
            }
          }
        };

        await setupAccelerometer();
      }
    };

    init();

    return () => {
      cancelled = true;
      // Clean up accelerometer on unmount or visibility change
      if (accelerometerSubscription.current) {
        accelerometerSubscription.current.remove();
        accelerometerSubscription.current = null;
      }
    };
  }, [visible]);

  // Handle game state updates
  const updateGameState = useCallback(() => {
    if (gameEngineRef.current) {
      setGameState(gameEngineRef.current.getState());
    }
  }, []);

  // Game control functions
  const startGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.startGame();
      setXpAwarded(false); // Reset XP flag on new game
      setIsNewHighScore(false); // Reset high score flag
      updateGameState();
    }
  }, [updateGameState]);

  const exitGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.exitGame();
      updateGameState();
    }
    onClose();
  }, [onClose, updateGameState]);

  const pauseGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.pauseGame();
      updateGameState();
    }
  }, [updateGameState]);



  // Game update loop
  const handleGameUpdate = useCallback((currentTime: number) => {
    if (gameEngineRef.current) {
      gameEngineRef.current.update(currentTime);
      updateGameState();
    }
  }, [updateGameState]);

  const handleDoubleTap = useCallback(() => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTapTime.current;

    if (timeSinceLastTap < doubleTapDelay) {
      // Double tap detected!
      if (gameEngineRef.current) {
        gameEngineRef.current.performDoubleJump();
      }
    }

    lastTapTime.current = currentTime;
  }, []);

  // Award XP when game ends – follow strict flow and error visibility
  useEffect(() => {
    const awardXP = async () => {
      if (
        gameState?.phase !== 'GAME_OVER' ||
        xpAwarded ||
        !userProfile ||
        !gameState?.score ||
        isDemoMode
      ) {
        return;
      }

      const xpToAward = Math.max(1, Math.floor(gameState.score / 50));
      const newXP = userProfile.xp_points + xpToAward;

      // Check for high score
      if (gameState.score > highScore) {
        setIsNewHighScore(true);
        setHighScore(gameState.score);
        try {
          await AsyncStorage.setItem('hammock_high_score', gameState.score.toString());
          console.log('🏆 NEW HIGH SCORE!', gameState.score);
        } catch (error) {
          console.error('Error saving high score:', error);
        }
      }

      try {
        const success = await userService.updateUserXP(userProfile.google_id, newXP);
        if (!success) {
          console.warn('[HammockJump] updateUserXP returned false; not updating local state or leaderboard');
          return;
        }

        // DB update succeeded → update local state
        updateUserProfile({ xp_points: newXP });

        // Record cooldown
        const { recordGamePlay } = await import('@/utils/gameCooldowns');
        await recordGamePlay(userProfile.id, 'hammock-jump', isDemoMode);

        // Invalidate XP cache (await, but non-fatal)
        try {
          const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
          await invalidateXPStatsCache(userProfile.id);
        } catch (err) {
          console.error('[HammockJump] Failed to invalidate XP cache:', err);
        }

        // Trigger leaderboard update in background only after DB success
        userService
          .updateLeaderboardPoints(userProfile.id, xpToAward)
          .then((ok) => {
            if (!ok) console.warn('[HammockJump] Leaderboard update returned false');
          })
          .catch((err) => console.error('[HammockJump] Leaderboard update error:', err));

        // Only now mark as awarded
        setXpAwarded(true);
      } catch (err) {
        console.error('[HammockJump] Error awarding XP:', err);
      }
    };

    awardXP();
  }, [gameState?.phase, gameState?.score, xpAwarded, userProfile, updateUserProfile, isDemoMode]);

  // Cleanup on close
  useEffect(() => {
    if (!visible) {
      // Clean up accelerometer
      if (accelerometerSubscription.current) {
        accelerometerSubscription.current.remove();
        accelerometerSubscription.current = null;
      }
      gameEngineRef.current = null;
      setGameState(null);
    }
  }, [visible]);

  if (!visible || !gameState) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={exitGame}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.gameContainer}>
          <GameCanvas
            gameState={gameState}
            assets={GAME_ASSETS}
            onStartGame={startGame}
            onExitGame={exitGame}
            onPauseGame={pauseGame}
            onUpdate={handleGameUpdate}
            onDoubleTap={handleDoubleTap}
            hasAccelerometer={hasAccelerometer}
            gameEngine={gameEngineRef.current}
            highScore={highScore}
            isNewHighScore={isNewHighScore}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  gameContainer: {
    flex: 1,
    position: 'relative',
  },
});

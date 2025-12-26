import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer } from 'expo-sensors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { GameAssets, HammockGameEngine } from '@/features/games/hammockJump/engine/HammockJumpEngine';
import type { AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
import { createLogger } from '@/utils/logger';
import { GameCanvas } from './GameCanvas';

const log = createLogger('HammockJumpGame');

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
        log.error('Error loading high score', error);
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
              log.debug('Accelerometer not available on this device');
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
              log.debug('Accelerometer setup successful');
            }
          } catch (error) {
            if (!cancelled) {
              log.debug('Accelerometer setup failed, using touch controls as fallback', { error });
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

      // Check for high score
      if (gameState.score > highScore) {
        setIsNewHighScore(true);
        setHighScore(gameState.score);
        try {
          await AsyncStorage.setItem('hammock_high_score', gameState.score.toString());
          log.info('NEW HIGH SCORE!', { score: gameState.score });
        } catch (error) {
          log.error('Error saving high score', error);
        }
      }

      try {
        // Award XP via Edge Function (handles both user XP and leaderboard atomically)
        const result = await invokeEdgeFunction<AwardXPResult>({
          functionName: 'award-xp',
          body: {
            userId: userProfile.id,
            xpType: 'game',
            amount: xpToAward,
          },
          silentFail: true, // Don't crash if Edge Function fails
        });

        if (result.success && result.data) {
          // Update local user profile with new XP from server
          updateUserProfile({ xp_points: result.data.new_total_xp });
          log.info(`Awarded ${xpToAward} XP for Hammock Jump game`, {
            newTotal: result.data.new_total_xp,
            personalRank: result.data.personal_rank,
          });

          // Record cooldown
          const { recordGamePlay } = await import('@/utils/gameCooldowns');
          await recordGamePlay(userProfile.id, 'hammock-jump', isDemoMode);

          // Invalidate XP cache (await, but non-fatal)
          try {
            const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
            await invalidateXPStatsCache(userProfile.id);
          } catch (err) {
            log.error('Failed to invalidate XP cache', err);
          }

          // Mark as awarded
          setXpAwarded(true);
        } else {
          // Edge Function failed - update locally as fallback
          const newXP = userProfile.xp_points + xpToAward;
          updateUserProfile({ xp_points: newXP });
          log.warn(`Edge Function failed, updated locally: ${xpToAward} XP`, {
            error: result.error,
          });
          setXpAwarded(true);
        }
      } catch (err) {
        // Network error or other issue - still update locally to prevent data loss
        const newXP = userProfile.xp_points + xpToAward;
        log.error('Error awarding XP, updating locally only:', err);
        updateUserProfile({ xp_points: newXP });
        setXpAwarded(true);
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

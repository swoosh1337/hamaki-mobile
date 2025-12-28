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
import { HAMMOCK_JUMP_ASSETS } from '@/features/games/hammockJump/utils/assets';
import type { AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
import { useMyLeaderboardStatus } from '@/hooks/useMyLeaderboardStatus';
import { edgeFunctionQueueService } from '@/services/queue';
import {
  generateSessionId,
  generateXPIdempotencyKey,
  isRetryableError,
} from '@/types/edgeFunctionQueue';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
import { trackGameEnd, trackGameStart, trackXPEarned } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';
import { GameCanvas } from './GameCanvas';

const log = createLogger('HammockJumpGame');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Game ID for tracking and idempotency
const HAMMOCK_GAME_ID = 'hammock-jump';

// Use optimized WebP assets from hammockJump assets module
const GAME_ASSETS: GameAssets = {
  background: HAMMOCK_JUMP_ASSETS.background,
  player: HAMMOCK_JUMP_ASSETS.player,
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

  // Personal leaderboard status for instant rank updates
  const { updateFromAwardXP } = useMyLeaderboardStatus({
    userId: userProfile?.id,
    autoFetch: false, // Don't fetch on mount, just use for updates
  });
  const gameEngineRef = useRef<HammockGameEngine | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [xpAwarded, setXpAwarded] = useState(false);
  const sessionIdRef = useRef<string>(generateSessionId()); // Unique session for idempotency
  const accelerometerSubscription = useRef<any>(null);
  const [hasAccelerometer, setHasAccelerometer] = useState(true);
  const lastTapTime = useRef<number>(0);
  const doubleTapDelay = 400; // ms - increased for better detection
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const gameStartTime = useRef<number>(0); // Track game session duration

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
      gameStartTime.current = Date.now(); // Track when game started
      trackGameStart('hammock_jump', { high_score: highScore });
      updateGameState();
    }
  }, [updateGameState, highScore]);

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
      const gameDuration = Date.now() - gameStartTime.current;

      // Track game end analytics
      trackGameEnd('hammock_jump', gameState.score, {
        duration_ms: gameDuration,
        duration_seconds: Math.round(gameDuration / 1000),
        xp_earned: xpToAward,
        is_new_high_score: gameState.score > highScore,
        previous_high_score: highScore,
      });

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

      if (xpToAward > 0) {
        // Generate idempotency key for exactly-once XP awarding
        const sessionId = sessionIdRef.current || generateSessionId();
        const idempotencyKey = generateXPIdempotencyKey(
          userProfile.id,
          HAMMOCK_GAME_ID,
          sessionId,
          xpToAward
        );

        try {
          // Award XP via Edge Function with idempotency key
          const result = await invokeEdgeFunction<AwardXPResult>({
            functionName: 'award-xp',
            body: {
              userId: userProfile.id,
              xpType: 'game',
              amount: xpToAward,
              gameId: HAMMOCK_GAME_ID,
              sessionId,
              idempotencyKey,
            },
            silentFail: true,
          });

          if (result.success && result.data) {
            // Update local user profile with server XP (handles duplicates correctly)
            updateUserProfile({ xp_points: result.data.new_total_xp });
            log.info(`Awarded ${xpToAward} XP for Hammock Jump game`, {
              newTotal: result.data.new_total_xp,
              personalRank: result.data.personal_rank,
              duplicate: result.data.duplicate,
            });

            // Track XP earned
            if (!result.data.duplicate) {
              trackXPEarned(xpToAward, 'game', {
                game_name: 'hammock_jump',
                score: gameState.score,
              });
            }

            // Instantly update personal leaderboard rank (no 5-minute wait!)
            updateFromAwardXP(result.data);
            log.debug('Personal leaderboard rank updated instantly');

            // Record cooldown
            const { recordGamePlay } = await import('@/utils/gameCooldowns');
            await recordGamePlay(userProfile.id, HAMMOCK_GAME_ID, isDemoMode);

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
            // Edge Function failed - check if retryable
            const newXP = userProfile.xp_points + xpToAward;

            if (isRetryableError(result.status)) {
              // Add to queue for retry (optimistic XP derived from queue)
              await edgeFunctionQueueService.addToQueue({
                id: `xp-${sessionId}-${xpToAward}`,
                idempotencyKey,
                category: 'xp',
                functionName: 'award-xp',
                body: {
                  userId: userProfile.id,
                  xpType: 'game',
                  amount: xpToAward,
                  gameId: HAMMOCK_GAME_ID,
                  sessionId,
                  idempotencyKey,
                },
                amount: xpToAward,
                createdAt: Date.now(),
              });
              log.info('XP award queued for retry', {
                idempotencyKey,
                amount: xpToAward,
                status: result.status,
              });
            } else {
              // Permanent error (400, 401, 403, 404, 422) - log and discard
              log.error('Permanent XP award failure, not queuing', {
                status: result.status,
                error: result.error,
              });
            }

            // Update local profile and leaderboard state
            updateUserProfile({ xp_points: newXP });
            updateFromAwardXP({
              success: true,
              new_total_xp: newXP,
              personal_rank: 0, // Unknown rank when offline
              xp_breakdown: {
                game: newXP,
                subscription: 0,
                video_like: 0,
              },
            });

            setXpAwarded(true);
          }
        } catch (error) {
          // Unexpected error - add to queue for safety
          const newXP = userProfile.xp_points + xpToAward;
          log.error('Unexpected error awarding XP, queuing for retry:', error);
          await edgeFunctionQueueService.addToQueue({
            id: `xp-${sessionId}-${xpToAward}`,
            idempotencyKey,
            category: 'xp',
            functionName: 'award-xp',
            body: {
              userId: userProfile.id,
              xpType: 'game',
              amount: xpToAward,
              gameId: HAMMOCK_GAME_ID,
              sessionId,
              idempotencyKey,
            },
            amount: xpToAward,
            createdAt: Date.now(),
          });

          // Update local profile and leaderboard state
          updateUserProfile({ xp_points: newXP });
          updateFromAwardXP({
            success: true,
            new_total_xp: newXP,
            personal_rank: 0, // Unknown rank when offline
            xp_breakdown: {
              game: newXP,
              subscription: 0,
              video_like: 0,
            },
          });

          setXpAwarded(true);
        }
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

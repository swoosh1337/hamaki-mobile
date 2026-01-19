import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer, type Subscription } from 'expo-sensors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { DISABLE_GAME_COOLDOWN } from '@/config/featureFlags';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { HammockJumpAudioManager } from '@/features/games/hammockJump/audio';
import { GameAssets, GameState, HammockGameEngine } from '@/features/games/hammockJump/engine/HammockJumpEngine';
import { HAMMOCK_JUMP_ASSETS } from '@/features/games/hammockJump/utils/assets';
import { useGameCooldown } from '@/hooks/useGameCooldown';
import type { AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
import { useMyLeaderboardStatus } from '@/hooks/useMyLeaderboardStatus';
import { edgeFunctionQueueService } from '@/services/queue';
import {
  generateSessionId,
  generateXPIdempotencyKey,
  isRetryableError,
} from '@/types/edgeFunctionQueue';
import { trackGameEnd, trackGameStart, trackXPEarned } from '@/utils/analytics';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
import { GAME_COOLDOWN_MS } from '@/utils/gameCooldowns';
import { createLogger } from '@/utils/logger';
import { emitXPAwarded } from '@/utils/xpEvents';
import { Ionicons } from '@expo/vector-icons';
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
  const audioManagerRef = useRef<HammockJumpAudioManager | null>(null);
  const audioUnloadingRef = useRef(false);
  const audioAvailableRef = useRef(true);
  const cooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [xpAwarded, setXpAwarded] = useState(false);
  const sessionIdRef = useRef<string>(generateSessionId()); // Unique session for idempotency
  const accelerometerSubscription = useRef<Subscription | null>(null);
  const [hasAccelerometer, setHasAccelerometer] = useState(true);
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState<boolean | null>(null);
  const gameStartTime = useRef<number>(0); // Track game session duration
  const [showCooldownScreen, setShowCooldownScreen] = useState(false);

  // Game cooldown hook - persists cooldown AND rounds across app restarts
  const {
    remainingFormatted: cooldownRemainingFormatted,
    isOnCooldown,
    startCooldown,
    roundsPlayed,
    maxRounds: MAX_ROUNDS,
    incrementRounds,
  } = useGameCooldown({
    gameId: 'hammockjump',
    cooldownMs: GAME_COOLDOWN_MS,
    maxRounds: 3,
    persist: true,
  });

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

  // Show cooldown screen if on cooldown OR if max rounds reached when modal opens
  // Skip if DISABLE_GAME_COOLDOWN flag is enabled
  // Note: We check roundsPlayed >= MAX_ROUNDS to prevent race conditions where
  // rounds are maxed but cooldown timer hasn't started yet
  useEffect(() => {
    if (visible && !isDemoMode && !DISABLE_GAME_COOLDOWN) {
      if (isOnCooldown || roundsPlayed >= MAX_ROUNDS) {
        setShowCooldownScreen(true);

        // Edge case: rounds are maxed but cooldown never started (crash/bug recovery)
        // Start cooldown now to ensure proper state
        if (roundsPlayed >= MAX_ROUNDS && !isOnCooldown) {
          log.info(`Detected maxed rounds (${roundsPlayed}/${MAX_ROUNDS}) without active cooldown, starting cooldown now`);
          startCooldown();
        }
      }
    } else if (!visible) {
      setShowCooldownScreen(false);
    }
  }, [visible, isOnCooldown, roundsPlayed, MAX_ROUNDS, isDemoMode, startCooldown]);

  // Initialize game engine and accelerometer
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (visible && !gameEngineRef.current) {
        gameEngineRef.current = new HammockGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT);
        if (cancelled) return; // respect unmount
        setGameState(gameEngineRef.current.getState());

        // Initialize audio manager and load sounds
        if (audioUnloadingRef.current) {
          log.debug('Skipping audio init while unload is in progress');
          return;
        }
        audioManagerRef.current = new HammockJumpAudioManager();
        try {
          await audioManagerRef.current.loadSounds();
          audioAvailableRef.current = true;
          setAudioAvailable(true);
          log.info('Game audio loaded');
        } catch (err) {
          audioAvailableRef.current = false;
          setAudioAvailable(false);
          log.error('Failed to load game audio', err);
        }

        // Set up callback for normal platform landing sound
        gameEngineRef.current.onPlatformLand = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playJumpSound();
          }
        };

        // Set up callback for falling sound (when player falls off screen)
        gameEngineRef.current.onPlayerFalling = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playFallingSound();
          }
        };

        // Set up callback for item collection sound
        gameEngineRef.current.onItemCollected = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playItemCollectSound();
          }
        };

        // Set up callback for big boost platforms (spring, bouncy)
        gameEngineRef.current.onBigBoostLand = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playBigBoostSound();
          }
        };

        // Set up callback for special platforms (moving, ice, conveyor, disappearing, crumbling)
        gameEngineRef.current.onSpecialPlatformLand = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playSpecialPlatformSound();
          }
        };

        // Set up callback for breakable platforms
        gameEngineRef.current.onBreakableLand = () => {
          if (audioManagerRef.current && audioAvailableRef.current) {
            audioManagerRef.current.playBreakablePlatformSound();
          }
        };

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

  // K animation start - freeze player in place
  const handleKAnimationStart = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.freezePlayer();
    }
  }, []);

  // K animation complete - trigger game over with +200 bonus
  const handleKAnimationComplete = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.triggerGameOverWithBonus(200);
      updateGameState();
    }
  }, [updateGameState]);

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

      // Mark as awarded IMMEDIATELY to prevent double calls (matches No Pogodi pattern)
      setXpAwarded(true);

      // Increment rounds played (persisted to storage via hook)
      const newRoundsPlayed = await incrementRounds();
      log.debug(`Round ${newRoundsPlayed}/${MAX_ROUNDS} completed`);

      // Check if user has reached max rounds - start cooldown
      const shouldStartCooldown = newRoundsPlayed >= MAX_ROUNDS;

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

              // Emit XP event to trigger global leaderboard refresh
              emitXPAwarded(xpToAward);
            }

            // Instantly update personal leaderboard rank (no 5-minute wait!)
            updateFromAwardXP(result.data);
            log.debug('Personal leaderboard rank updated instantly');

            // Invalidate XP cache (await, but non-fatal)
            try {
              const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
              await invalidateXPStatsCache(userProfile.id);
            } catch (err) {
              log.error('Failed to invalidate XP cache', err);
            }
          } else {
            // Edge Function failed - check if retryable
            if (isRetryableError(result.status)) {
              // Add to queue for retry - apply optimistic XP since it will be synced
              const newXP = userProfile.xp_points + xpToAward;
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

              // Update local profile and leaderboard state (optimistic - will sync later)
              updateUserProfile({ xp_points: newXP });
              updateFromAwardXP({
                success: true,
                new_total_xp: newXP,
                personal_rank: 0, // Unknown rank when offline
                xp_breakdown: {
                  game: xpToAward, // Only the game XP delta (not cumulative, but best we can do offline)
                  subscription: 0, // Unknown offline - will be corrected on sync
                  video_like: 0,   // Unknown offline - will be corrected on sync
                },
              });
            } else {
              // Permanent error (400, 401, 403, 404, 422) - DO NOT apply optimistic updates
              // The XP will never be synced, so don't mislead the user
              log.error('Permanent XP award failure, XP not applied', {
                status: result.status,
                error: result.error,
              });
            }
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
              game: xpToAward, // Only the game XP delta (not cumulative, but best we can do offline)
              subscription: 0, // Unknown offline - will be corrected on sync
              video_like: 0,   // Unknown offline - will be corrected on sync
            },
          });
        }
      }

      // Start cooldown if max rounds reached
      if (shouldStartCooldown) {
        log.info(`Max rounds reached (${MAX_ROUNDS}). Starting cooldown...`);

        try {
          await startCooldown();
          log.info('Game cooldown started via hook');

          // Also record cooldown on the server (for cross-device sync)
          try {
            const { recordGamePlay } = await import('@/utils/gameCooldowns');
            await recordGamePlay(userProfile.id, HAMMOCK_GAME_ID, isDemoMode);
            log.info('Game cooldown recorded on server');
          } catch (serverError) {
            log.error('Error recording cooldown on server (non-fatal):', serverError);
          }

          // Show cooldown screen after a short delay
          // Store timeout ID in ref so it can be cleared on unmount
          cooldownTimeoutRef.current = setTimeout(() => {
            setShowCooldownScreen(true);
          }, 2000); // 2 second delay to let user see final score
        } catch (cooldownError) {
          log.error('Error starting game cooldown:', cooldownError);
        }
      }
    };

    awardXP();
  }, [
    gameState?.phase,
    gameState?.score,
    xpAwarded,
    userProfile,
    updateUserProfile,
    updateFromAwardXP,
    isDemoMode,
    highScore,
    incrementRounds,
    startCooldown,
    MAX_ROUNDS,
  ]);

  // Cleanup on close
  useEffect(() => {
    if (!visible) {
      // Clean up cooldown timeout to prevent memory leak
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }

      // Clean up accelerometer
      if (accelerometerSubscription.current) {
        accelerometerSubscription.current.remove();
        accelerometerSubscription.current = null;
      }
      gameEngineRef.current = null;
      setGameState(null);

      // Stop and unload audio
      if (audioManagerRef.current) {
        const unloadAudio = async () => {
          audioUnloadingRef.current = true;
          try {
            await audioManagerRef.current?.unloadSounds();
            log.debug('Game audio unloaded');
          } catch (error) {
            log.error('Failed to unload game audio', error as Error);
          } finally {
            audioManagerRef.current = null;
            audioUnloadingRef.current = false;
          }
        };
        unloadAudio();
      }
      audioAvailableRef.current = false;
      setAudioAvailable(null);
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
        {showCooldownScreen ? (
          // Cooldown Screen
          <View style={styles.cooldownScreenContainer}>
            <View style={styles.cooldownContent}>
              <View style={styles.cooldownIconContainer}>
                <Ionicons name="time" size={60} color={Colors.dark.tint} />
              </View>

              <Text style={styles.cooldownTitle}>COOLDOWN ACTIVE</Text>

              <View style={styles.timerDisplay}>
                <Text style={styles.cooldownTimer}>{cooldownRemainingFormatted}</Text>
              </View>

              <Text style={styles.cooldownMessage}>
                შეგიძლია ითამაშო {MAX_ROUNDS} რაუნდი ერთ სესიაზე.{'\n'}
                დაელოდე <Text style={{ fontFamily: 'SpaceMono', fontWeight: 'bold' }}>COOLDOWN</Text>-ს რომ თავიდან ითამაშო!
              </Text>

              <TouchableOpacity style={styles.cooldownExitButton} onPress={exitGame} activeOpacity={0.8}>
                <Text style={styles.cooldownExitText}>გასვლა</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // Game View
          <View style={styles.gameContainer}>
            <GameCanvas
              gameState={gameState}
              assets={GAME_ASSETS}
              onStartGame={startGame}
              onExitGame={exitGame}
              onPauseGame={pauseGame}
              onUpdate={handleGameUpdate}
              onKAnimationStart={handleKAnimationStart}
              onKAnimationComplete={handleKAnimationComplete}
              hasAccelerometer={hasAccelerometer}
              gameEngine={gameEngineRef.current}
              highScore={highScore}
              isNewHighScore={isNewHighScore}
              xpEarned={gameState?.phase === 'GAME_OVER' ? Math.max(1, Math.floor((gameState?.score || 0) / 50)) : 0}
              roundsPlayed={roundsPlayed}
              maxRounds={MAX_ROUNDS}
            />
            {audioAvailable === false && (
              <Text style={styles.audioWarning}>ხმა დროებით მიუწვდომელია</Text>
            )}
          </View>
        )}
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
  audioWarning: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    color: '#FFD700',
    fontSize: 12,
    opacity: 0.9,
  },
  cooldownScreenContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  cooldownContent: {
    alignItems: 'center',
    width: '100%',
  },
  cooldownIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  cooldownTitle: {
    fontSize: 24,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 16,
    opacity: 0.9,
  },
  timerDisplay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
    marginBottom: 30,
  },
  cooldownTimer: {
    fontSize: 56,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  cooldownMessage: {
    fontSize: 16,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
    opacity: 0.7,
  },
  cooldownExitButton: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 60,
    paddingVertical: 18,
    borderRadius: 30,
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  cooldownExitText: {
    fontSize: 18,
    fontFamily: 'HamakiGeo',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
});

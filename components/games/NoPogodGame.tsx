import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DISABLE_GAME_COOLDOWN } from '@/config/featureFlags';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import type { NoPogodGameState } from '@/features/games/noPogod';
import { NoPogodEngine } from '@/features/games/noPogod';
import { NoPogodAudioManager } from '@/features/games/noPogod/audio';
import { NOPOGOD_ASSET_CONFIG, NOPOGOD_GAME_ID } from '@/features/games/noPogod/config/assetConfig';
import { NOPOGOD_GAME_ASSETS } from '@/features/games/noPogod/utils/assets';
import { ResponsiveScalingManager } from '@/features/games/noPogod/utils/responsiveScaling';
import { NoPogodSpriteRenderer } from '@/features/games/noPogod/utils/spriteRenderer';
import { preloadGameAssets, releaseGameAssets } from '@/features/games/shared';
import { useGameCooldown } from '@/hooks/useGameCooldown';
import { useMyLeaderboardStatus } from '@/hooks/useMyLeaderboardStatus';
import { edgeFunctionQueueService } from '@/services/queue';
import {
  generateSessionId,
  generateXPIdempotencyKey,
  isRetryableError,
} from '@/types/edgeFunctionQueue';
import type { AwardXPResult } from '@/types/leaderboard';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
import { trackGameEnd, trackGameStart } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';
import { NoPogodGameCanvasAtlas } from './NoPogodGameCanvasAtlas';

const log = createLogger('NoPogodGame');



const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NoPogodGameProps {
  visible: boolean;
  onClose: () => void;
}

export const NoPogodGame: React.FC<NoPogodGameProps> = ({
  visible,
  onClose,
}) => {
  const { userProfile, updateUserProfile, isDemoMode } = useAuth();

  // Personal leaderboard status for instant rank updates
  const { updateFromAwardXP } = useMyLeaderboardStatus({
    userId: userProfile?.id,
    autoFetch: false, // Don't fetch on mount, just use for updates
  });
  const gameEngineRef = useRef<NoPogodEngine | null>(null);
  const spriteRendererRef = useRef<NoPogodSpriteRenderer | null>(null);
  const responsiveScalingRef = useRef<ResponsiveScalingManager | null>(null);
  const audioManagerRef = useRef<NoPogodAudioManager | null>(null);
  const [gameState, setGameState] = useState<NoPogodGameState | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [showCooldownScreen, setShowCooldownScreen] = useState(false);
  const MAX_ROUNDS = 3; // Maximum rounds before cooldown
  const COOLDOWN_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour

  // Game cooldown hook - persists across app restarts
  const {
    remainingFormatted: cooldownRemainingFormatted,
    isOnCooldown,
    startCooldown,
  } = useGameCooldown({
    gameId: 'nopogod',
    cooldownMs: COOLDOWN_DURATION_MS,
    persist: true,
  });

  // Touch feedback state
  const [activeTouchZone, setActiveTouchZone] = useState<'LEFT' | 'RIGHT' | null>(null);
  const touchFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const gamePhaseRef = useRef<string>('MENU');
  const isTouchingRef = useRef(false);
  const touchDirectionRef = useRef<'LEFT' | 'RIGHT' | null>(null);

  // Session ID for idempotency - generated once per game session
  const sessionIdRef = useRef<string | null>(null);

  // Show cooldown screen if on cooldown when modal opens
  // Skip if DISABLE_GAME_COOLDOWN flag is enabled
  useEffect(() => {
    if (visible && isOnCooldown && !isDemoMode && !DISABLE_GAME_COOLDOWN) {
      setShowCooldownScreen(true);
    }
  }, [visible, isOnCooldown, isDemoMode]);



  // Load high score on mount
  useEffect(() => {
    loadHighScore();
  }, []);

  // Initialize game engine, sprite renderer, responsive scaling, and audio
  // Also preload atlas assets
  useEffect(() => {
    if (visible && !gameEngineRef.current) {
      // Preload atlas assets first (using shared loader with NoPogod config)
      preloadGameAssets(NOPOGOD_GAME_ID, NOPOGOD_ASSET_CONFIG).then(() => {
        log.info('Atlas assets preloaded');
      }).catch(err => {
        log.error('Failed to preload atlas assets', err);
      });

      gameEngineRef.current = new NoPogodEngine(SCREEN_WIDTH, SCREEN_HEIGHT, NOPOGOD_GAME_ASSETS);
      spriteRendererRef.current = new NoPogodSpriteRenderer(NOPOGOD_GAME_ASSETS, SCREEN_WIDTH, SCREEN_HEIGHT);
      responsiveScalingRef.current = new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);

      // Initialize audio manager and load sounds
      audioManagerRef.current = new NoPogodAudioManager();
      audioManagerRef.current.loadSounds().then(() => {
        log.info('Game audio loaded');
        // Start background music when entering start menu
        if (audioManagerRef.current) {
          audioManagerRef.current.playBackground();
        }
      }).catch(err => {
        log.error('Failed to load game audio', err);
      });

      // Set up callback for catch sound and Miro quotes
      gameEngineRef.current.onItemCaught = (itemType: string) => {
        if (audioManagerRef.current) {
          // Play item-specific sounds
          if (itemType === 'PEPPER') {
            audioManagerRef.current.playCatchPepperSound();
          } else if (itemType === 'ELECTRIC_SHOCK') {
            audioManagerRef.current.playCatchShockerSound();
          } else {
            audioManagerRef.current.playCatchItemSound();
          }
          audioManagerRef.current.playMiroQuote(); // Play random Miro quote on good item catch
        }
      };

      // Set up callback for throw sound (Shonzika quotes)
      gameEngineRef.current.onItemThrown = () => {
        if (audioManagerRef.current) {
          audioManagerRef.current.playShonzikaQuote(); // Play random Shonzika quote on throw
        }
      };

      setGameState(gameEngineRef.current.getState());
    }
  }, [visible]);

  const loadHighScore = async () => {
    try {
      const stored = await AsyncStorage.getItem('nopogod_high_score');
      if (stored) {
        setHighScore(parseInt(stored, 10));
      }
    } catch (error) {
      log.error('Error loading high score:', error);
    }
  };

  const checkAndSaveHighScore = useCallback(async (score: number) => {
    if (score > highScore) {
      setIsNewHighScore(true);
      setHighScore(score);
      try {
        await AsyncStorage.setItem('nopogod_high_score', score.toString());
        log.info('New high score achieved!', { score });
      } catch (error) {
        log.error('Error saving high score:', error);
      }
    } else {
      setIsNewHighScore(false);
    }
  }, [highScore]);

  // Handle game state updates
  const updateGameState = useCallback(() => {
    try {
      if (gameEngineRef.current) {
        const state = gameEngineRef.current.getState();
        setGameState(state);
        gamePhaseRef.current = state.phase;  // Keep ref in sync for PanResponder
      }
    } catch (error) {
      log.error('Error updating game state:', error);
      // Don't crash the game, just log the error
    }
  }, []);

  // Game control functions
  const startGame = useCallback(() => {
    if (gameEngineRef.current) {
      // Generate a new session ID for idempotency
      sessionIdRef.current = generateSessionId();
      log.debug('New game session', { sessionId: sessionIdRef.current });

      // Track game start for analytics dashboard
      trackGameStart(NOPOGOD_GAME_ID, { sessionId: sessionIdRef.current });

      gameEngineRef.current.startGame();
      updateGameState();
      // Background music already playing from menu
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

      // Pause background music
      if (audioManagerRef.current) {
        audioManagerRef.current.pauseBackground();
      }
    }
  }, [updateGameState]);

  const resumeGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.resumeGame();
      updateGameState();

      // Resume background music
      if (audioManagerRef.current) {
        audioManagerRef.current.resumeBackground();
      }
    }
  }, [updateGameState]);

  const restartGame = useCallback(() => {
    if (gameEngineRef.current) {
      setXpAwarded(false);
      gameEngineRef.current.startGame();
      updateGameState();

      // Start background music again
      if (audioManagerRef.current) {
        audioManagerRef.current.playBackground();
      }
    }
  }, [updateGameState]);

  // Handle continuous movement based on touch direction
  const startMovement = useCallback((direction: 'LEFT' | 'RIGHT') => {
    if (gameEngineRef.current && gamePhaseRef.current === 'PLAYING') {
      isTouchingRef.current = true;
      touchDirectionRef.current = direction;
      gameEngineRef.current.startContinuousMovement(direction);
      updateGameState();

      // Trigger visual feedback
      setActiveTouchZone(direction);
      Animated.timing(touchFeedbackOpacity, {
        toValue: 0.15,
        duration: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [updateGameState, touchFeedbackOpacity]);

  const stopMovement = useCallback(() => {
    if (gameEngineRef.current) {
      isTouchingRef.current = false;
      touchDirectionRef.current = null;
      gameEngineRef.current.stopContinuousMovement();
      updateGameState();

      // Clear visual feedback
      setActiveTouchZone(null);
      Animated.timing(touchFeedbackOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [updateGameState, touchFeedbackOpacity]);

  // Create pan responder for hold-to-move controls
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,  // Don't track movement, just press/release
      onPanResponderGrant: (evt) => {
        if (gamePhaseRef.current !== 'PLAYING') {
          return;
        }

        const touchX = evt.nativeEvent.pageX;
        const screenWidth = SCREEN_WIDTH;

        // Simple: LEFT half = move left, RIGHT half = move right
        if (touchX < screenWidth / 2) {
          startMovement('LEFT');
        } else {
          startMovement('RIGHT');
        }
      },
      onPanResponderRelease: () => {
        stopMovement();
      },
      onPanResponderTerminate: () => {
        stopMovement();
      },
    })
  ).current;

  // Game update loop
  const handleGameUpdate = useCallback((currentTime: number) => {
    try {
      if (gameEngineRef.current) {
        gameEngineRef.current.update(currentTime);
        updateGameState();
      }
    } catch (error) {
      log.error('Error in game update loop:', error);
      // Don't crash the game loop, just log and continue
    }
  }, [updateGameState]);

  // Game loop using requestAnimationFrame
  useEffect(() => {
    if (gameState?.phase === 'PLAYING') {
      const gameLoop = (timestamp: number) => {
        handleGameUpdate(timestamp);
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      };
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState?.phase, handleGameUpdate]);

  // Award XP and check high score when game ends
  useEffect(() => {
    const awardXP = async () => {
      if (gameState?.phase === 'GAME_OVER' && !xpAwarded && userProfile && gameState.score > 0) {
        setXpAwarded(true);

        // Stop background music
        if (audioManagerRef.current) {
          audioManagerRef.current.stopBackground();
        }

        // Track game end for analytics dashboard
        trackGameEnd(NOPOGOD_GAME_ID, gameState.score, {
          sessionId: sessionIdRef.current,
          lives: gameState.lives,
        });

        // Check for high score
        await checkAndSaveHighScore(gameState.score);

        // Calculate XP based on score (1 XP per 10 points scored)
        const xpToAward = Math.floor(gameState.score / 10);

        if (xpToAward > 0) {
          // Generate idempotency key for exactly-once XP awarding
          const sessionId = sessionIdRef.current || generateSessionId();
          const idempotencyKey = generateXPIdempotencyKey(
            userProfile.id,
            NOPOGOD_GAME_ID,
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
                gameId: NOPOGOD_GAME_ID,
                sessionId,
                idempotencyKey,
              },
              silentFail: true,
            });

            if (result.success && result.data) {
              // Update local user profile with server XP (handles duplicates correctly)
              updateUserProfile({ xp_points: result.data.new_total_xp });
              log.info(`Awarded ${xpToAward} XP for No Pogodi game`, {
                newTotal: result.data.new_total_xp,
                personalRank: result.data.personal_rank,
                duplicate: result.data.duplicate,
              });

              // Instantly update personal leaderboard rank (no 5-minute wait!)
              updateFromAwardXP(result.data);
              log.debug('Personal leaderboard rank updated instantly');

              // Invalidate XP stats cache so profile refreshes
              try {
                const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
                await invalidateXPStatsCache(userProfile.id);
                log.debug('XP stats cache invalidated after game');
              } catch (cacheError) {
                log.error('Error invalidating XP cache:', cacheError);
              }
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
                    gameId: NOPOGOD_GAME_ID,
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
                gameId: NOPOGOD_GAME_ID,
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
          }
        }

        // Increment rounds played
        const newRoundsPlayed = roundsPlayed + 1;
        setRoundsPlayed(newRoundsPlayed);

        // Check if user has reached max rounds (only for non-demo users)
        // Skip cooldown if DISABLE_GAME_COOLDOWN flag is enabled
        if (!isDemoMode && !DISABLE_GAME_COOLDOWN && newRoundsPlayed >= MAX_ROUNDS) {
          log.info(`Max rounds reached (${MAX_ROUNDS}). Starting cooldown...`);

          // Start the cooldown using the hook (persists to AsyncStorage)
          try {
            await startCooldown();
            log.info('Game cooldown started via hook');

            // Show cooldown screen after a short delay
            setTimeout(() => {
              setShowCooldownScreen(true);
            }, 2000); // 2 second delay to let user see final score
          } catch (cooldownError) {
            log.error('Error starting game cooldown:', cooldownError);
          }
        }
      }
    };

    // Use Promise.resolve to ensure errors don't crash the app
    awardXP().catch((error) => {
      log.error('Critical error in awardXP:', error);
    });
  }, [
    gameState?.phase,
    gameState?.score,
    xpAwarded,
    userProfile,
    updateUserProfile,
    updateFromAwardXP,
    isDemoMode,
    roundsPlayed,
    startCooldown,
    checkAndSaveHighScore,
  ]);

  // Cleanup on close - including releasing atlas assets and audio
  useEffect(() => {
    if (!visible) {
      gameEngineRef.current = null;
      spriteRendererRef.current = null;
      responsiveScalingRef.current = null;
      setGameState(null);
      setXpAwarded(false);

      // Stop and unload audio
      if (audioManagerRef.current) {
        audioManagerRef.current.unloadSounds().then(() => {
          log.debug('Game audio unloaded');
        });
        audioManagerRef.current = null;
      }

      // Release atlas assets to free memory (using game ID)
      releaseGameAssets(NOPOGOD_GAME_ID);
      log.debug('Game assets released');
    }
  }, [visible]);



  const renderMenuState = () => (
    <View style={styles.menuContainer}>
      <Image
        source={require('@/assets/images/game/launch_Screen.png')}
        style={styles.menuBackgroundImage}
        resizeMode="contain"
      />

      {/* Invisible Clickable Areas overlaying the image buttons */}
      <View style={styles.hiddenButtonContainer}>
        <TouchableOpacity
          style={styles.hiddenButton}
          onPress={startGame}
          activeOpacity={0.3}
        >
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hiddenButton}
          onPress={exitGame}
          activeOpacity={0.3}
        >
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSwipeFeedback = () => {
    if (gameState?.phase !== 'PLAYING' || !activeTouchZone) return null;

    return (
      <Animated.View
        style={[
          styles.swipeFeedback,
          {
            opacity: touchFeedbackOpacity,
            left: activeTouchZone === 'LEFT' ? 0 : '50%',
            width: '50%',
          },
        ]}
      />
    );
  };

  const renderGameUI = () => {
    if (gameState?.phase !== 'PLAYING') return null;

    const isSpeedBoostActive = gameEngineRef.current?.isSpeedBoostActive() || false;
    const speedBoostTimeRemaining = gameEngineRef.current?.getSpeedBoostTimeRemainingSeconds() || 0;
    const isSlowdownActive = gameEngineRef.current?.isSlowdownActive() || false;
    const slowdownTimeRemaining = gameEngineRef.current?.getSlowdownTimeRemainingSeconds() || 0;

    return (
      <View style={styles.gameUI}>
        <View style={styles.topLeftUI}>
          <Text style={styles.scoreText}>Score: {gameState.score}</Text>
          <Text style={styles.livesText}>Lives: {gameState.lives}</Text>
          <Text style={styles.timerText}>Time: {Math.ceil(gameState.timeRemaining / 1000)}s</Text>
          {isSpeedBoostActive && (
            <View style={styles.speedBoostContainer}>
              <Text style={styles.speedBoostText}>⚡ SPEED BOOST ⚡</Text>
              <Text style={styles.speedBoostTimer}>{speedBoostTimeRemaining}s</Text>
            </View>
          )}
          {isSlowdownActive && (
            <View style={styles.slowdownContainer}>
              <Text style={styles.slowdownText}>🐌 SLOWED DOWN 🐌</Text>
              <Text style={styles.slowdownTimer}>{slowdownTimeRemaining}s</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.pauseButton} onPress={pauseGame} activeOpacity={0.7}>
          <Text style={styles.pauseButtonText}>⏸️</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPausedState = () => {
    if (gameState?.phase !== 'PAUSED') return null;

    return (
      <View style={styles.pausedContainer}>
        <Text style={styles.pausedTitle}>Game Paused</Text>
        <View style={styles.pausedButtons}>
          <TouchableOpacity style={styles.resumeButton} onPress={resumeGame} activeOpacity={0.8}>
            <Text style={styles.buttonText}>RESUME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitButton} onPress={exitGame} activeOpacity={0.8}>
            <Text style={styles.exitButtonText}>EXIT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGameOverState = () => {
    if (gameState?.phase !== 'GAME_OVER') return null;

    const xpEarned = Math.floor(gameState.score / 10);

    return (
      <View style={styles.gameOverContainer}>
        <Text style={styles.gameOverTitle}>Game Over</Text>

        {isNewHighScore && (
          <View style={styles.highScoreBanner}>
            <Text style={styles.highScoreText}>🏆 NEW HIGH SCORE! 🏆</Text>
            <Text style={styles.highScoreCongrats}>გილოცავ!</Text>
          </View>
        )}

        <Text style={styles.finalScore}>საბოლოო ქულა: {gameState.score}</Text>

        {highScore > 0 && !isNewHighScore && (
          <Text style={styles.highScoreDisplay}>მაქსიმალური ქულა: {highScore}</Text>
        )}

        {xpEarned > 0 && (
          <Text style={styles.xpEarned}>+{xpEarned} XP მიღებულია! ⭐</Text>
        )}

        {/* Show rounds info for non-demo users */}
        {/* Use xpAwarded to determine if state has updated: if false, show +1 for immediate feedback */}
        {!isDemoMode && (
          <Text style={styles.roundsInfo}>
            Round {xpAwarded ? roundsPlayed : roundsPlayed + 1}/{MAX_ROUNDS}
          </Text>
        )}

        <View style={styles.gameOverButtons}>
          {/* Try Again button - always visible */}
          <TouchableOpacity style={styles.startButton} onPress={() => {
            // Reset rounds if at max
            if (roundsPlayed >= MAX_ROUNDS) {
              setRoundsPlayed(0);
              setXpAwarded(false);
            }
            restartGame();
          }} activeOpacity={0.8}>
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitButton} onPress={exitGame} activeOpacity={0.8}>
            <Text style={styles.exitButtonText}>EXIT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render cooldown screen
  const renderCooldownScreen = () => {
    return (
      <View style={styles.cooldownScreenContainer}>
        <View style={styles.cooldownContent}>
          <Text style={styles.cooldownIcon}>⏰</Text>
          <Text style={styles.cooldownTitle}>Cooldown-ი დაგედო</Text>
          <Text style={styles.cooldownMessage}>
            შენ ითამაშე {MAX_ROUNDS} ხელი!
          </Text>

          {/* Show actual remaining time from the cooldown hook */}
          <Text style={styles.cooldownTimer}>
            {cooldownRemainingFormatted}
          </Text>

          <Text style={styles.cooldownSubtext}>
            შეტყობინებას მიიღებ როცა თამაში ახლიდან შეგეძლება{'\n'}
          </Text>

          <View style={styles.cooldownStats}>
            <Text style={styles.cooldownStatsText}>
              ხელი ნათამაშები: {MAX_ROUNDS}/{MAX_ROUNDS}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.cooldownButton}
            onPress={() => {
              setShowCooldownScreen(false);
              // Don't reset roundsPlayed - the cooldown state is managed by the hook
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.cooldownButtonText}>დაბრუნება</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTouchControls = () => {
    if (gameState?.phase !== 'PLAYING') return null;

    return (
      <View style={styles.controlsContainer} pointerEvents="none">
        <View style={[styles.touchZone, styles.touchZoneLeft, activeTouchZone === 'LEFT' && styles.touchZoneActive]}>
          <Ionicons
            name="chevron-back-circle-outline"
            size={60}
            color={activeTouchZone === 'LEFT' ? "rgba(196, 255, 0, 0.8)" : "rgba(255, 255, 255, 0.3)"}
          />
        </View>
        <View style={[styles.touchZone, styles.touchZoneRight, activeTouchZone === 'RIGHT' && styles.touchZoneActive]}>
          <Ionicons
            name="chevron-forward-circle-outline"
            size={60}
            color={activeTouchZone === 'RIGHT' ? "rgba(196, 255, 0, 0.8)" : "rgba(255, 255, 255, 0.3)"}
          />
        </View>
      </View>
    );
  };

  if (!visible || !gameState || !spriteRendererRef.current || !responsiveScalingRef.current) {
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
          renderCooldownScreen()
        ) : (
          <GestureHandlerRootView style={styles.gameContainer}>
            <View style={styles.canvasContainer} {...panResponder.panHandlers}>
              {/* Skia Canvas with atlas-based sprites and responsive scaling */}
              <NoPogodGameCanvasAtlas
                gameState={gameState}
                spriteRenderer={spriteRendererRef.current!}
                responsiveScaling={responsiveScalingRef.current!}
              />

              {/* Swipe feedback (only during gameplay) */}
              {renderSwipeFeedback()}

              {/* Touch Controls (Visual Indicators) */}
              {renderTouchControls()}

              {/* Overlay UI */}
              {gameState?.phase === 'MENU' && renderMenuState()}
              {gameState?.phase === 'PLAYING' && renderGameUI()}
              {gameState?.phase === 'PAUSED' && renderPausedState()}
              {gameState?.phase === 'GAME_OVER' && renderGameOverState()}
            </View>
          </GestureHandlerRootView>
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
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  canvas: {
    flex: 1,
  },
  // Touch Controls Styles
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  touchZone: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  touchZoneLeft: {
    alignItems: 'center',
  },
  touchZoneRight: {
    alignItems: 'center',
  },
  touchZoneActive: {
    backgroundColor: 'rgba(196, 255, 0, 0.2)', // Neon green tint
    borderColor: 'rgba(196, 255, 0, 0.5)',
    transform: [{ scale: 1.1 }],
  },
  // Swipe feedback styles - DISABLED (transparent)
  swipeFeedback: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: 'transparent',  // Removed yellow highlight
    pointerEvents: 'none',
  },
  menuContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent to show game bg
    pointerEvents: 'box-none',
  },
  menuBackgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // Use cover to fill screen, cropping if necessary
  },
  hiddenButtonContainer: {
    position: 'absolute',
    left: '10%', // Adjusted percentage
    top: '45%', // Adjusted percentage
    flexDirection: 'column',
    gap: 20, // Adjusted gap
  },
  hiddenButton: {
    width: 100, // Reduced width
    height: 40, // Reduced height
    backgroundColor: "transparent", // Debugging background
  },
  // Re-added styles for Pause and Game Over screens
  startButton: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 160,
  },
  exitButton: {
    backgroundColor: 'rgba(220, 53, 69, 0.85)',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    minWidth: 160,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: 'FiraGO-SemiBold',
    color: Colors.dark.background,
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  exitButtonText: {
    fontSize: 18,
    fontFamily: 'FiraGO-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  restartButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 160,
    marginTop: 12,
  },
  restartButtonText: {
    fontSize: 18,
    fontFamily: 'FiraGO-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  gameUI: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    pointerEvents: 'box-none',
  },
  topLeftUI: {
    alignItems: 'flex-start',
    pointerEvents: 'none',
  },
  scoreText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  livesText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  timerText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  speedBoostContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  speedBoostText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#FFD700',
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(255, 215, 0, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  speedBoostTimer: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: '#FFD700',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  slowdownContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(148, 103, 189, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#9467BD',
  },
  slowdownText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#9467BD',
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(148, 103, 189, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  slowdownTimer: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: '#9467BD',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  pauseButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  pauseButtonText: {
    fontSize: 20,
  },
  pausedContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  pausedTitle: {
    fontSize: 36,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    marginBottom: 40,
    textAlign: 'center',
    paddingHorizontal: 12, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  pausedButtons: {
    gap: 20,
  },
  resumeButton: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 160,
  },
  gameOverContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  gameOverTitle: {
    fontSize: 40,
    fontFamily: 'hamaki-eng',
    color: '#FF6B6B',
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 12, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  finalScore: {
    fontSize: 24,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    marginBottom: 12,
    textAlign: 'center',
  },
  xpEarned: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    marginBottom: 40,
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: 'rgba(196, 255, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  gameOverButtons: {
    gap: 20,
  },
  highScoreBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    marginBottom: 20,
    alignItems: 'center',
  },
  highScoreText: {
    fontSize: 24,
    fontFamily: 'hamaki-eng',
    color: '#FFD700',
    fontWeight: 'bold',
    textShadowColor: 'rgba(255, 215, 0, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    paddingHorizontal: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  highScoreCongrats: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#FFD700',
    marginTop: 4,
  },
  highScoreDisplay: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginTop: 8,
    opacity: 0.7,
  },
  roundsInfo: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
    marginTop: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  // Cooldown Screen Styles
  cooldownScreenContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cooldownContent: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 165, 0, 0.3)',
    maxWidth: 400,
    width: '100%',
  },
  cooldownIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  cooldownTitle: {
    fontSize: 32,
    fontFamily: 'HamakiENG',
    color: '#FFA500',
    marginBottom: 16,
    textAlign: 'center',
  },
  cooldownMessage: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  cooldownTimer: {
    fontSize: 48,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '700',
  },
  cooldownSubtext: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 24,
    marginBottom: 24,
  },
  cooldownStats: {
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
  },
  cooldownStatsText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#FFA500',
    fontWeight: '600',
  },
  cooldownButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  cooldownButtonText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.background,
    fontWeight: 'bold',
  },
});

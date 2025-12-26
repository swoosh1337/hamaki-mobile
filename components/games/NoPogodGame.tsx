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
import { NOPOGOD_ASSET_CONFIG, NOPOGOD_GAME_ID } from '@/features/games/noPogod/config/assetConfig';
import { NOPOGOD_GAME_ASSETS } from '@/features/games/noPogod/utils/assets';
import { ResponsiveScalingManager } from '@/features/games/noPogod/utils/responsiveScaling';
import { NoPogodSpriteRenderer } from '@/features/games/noPogod/utils/spriteRenderer';
import { preloadGameAssets, releaseGameAssets } from '@/features/games/shared';
import { useGameCooldown } from '@/hooks/useGameCooldown';
import type { AwardXPResult } from '@/hooks/useMyLeaderboardStatus';
import { invokeEdgeFunction } from '@/utils/edgeFunctionClient';
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
  const gameEngineRef = useRef<NoPogodEngine | null>(null);
  const spriteRendererRef = useRef<NoPogodSpriteRenderer | null>(null);
  const responsiveScalingRef = useRef<ResponsiveScalingManager | null>(null);
  const [gameState, setGameState] = useState<NoPogodGameState | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [showCooldownScreen, setShowCooldownScreen] = useState(false);
  const MAX_ROUNDS = 3; // Maximum rounds before cooldown
  const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Game cooldown hook - persists across app restarts
  const {
    canPlay: canPlayFromCooldown,
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

  // Initialize game engine, sprite renderer, and responsive scaling
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

  const checkAndSaveHighScore = async (score: number) => {
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
  };

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
      gameEngineRef.current.startGame();
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

  const resumeGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.resumeGame();
      updateGameState();
    }
  }, [updateGameState]);

  const restartGame = useCallback(() => {
    if (gameEngineRef.current) {
      setXpAwarded(false);
      gameEngineRef.current.startGame();
      updateGameState();
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

        // Check for high score
        await checkAndSaveHighScore(gameState.score);

        // Calculate XP based on score (1 XP per 10 points scored)
        const xpToAward = Math.floor(gameState.score / 10);

        if (xpToAward > 0) {
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
              log.info(`Awarded ${xpToAward} XP for No Pogodi game`, {
                newTotal: result.data.new_total_xp,
                personalRank: result.data.personal_rank,
              });

              // Invalidate XP stats cache so profile refreshes
              try {
                const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
                await invalidateXPStatsCache(userProfile.id);
                log.debug('XP stats cache invalidated after game');
              } catch (error) {
                log.error('Error invalidating XP cache:', error);
              }
            } else {
              // Edge Function failed - update locally as fallback
              const newXP = userProfile.xp_points + xpToAward;
              updateUserProfile({ xp_points: newXP });
              log.warn(`Edge Function failed, updated locally: ${xpToAward} XP`, {
                error: result.error,
              });
            }
          } catch (error) {
            // Network error or other issue - still update locally to prevent data loss
            const newXP = userProfile.xp_points + xpToAward;
            log.error('Error awarding XP, updating locally only:', error);
            updateUserProfile({ xp_points: newXP });
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
          } catch (error) {
            log.error('Error starting game cooldown:', error);
          }
        }
      }
    };

    // Use Promise.resolve to ensure errors don't crash the app
    awardXP().catch((error) => {
      log.error('Critical error in awardXP:', error);
    });
  }, [gameState?.phase, gameState?.score, xpAwarded, userProfile, updateUserProfile, isDemoMode, roundsPlayed, startCooldown]);

  // Cleanup on close - including releasing atlas assets
  useEffect(() => {
    if (!visible) {
      gameEngineRef.current = null;
      spriteRendererRef.current = null;
      responsiveScalingRef.current = null;
      setGameState(null);
      setXpAwarded(false);

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
            <Text style={styles.buttonText}>EXIT</Text>
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
            <Text style={styles.highScoreCongrats}>Congratulations!</Text>
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
        {!isDemoMode && (
          <Text style={styles.roundsInfo}>
            Round {roundsPlayed}/{MAX_ROUNDS}
          </Text>
        )}

        <View style={styles.gameOverButtons}>
          {/* Only show Try Again if under max rounds or in demo mode */}
          {(isDemoMode || roundsPlayed < MAX_ROUNDS) && (
            <TouchableOpacity style={styles.startButton} onPress={restartGame} activeOpacity={0.8}>
              <Text style={styles.buttonText}>ახლიდან ცდა</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.exitButton} onPress={exitGame} activeOpacity={0.8}>
            <Text style={styles.buttonText}>გამოსვლა</Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    minWidth: 160,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.background,
    textAlign: 'center',
    fontWeight: 'bold',
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
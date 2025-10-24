import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { NOPOGOD_GAME_ASSETS } from '@/utils/noPogodGameAssets';
import { NoPogodGameEngine } from '@/utils/noPogodGameEngine';
import { ResponsiveScalingManager } from '@/utils/noPogodResponsiveScaling';
import { NoPogodSpriteRenderer } from '@/utils/noPogodSpriteRenderer';
import { userService } from '@/utils/supabase';
import { NoPogodGameCanvas } from './NoPogodGameCanvas';



const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NoPogodGameProps {
  visible: boolean;
  onClose: () => void;
}

export const NoPogodGame: React.FC<NoPogodGameProps> = ({
  visible,
  onClose,
}) => {
  const { userProfile, updateUserProfile } = useAuth();
  const gameEngineRef = useRef<NoPogodGameEngine | null>(null);
  const spriteRendererRef = useRef<NoPogodSpriteRenderer | null>(null);
  const responsiveScalingRef = useRef<ResponsiveScalingManager | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [highScore, setHighScore] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // Touch feedback state
  const [activeTouchZone, setActiveTouchZone] = useState<'LEFT' | 'RIGHT' | null>(null);
  const touchFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const gamePhaseRef = useRef<string>('MENU');
  const isTouchingRef = useRef(false);
  const touchDirectionRef = useRef<'LEFT' | 'RIGHT' | null>(null);



  // Load high score on mount
  useEffect(() => {
    loadHighScore();
  }, []);

  // Initialize game engine, sprite renderer, and responsive scaling
  useEffect(() => {
    if (visible && !gameEngineRef.current) {
      gameEngineRef.current = new NoPogodGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT, NOPOGOD_GAME_ASSETS);
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
      console.error('Error loading high score:', error);
    }
  };

  const checkAndSaveHighScore = async (score: number) => {
    if (score > highScore) {
      setIsNewHighScore(true);
      setHighScore(score);
      try {
        await AsyncStorage.setItem('nopogod_high_score', score.toString());
        console.log('🏆 NEW HIGH SCORE!', score);
      } catch (error) {
        console.error('Error saving high score:', error);
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
      console.error('❌ Error updating game state:', error);
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
    console.log('🎮 START movement:', direction, 'Phase:', gamePhaseRef.current);
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
    console.log('🎮 STOP movement');
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
          console.log('👆 Touch ignored - phase:', gamePhaseRef.current);
          return;
        }

        const touchX = evt.nativeEvent.pageX;
        const screenWidth = SCREEN_WIDTH;

        console.log('👆 TOUCH START at X:', touchX, 'Screen:', screenWidth);

        // Simple: LEFT half = move left, RIGHT half = move right
        if (touchX < screenWidth / 2) {
          console.log('👆 LEFT half - moving LEFT');
          startMovement('LEFT');
        } else {
          console.log('👆 RIGHT half - moving RIGHT');
          startMovement('RIGHT');
        }
      },
      onPanResponderRelease: () => {
        console.log('👆 TOUCH RELEASE - stopping movement');
        stopMovement();
      },
      onPanResponderTerminate: () => {
        console.log('👆 TOUCH TERMINATED - stopping movement');
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
      console.error('❌ Error in game update loop:', error);
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
          const newXP = userProfile.xp_points + xpToAward;

          try {
            // Update XP in database with error handling
            const success = await userService.updateUserXP(userProfile.google_id, newXP);

            if (success) {
              // Update local user profile
              updateUserProfile({ xp_points: newXP });
              console.log(`✅ Awarded ${xpToAward} XP for No Pogodi game!`);

              // Update leaderboard entries (weekly and all-time)
              const leaderboardSuccess = await userService.updateLeaderboardPoints(userProfile.id, xpToAward);

              if (leaderboardSuccess) {
                console.log(`✅ Updated leaderboard with ${xpToAward} points!`);
              } else {
                console.error('❌ Failed to update leaderboard entries');
              }
            } else {
              // Silently update local profile even if server update fails
              updateUserProfile({ xp_points: newXP });
              console.warn(`⚠️ XP update failed on server, but updated locally: ${xpToAward} XP`);
            }
          } catch (error) {
            // Network error or other issue - still update locally to prevent data loss
            console.error('❌ Error awarding XP, updating locally only:', error);
            updateUserProfile({ xp_points: newXP });
          }
        }
      }
    };

    // Use Promise.resolve to ensure errors don't crash the app
    awardXP().catch((error) => {
      console.error('❌ Critical error in awardXP:', error);
    });
  }, [gameState?.phase, gameState?.score, xpAwarded, userProfile, updateUserProfile]);

  // Cleanup on close
  useEffect(() => {
    if (!visible) {
      gameEngineRef.current = null;
      spriteRendererRef.current = null;
      responsiveScalingRef.current = null;
      setGameState(null);
      setXpAwarded(false);
    }
  }, [visible]);



  const renderMenuState = () => (
    <View style={styles.menuContainer}>
      <Text style={styles.gameTitle}>No Pogodi!</Text>
      <Text style={styles.gameSubtitle}>Help Miro catch the good items!</Text>
      <Text style={styles.instructionText}>Swipe left or right to move</Text>
      <View style={styles.menuButtons}>
        <TouchableOpacity style={styles.startButton} onPress={startGame} activeOpacity={0.8}>
          <Text style={styles.buttonText}>START</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exitButton} onPress={exitGame} activeOpacity={0.8}>
          <Text style={styles.buttonText}>EXIT</Text>
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

        <Text style={styles.finalScore}>Final Score: {gameState.score}</Text>

        {highScore > 0 && !isNewHighScore && (
          <Text style={styles.highScoreDisplay}>High Score: {highScore}</Text>
        )}

        {xpEarned > 0 && (
          <Text style={styles.xpEarned}>+{xpEarned} XP Earned! ⭐</Text>
        )}

        <View style={styles.gameOverButtons}>
          <TouchableOpacity style={styles.startButton} onPress={restartGame} activeOpacity={0.8}>
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitButton} onPress={exitGame} activeOpacity={0.8}>
            <Text style={styles.buttonText}>EXIT</Text>
          </TouchableOpacity>
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
        <GestureHandlerRootView style={styles.gameContainer}>
          <View style={styles.canvasContainer} {...panResponder.panHandlers}>
            {/* Skia Canvas with proper sprite rendering and responsive scaling */}
            <NoPogodGameCanvas
              gameState={gameState}
              spriteRenderer={spriteRendererRef.current!}
              responsiveScaling={responsiveScalingRef.current!}
              miroSprite={gameEngineRef.current?.getCurrentMiroSprite()}
              shonzikaSprite={gameEngineRef.current?.getCurrentShonzikaSprite()}
            />

            {/* Swipe feedback (only during gameplay) */}
            {renderSwipeFeedback()}

            {/* Overlay UI */}
            {gameState.phase === 'MENU' && renderMenuState()}
            {gameState.phase === 'PLAYING' && renderGameUI()}
            {gameState.phase === 'PAUSED' && renderPausedState()}
            {gameState.phase === 'GAME_OVER' && renderGameOverState()}
          </View>
        </GestureHandlerRootView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    pointerEvents: 'box-none',
  },
  gameTitle: {
    fontSize: 48,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 16, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  gameSubtitle: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 40,
    textAlign: 'center',
  },
  menuButtons: {
    gap: 20,
  },
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
    paddingHorizontal: 8, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
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
});
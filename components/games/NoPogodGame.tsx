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
  
  // Touch feedback state
  const [activeTouchZone, setActiveTouchZone] = useState<'LEFT' | 'CENTER' | 'RIGHT' | null>(null);
  const touchFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const lastSwipeTime = useRef(0);



  // Initialize game engine, sprite renderer, and responsive scaling
  useEffect(() => {
    if (visible && !gameEngineRef.current) {
      gameEngineRef.current = new NoPogodGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT, NOPOGOD_GAME_ASSETS);
      spriteRendererRef.current = new NoPogodSpriteRenderer(NOPOGOD_GAME_ASSETS, SCREEN_WIDTH, SCREEN_HEIGHT);
      responsiveScalingRef.current = new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);
      setGameState(gameEngineRef.current.getState());
    }
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

  // Handle swipe gestures for player movement
  const handleSwipe = useCallback((direction: 'LEFT' | 'RIGHT' | 'CENTER') => {
    console.log('🎮 Swipe detected:', direction, 'Game phase:', gameState?.phase);
    if (gameEngineRef.current && gameState?.phase === 'PLAYING') {
      const now = Date.now();
      // Prevent too frequent swipes
      if (now - lastSwipeTime.current < 150) return;
      lastSwipeTime.current = now;
      
      console.log('🎮 Moving player to:', direction);
      gameEngineRef.current.movePlayer(direction);
      updateGameState();
      
      // Trigger visual feedback
      setActiveTouchZone(direction);
      Animated.sequence([
        Animated.timing(touchFeedbackOpacity, {
          toValue: 0.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(touchFeedbackOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveTouchZone(null);
      });
    }
  }, [gameState, updateGameState, touchFeedbackOpacity]);

  // Create pan responder for swipe detection
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameState?.phase === 'PLAYING',
      onMoveShouldSetPanResponder: () => gameState?.phase === 'PLAYING',
      onPanResponderRelease: (_evt, gestureState) => {
        console.log('👆 Touch released:', gestureState);
        if (gameState?.phase !== 'PLAYING') return;
        
        const { dx, vx } = gestureState;
        const swipeThreshold = 30;
        const velocityThreshold = 0.5;
        
        console.log('👆 Gesture data:', { dx, vx, swipeThreshold, velocityThreshold });
        
        // Determine swipe direction based on translation and velocity
        if (Math.abs(dx) > swipeThreshold || Math.abs(vx) > velocityThreshold) {
          if (dx < -swipeThreshold || vx < -velocityThreshold) {
            // Swipe left
            console.log('👆 Detected LEFT swipe');
            handleSwipe('LEFT');
          } else if (dx > swipeThreshold || vx > velocityThreshold) {
            // Swipe right
            console.log('👆 Detected RIGHT swipe');
            handleSwipe('RIGHT');
          }
        } else {
          // Tap in center (no significant swipe)
          console.log('👆 Detected CENTER tap');
          handleSwipe('CENTER');
        }
      },
    })
  ).current;

  // Game update loop
  const handleGameUpdate = useCallback((currentTime: number) => {
    if (gameEngineRef.current) {
      gameEngineRef.current.update(currentTime);
      updateGameState();
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

  // Award XP when game ends
  useEffect(() => {
    const awardXP = async () => {
      if (gameState?.phase === 'GAME_OVER' && !xpAwarded && userProfile && gameState.score > 0) {
        setXpAwarded(true);
        
        // Calculate XP based on score (1 XP per 10 points scored)
        const xpToAward = Math.floor(gameState.score / 10);
        
        if (xpToAward > 0) {
          const newXP = userProfile.xp_points + xpToAward;
          
          // Update XP in database
          const success = await userService.updateUserXP(userProfile.google_id, newXP);
          
          if (success) {
            // Update local user profile
            updateUserProfile({ xp_points: newXP });
            console.log(`Awarded ${xpToAward} XP for No Pogodi game!`);
          }
        }
      }
    };
    
    awardXP();
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
            left: activeTouchZone === 'LEFT' ? 0 : activeTouchZone === 'CENTER' ? '33%' : '66%',
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
        <Text style={styles.finalScore}>Final Score: {gameState.score}</Text>
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
  // Swipe feedback styles
  swipeFeedback: {
    position: 'absolute',
    top: 0,
    width: '33.33%',
    height: '100%',
    backgroundColor: Colors.dark.tint,
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
});
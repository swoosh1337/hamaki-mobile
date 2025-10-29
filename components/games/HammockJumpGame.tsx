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
import { GameAssets, HammockGameEngine } from '@/utils/gameEngine';
import { userService } from '@/utils/supabase';
import { GameCanvas } from './GameCanvas';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Import game assets
const GAME_ASSETS: GameAssets = {
  background: require('@/assets/bg.png'),
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

  // Initialize game engine and accelerometer
  useEffect(() => {
    if (visible && !gameEngineRef.current) {
      gameEngineRef.current = new HammockGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT);
      setGameState(gameEngineRef.current.getState());
      
      // Setup accelerometer with fallback
      const setupAccelerometer = async () => {
        try {
          // Check if accelerometer is available
          const isAvailable = await Accelerometer.isAvailableAsync();
          if (!isAvailable) {
            console.log('Accelerometer not available on this device');
            setHasAccelerometer(false);
            return;
          }

          Accelerometer.setUpdateInterval(16); // ~60fps
          accelerometerSubscription.current = Accelerometer.addListener(({ x }: { x: number; y: number; z: number }) => {
            if (gameEngineRef.current) {
              // Use x-axis for left/right tilt, direct mapping
              const tiltValue = x * 2; // Direct mapping, multiply by 2 for more sensitivity
              const clampedValue = Math.max(-1, Math.min(1, tiltValue));
              gameEngineRef.current.setMoveAnalog(clampedValue);
              
              // Debug logging (remove in production)
              if (Math.abs(clampedValue) > 0.1) {
                console.log(`Tilt: ${clampedValue.toFixed(2)}`);
              }
            }
          });
          console.log('✅ Accelerometer setup successful');
        } catch (error) {
          console.log('Accelerometer setup failed, using touch controls as fallback:', error);
          setHasAccelerometer(false);
        }
      };

      setupAccelerometer();
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



  // Game update loop
  const handleGameUpdate = useCallback((currentTime: number) => {
    if (gameEngineRef.current) {
      gameEngineRef.current.update(currentTime);
      updateGameState();
    }
  }, [updateGameState]);

  // Award XP when game ends (mirror No Pogodi logic)
  useEffect(() => {
    const awardXP = async () => {
      if (gameState?.phase === 'GAME_OVER' && !xpAwarded && userProfile && gameState.score > 0) {
        setXpAwarded(true);
        const xpToAward = Math.max(1, Math.floor(gameState.score / 50)); // Height-based: 1 XP per 50 points (pixels)

        const newXP = userProfile.xp_points + xpToAward;
        try {
          const success = await userService.updateUserXP(userProfile.google_id, newXP);
          if (success) {
            updateUserProfile({ xp_points: newXP });
            // invalidate XP cache
            try {
              const { invalidateXPStatsCache } = await import('@/utils/xpStatsCache');
              await invalidateXPStatsCache(userProfile.id);
            } catch {}
            // leaderboard update (non-blocking)
            userService.updateLeaderboardPoints(userProfile.id, xpToAward).catch(() => {});
          } else {
            updateUserProfile({ xp_points: newXP });
          }
        } catch {
          updateUserProfile({ xp_points: newXP });
        }
      }
    };
    awardXP().catch(() => {});
  }, [gameState?.phase, gameState?.score, xpAwarded, userProfile, updateUserProfile]);

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
            hasAccelerometer={hasAccelerometer}
            gameEngine={gameEngineRef.current}
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

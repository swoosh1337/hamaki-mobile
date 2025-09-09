import React, { useMemo, useEffect, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  Group,
} from '@shopify/react-native-skia';
import { GestureHandlerRootView, TapGestureHandler } from 'react-native-gesture-handler';

import { GameState, GameAssets, GAME_CONFIG } from '@/utils/gameEngine';
import { Colors } from '@/constants/Colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GameCanvasProps {
  gameState: GameState;
  assets: GameAssets;
  onStartGame: () => void;
  onExitGame: () => void;
  onPauseGame: () => void;
  onJump: () => void;
  onUpdate: (currentTime: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  assets,
  onStartGame,
  onExitGame,
  onPauseGame,
  onJump,
  onUpdate,
}) => {
  // Load Skia images
  const backgroundImage = useImage(assets.background);
  const person1Image = useImage(assets.person1);
  const person2Image = useImage(assets.person2);
  const person3Image = useImage(assets.person3);

  // Game loop using requestAnimationFrame
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (gameState.phase === 'PLAYING') {
      const gameLoop = (timestamp: number) => {
        onUpdate(timestamp);
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      };
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
      // Stop animation when not playing
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
  }, [gameState.phase, onUpdate]);

  // Calculate sprite positions and sizes for mobile scaling
  const spriteConfig = useMemo(() => {
    // Make characters much bigger - use screen-based scaling instead of fixed design
    const characterScale = Math.min(SCREEN_WIDTH / 300, SCREEN_HEIGHT / 400); 
    const spriteSize = GAME_CONFIG.PLAYER_SIZE * characterScale * 3; // Much bigger characters
    
    // Background fills screen
    const bgWidth = SCREEN_WIDTH;
    const bgHeight = SCREEN_HEIGHT;
    const bgX = 0;
    const bgY = 0;
    
    return {
      spriteSize,
      characterScale,
      bgWidth,
      bgHeight,
      bgX,
      bgY,
    };
  }, []);

  // Calculate character positions
  const characterPositions = useMemo(() => {
    if (gameState.phase !== 'PLAYING' && gameState.phase !== 'PAUSED') return null;

    // Position characters on screen
    const player = gameState.player;
    
    // Position characters at bottom of screen
    const floorY = SCREEN_HEIGHT * 0.8; // 80% down the screen
    const person1X = SCREEN_WIDTH * 0.2; // 20% from left
    const person2X = SCREEN_WIDTH * 0.8; // 80% from left  
    const person3X = SCREEN_WIDTH * 0.5; // Center
    
    return {
      person1: {
        x: person1X - spriteConfig.spriteSize / 2,
        y: floorY - spriteConfig.spriteSize,
      },
      person2: {
        x: person2X - spriteConfig.spriteSize / 2,
        y: floorY - spriteConfig.spriteSize,
      },
      person3: {
        x: person3X - spriteConfig.spriteSize / 2,
        y: floorY - spriteConfig.spriteSize + (player.y - player.groundY), // Add jump offset from game engine
      },
    };
  }, [gameState, spriteConfig]);

  const handleTap = () => {
    if (gameState.phase === 'PLAYING') {
      onJump();
    }
  };

  const renderMenuState = () => (
    <View style={styles.menuContainer}>
      <Text style={styles.gameTitle}>Hammock Jump</Text>
      <View style={styles.menuButtons}>
        <Pressable style={styles.startButton} onPress={onStartGame}>
          <Text style={styles.buttonText}>START</Text>
        </Pressable>
        <Pressable style={styles.exitButton} onPress={onExitGame}>
          <Text style={styles.buttonText}>EXIT</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderGameUI = () => {
    if (gameState.phase !== 'PLAYING') return null;

    return (
      <View style={styles.gameUI}>
        <View style={styles.topRightUI}>
          <Text style={styles.scoreText}>Score: {gameState.score}</Text>
          <View style={styles.livesContainer}>
            <Text style={styles.livesText}>Lives: </Text>
            {Array.from({ length: gameState.lives }).map((_, index) => (
              <Text key={index} style={styles.heartIcon}>❤️</Text>
            ))}
          </View>
        </View>
        <Pressable style={styles.pauseButton} onPress={onPauseGame}>
          <Text style={styles.pauseButtonText}>⏸️</Text>
        </Pressable>
      </View>
    );
  };

  const renderPausedState = () => {
    if (gameState.phase !== 'PAUSED') return null;

    return (
      <View style={styles.pausedContainer}>
        <Text style={styles.pausedTitle}>Game Paused</Text>
        <View style={styles.pausedButtons}>
          <Pressable style={styles.resumeButton} onPress={onStartGame}>
            <Text style={styles.buttonText}>RESUME</Text>
          </Pressable>
          <Pressable style={styles.exitButton} onPress={onExitGame}>
            <Text style={styles.buttonText}>EXIT</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderGameOverState = () => {
    if (gameState.phase !== 'GAME_OVER') return null;

    return (
      <View style={styles.gameOverContainer}>
        <Text style={styles.gameOverTitle}>Game Over</Text>
        <Text style={styles.finalScore}>Final Score: {gameState.score}</Text>
        <Pressable style={styles.startButton} onPress={onStartGame}>
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </Pressable>
        <Pressable style={styles.exitButton} onPress={onExitGame}>
          <Text style={styles.buttonText}>EXIT</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <TapGestureHandler onActivated={handleTap}>
        <View style={styles.canvasContainer}>
          <Canvas style={styles.canvas}>
            {/* Background */}
            {backgroundImage && (
              <Image
                image={backgroundImage}
                x={0}
                y={0}
                width={SCREEN_WIDTH}
                height={SCREEN_HEIGHT}
                fit="cover"
              />
            )}

            {/* Render characters during gameplay and paused state */}
            {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && characterPositions && (
              <Group>
                {/* Person 1 (left) */}
                {person1Image && (
                  <Image
                    image={person1Image}
                    x={characterPositions.person1.x}
                    y={characterPositions.person1.y}
                    width={spriteConfig.spriteSize}
                    height={spriteConfig.spriteSize}
                  />
                )}

                {/* Person 2 (right) */}
                {person2Image && (
                  <Image
                    image={person2Image}
                    x={characterPositions.person2.x}
                    y={characterPositions.person2.y}
                    width={spriteConfig.spriteSize}
                    height={spriteConfig.spriteSize}
                  />
                )}

                {/* Person 3 (player) */}
                {person3Image && (
                  <Image
                    image={person3Image}
                    x={characterPositions.person3.x}
                    y={characterPositions.person3.y}
                    width={spriteConfig.spriteSize}
                    height={spriteConfig.spriteSize}
                  />
                )}
              </Group>
            )}
          </Canvas>

          {/* Overlay UI */}
          {gameState.phase === 'MENU' && renderMenuState()}
          {gameState.phase === 'PLAYING' && renderGameUI()}
          {gameState.phase === 'PAUSED' && renderPausedState()}
          {gameState.phase === 'GAME_OVER' && renderGameOverState()}
        </View>
      </TapGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  canvas: {
    flex: 1,
  },
  menuContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  gameTitle: {
    fontSize: 48,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    marginBottom: 60,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
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
  },
  topRightUI: {
    alignItems: 'flex-end',
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
  livesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  livesText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  heartIcon: {
    fontSize: 16,
    marginLeft: 4,
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
    marginBottom: 40,
    textAlign: 'center',
  },
});
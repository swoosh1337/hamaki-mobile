import { Canvas, Group, Image, Rect, useImage } from '@shopify/react-native-skia';
import React, { memo, useEffect, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/Colors';
import { GAME_CONFIG, GameAssets, GameState } from '@/utils/gameEngine';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Memoized score display - ONLY updates when score changes
const ScoreBoard = memo(({ score }: { score: number }) => {
  const platformsClimbed = Math.floor(score / GAME_CONFIG.SCORE_PER_PLATFORM);

  return (
    <View>
      <Text style={styles.scoreText}>Score: {score}</Text>
      <View style={styles.livesContainer}>
        <Text style={styles.livesText}>Height: {platformsClimbed}m</Text>
      </View>
    </View>
  );
});

// Memoized indicators - updates when gameplay state changes (combo, grounded)
const GameIndicators = memo(({ combo, canDoubleJump, isGrounded }: {
  combo: number;
  canDoubleJump: boolean;
  isGrounded: boolean;
}) => {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {combo > 1 && (
        <View style={styles.comboContainer}>
          <Text style={styles.comboText}>Combo x{combo}!</Text>
        </View>
      )}
      {canDoubleJump && !isGrounded && (
        <View style={styles.doubleJumpIndicator}>
          <Text style={styles.doubleJumpText}>⚡ Double Tap!</Text>
        </View>
      )}
    </View>
  );
});

interface GameCanvasProps {
  gameState: GameState;
  assets: GameAssets;
  onStartGame: () => void;
  onExitGame: () => void;
  onPauseGame: () => void;
  onUpdate: (currentTime: number) => void;
  onDoubleTap?: () => void;
  hasAccelerometer?: boolean;
  gameEngine?: any; // Pass game engine for fallback controls
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  assets,
  onStartGame,
  onExitGame,
  onPauseGame,
  onUpdate,
  onDoubleTap,
  hasAccelerometer = true,
  gameEngine,
}) => {
  // Load Skia images
  const backgroundImage = useImage(assets.background || null);
  const playerImage = useImage(assets.player || null);

  // Game loop using requestAnimationFrame
  const animationFrameRef = useRef<number | undefined>(undefined);

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

  const spriteSize = GAME_CONFIG.PLAYER_SIZE;

  // Movement is now handled by phone tilting

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
          <ScoreBoard score={gameState.score} />
          <GameIndicators
            combo={gameState.combo}
            canDoubleJump={gameState.player.canDoubleJump}
            isGrounded={gameState.player.isGrounded}
          />
        </View>

        {/* Tilt indicator */}
        <View style={styles.tiltIndicator} />
        <Pressable style={styles.pauseButton} onPress={onPauseGame}>
          <Text style={styles.pauseButtonText}>⏸️</Text>
        </Pressable>
      </View>
    );
  };

  const handleResumeGame = () => {
    if (gameEngine) {
      gameEngine.resumeGame();
      onUpdate(performance.now()); // Trigger state update
    }
  };

  const renderPausedState = () => {
    if (gameState.phase !== 'PAUSED') return null;

    return (
      <View style={styles.pausedContainer}>
        <Text style={styles.pausedTitle}>Game Paused</Text>
        <View style={styles.pausedButtons}>
          <Pressable style={styles.resumeButton} onPress={handleResumeGame}>
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
        <View style={styles.gameOverButtons}>
          <Pressable style={styles.startButton} onPress={onStartGame}>
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </Pressable>
          <Pressable style={styles.exitButton} onPress={onExitGame}>
            <Text style={styles.buttonText}>EXIT</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
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

          {/* Platforms */}
          {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && (
            <Group>
              {gameState.platforms.map(p => {
                if (p.broken) {
                  return null;
                }

                let color = "rgba(120,120,120,0.9)"; // normal - gray
                if (p.type === 'moving') color = "rgba(80,80,180,0.9)"; // moving - blue-gray
                if (p.type === 'breakable') color = "rgba(139,69,19,0.9)"; // breakable - brown
                if (p.type === 'spring') color = p.springUsed ? "rgba(100,100,100,0.6)" : "rgba(255,215,0,0.95)"; // spring - gold (unused) / gray (used)

                return (
                  <Rect key={p.id} x={p.x} y={p.y} width={p.width} height={p.height} color={color} />
                );
              })}
            </Group>
          )}

          {/* Particles */}
          {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && (
            <Group>
              {gameState.particles.map(particle => {
                const alpha = particle.life / particle.maxLife;
                return (
                  <Rect
                    key={particle.id}
                    x={particle.x - particle.size / 2}
                    y={particle.y - particle.size / 2}
                    width={particle.size}
                    height={particle.size}
                    color={`${particle.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`}
                  />
                );
              })}
            </Group>
          )}

          {/* Player */}
          {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && playerImage && (
            <Image
              image={playerImage}
              x={gameState.player.x + (gameState.screenShake > 0 ? (Math.random() - 0.5) * gameState.screenShake : 0)}
              y={gameState.player.y + (gameState.screenShake > 0 ? (Math.random() - 0.5) * gameState.screenShake : 0)}
              width={spriteSize}
              height={spriteSize}
              fit="contain"
            />
          )}
        </Canvas>

        {/* Overlay UI */}
        {gameState.phase === 'MENU' && renderMenuState()}
        {gameState.phase === 'PLAYING' && renderGameUI()}
        {gameState.phase === 'PAUSED' && renderPausedState()}
        {gameState.phase === 'GAME_OVER' && renderGameOverState()}

        {/* Double tap area for double jump */}
        {gameState.phase === 'PLAYING' && onDoubleTap && (
          <Pressable
            style={styles.doubleTapArea}
            onPress={onDoubleTap}
          />
        )}

        {/* Fallback touch controls if no accelerometer */}
        {!hasAccelerometer && gameState.phase === 'PLAYING' && (
          <>
            <Pressable
              style={styles.leftTouchArea}
              onPressIn={() => gameEngine?.setMoveLeft(true)}
              onPressOut={() => gameEngine?.setMoveLeft(false)}
            />
            <Pressable
              style={styles.rightTouchArea}
              onPressIn={() => gameEngine?.setMoveRight(true)}
              onPressOut={() => gameEngine?.setMoveRight(false)}
            />
          </>
        )}
      </View>
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
    paddingHorizontal: 16, // Extra padding for italic font
    includeFontPadding: false, // Android: prevent extra padding
    textAlignVertical: 'center', // Android: center text vertically
  },
  menuButtons: {
    gap: 30, // Increased gap for better spacing
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
    zIndex: 5,
  },
  topRightUI: {
    alignItems: 'flex-end',
  },
  scoreText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: '#000000',
    fontWeight: 'bold',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    minWidth: 140,
    textAlign: 'right',
  },
  livesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  livesText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#000000',
    fontWeight: 'bold',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    minWidth: 140,
    textAlign: 'right',
  },
  heartIcon: {
    fontSize: 16,
    marginLeft: 4,
  },
  comboContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  comboText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  doubleJumpIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  doubleJumpText: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: '#FFD700',
    fontWeight: 'bold',
    textAlign: 'center',
  },

  tiltIndicator: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tiltText: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: 'center',
  },
  leftTouchArea: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  rightTouchArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: 'transparent',
    zIndex: 1,
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
    zIndex: 10,
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
    marginBottom: 40,
    textAlign: 'center',
  },
  gameOverButtons: {
    gap: 30, // Increased gap for better spacing
  },
  doubleTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});

import { Canvas, Group, Image, Rect, useImage } from '@shopify/react-native-skia';
import React, { memo, useEffect, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/Colors';
import { GAME_CONFIG, GameAssets, GameState } from '@/features/games/hammockJump/engine/HammockJumpEngine';
import { NOPOGOD_GAME_ASSETS } from '@/features/games/noPogod/utils/assets';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Memoized Game UI Overlay - Updates only when specific gameplay values change
const GameUI = memo(({
  score,
  combo,
  canDoubleJump,
  isGrounded,
  onPause
}: {
  score: number;
  combo: number;
  canDoubleJump: boolean;
  isGrounded: boolean;
  onPause: () => void;
}) => {
  const platformsClimbed = Math.floor(score / GAME_CONFIG.SCORE_PER_PLATFORM);

  return (
    <View style={styles.gameUI} pointerEvents="box-none">
      {/* Score and Height - fixed position */}
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>Score: {score}</Text>
        <View style={styles.livesContainer}>
          <Text style={styles.livesText}>Height: {platformsClimbed}m</Text>
        </View>
      </View>

      {/* Combo and Double Jump indicators - absolutely positioned to avoid layout shift */}
      <View style={styles.indicatorsContainer}>
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

      {/* Pause button - fixed position */}
      <Pressable style={styles.pauseButton} onPress={onPause}>
        <Text style={styles.pauseButtonText}>⏸️</Text>
      </Pressable>
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
  highScore?: number;
  isNewHighScore?: boolean;
}

export const GameCanvas = React.memo(({
  gameState,
  assets,
  onStartGame,
  onExitGame,
  onPauseGame,
  onUpdate,
  onDoubleTap,
  hasAccelerometer = true,
  gameEngine,
  highScore = 0,
  isNewHighScore = false,
}: GameCanvasProps) => {
  // Load Skia images
  const backgroundImage = useImage(assets.background || null);
  const playerImage = useImage(assets.player || null);

  // Load item images
  const eggImage = useImage(NOPOGOD_GAME_ASSETS.items.egg);
  const tomatoImage = useImage(NOPOGOD_GAME_ASSETS.items.tomato);
  const pepperImage = useImage(NOPOGOD_GAME_ASSETS.items.pepper);

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
            <Text style={styles.buttonText}>CONTINUE</Text>
          </Pressable>
          <Pressable style={styles.exitButton} onPress={onExitGame}>
            <Text style={styles.exitButtonText}>EXIT</Text>
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

        <View style={styles.gameOverButtons}>
          <Pressable style={styles.startButton} onPress={onStartGame}>
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </Pressable>
          <Pressable style={styles.exitButton} onPress={onExitGame}>
            <Text style={styles.exitButtonText}>EXIT</Text>
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

          {/* Items */}
          {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && (
            <Group>
              {gameState.items.map(item => {
                if (item.collected) return null;

                let img = eggImage;
                if (item.type === 'tomato') img = tomatoImage;
                if (item.type === 'pepper') img = pepperImage;

                if (!img) return null;

                return (
                  <Image
                    key={item.id}
                    image={img}
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    fit="contain"
                  />
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
        {gameState.phase === 'PLAYING' && (
          <GameUI
            score={gameState.score}
            combo={gameState.combo}
            canDoubleJump={gameState.player.canDoubleJump}
            isGrounded={gameState.player.isGrounded}
            onPause={onPauseGame}
          />
        )}
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

});

GameUI.displayName = 'GameUI';
GameCanvas.displayName = 'GameCanvas';

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
    backgroundColor: 'rgba(220, 53, 69, 0.85)',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
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
  exitButtonText: {
    fontSize: 20,
    fontFamily: 'hamaki-eng',
    color: '#FFFFFF',
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
    flexDirection: 'column',
    zIndex: 5,
  },
  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  indicatorsContainer: {
    position: 'absolute',
    top: 80,
    left: 0,
    alignItems: 'flex-start',
  },
  scoreText: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF', // White text
    fontWeight: 'bold',
    // No background color
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 140,
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong black shadow
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  livesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  livesText: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: '#FFFFFF', // White text
    fontWeight: 'bold',
    // No background color
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 140,
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.8)', // Strong black shadow
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
    marginBottom: 12, // Reduced from 40 to fit high score
    textAlign: 'center',
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
    marginBottom: 30,
    marginTop: 4,
    opacity: 0.8,
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

import { Canvas, Group, Image, Rect, useImage } from '@shopify/react-native-skia';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/Colors';
import { GAME_CONFIG, GameAssets, GameState } from '@/features/games/hammockJump/engine/HammockJumpEngine';
import { K_ANIMATION_FRAMES } from '@/features/games/hammockJump/sprites';
import { NOPOGOD_GAME_ASSETS } from '@/features/games/noPogod/utils/assets';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLATFORM_COLORS: Record<string, { base: string; alpha?: number }> = {
  normal: { base: "rgba(120,120,120,", alpha: 0.9 }, // normal - gray
  moving: { base: "rgba(80,80,180,", alpha: 0.9 }, // moving - blue-gray
  breakable: { base: "rgba(139,69,19,", alpha: 0.9 }, // breakable - brown
  spring: { base: "rgba(255,215,0,", alpha: 0.95 }, // spring - gold (unused)
  bouncy: { base: "rgba(255,20,147,", alpha: 0.9 }, // bouncy - BRIGHTER deep pink
  ice: { base: "rgba(0,191,255,", alpha: 0.9 }, // ice - BRIGHTER deep sky blue
  conveyor: { base: "rgba(128,128,128,", alpha: 0.9 }, // conveyor - gray
  disappearing: { base: "rgba(147,112,219,", alpha: 0.9 }, // disappearing - medium purple
  crumbling: { base: "rgba(105,105,105,", alpha: 0.9 }, // crumbling - dim gray
};
const DEFAULT_PLATFORM_COLOR = PLATFORM_COLORS.normal;

// Memoized Game UI Overlay - Updates only when specific gameplay values change
const GameUI = memo(({
  score,
  combo,
  onPause,
}: {
  score: number;
  combo: number;
  onPause: () => void;
}) => {
  return (
    <>
      <View style={styles.gameUI} pointerEvents="box-none">
        {/* Score - fixed position */}
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreText}>Score: {score}</Text>
        </View>

        {/* Combo indicator */}
        <View style={styles.indicatorsContainer}>
          {combo >= 3 && (
            <View style={styles.comboContainer}>
              <Text style={styles.comboText}>Combo x{combo}!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Pause button - bottom right corner */}
      <Pressable style={styles.pauseButtonContainer} onPress={onPause}>
        <Text style={styles.pauseButtonText}>⏸️</Text>
      </Pressable>
    </>
  );
});

interface GameCanvasProps {
  gameState: GameState;
  assets: GameAssets;
  onStartGame: () => void;
  onExitGame: () => void;
  onPauseGame: () => void;
  onResumeGame?: () => void;
  onUpdate: (currentTime: number) => void;
  onKAnimationStart?: () => void; // Called when K animation starts - freezes player
  onKAnimationComplete?: () => void; // Called when K animation finishes - triggers game over with +200 bonus
  hasAccelerometer?: boolean;
  gameEngine?: any; // Pass game engine for fallback controls
  highScore?: number;
  isNewHighScore?: boolean;
  xpEarned?: number;
}

export const GameCanvas = React.memo(({
  gameState,
  assets,
  onStartGame,
  onExitGame,
  onPauseGame,
  onResumeGame,
  onUpdate,
  onKAnimationStart,
  onKAnimationComplete,
  hasAccelerometer = true,
  gameEngine,
  highScore = 0,
  isNewHighScore = false,
  xpEarned = 0,
}: GameCanvasProps) => {
  // Load Skia images
  const backgroundImage = useImage(assets.background || null);
  const playerImage = useImage(assets.player || null);

  // Load item images
  const eggImage = useImage(NOPOGOD_GAME_ASSETS.items.egg);
  const tomatoImage = useImage(NOPOGOD_GAME_ASSETS.items.tomato);
  const pepperImage = useImage(NOPOGOD_GAME_ASSETS.items.pepper);

  // Load K animation frames as Skia images
  const kFrame1 = useImage(K_ANIMATION_FRAMES[0]);
  const kFrame2 = useImage(K_ANIMATION_FRAMES[1]);
  const kFrame3 = useImage(K_ANIMATION_FRAMES[2]);
  const kFrame4 = useImage(K_ANIMATION_FRAMES[3]);
  const kFrame5 = useImage(K_ANIMATION_FRAMES[4]);
  const kFrame6 = useImage(K_ANIMATION_FRAMES[5]);
  const kFrame7 = useImage(K_ANIMATION_FRAMES[6]);
  const kFrames = useMemo(
    () => [kFrame1, kFrame2, kFrame3, kFrame4, kFrame5, kFrame6, kFrame7],
    [kFrame1, kFrame2, kFrame3, kFrame4, kFrame5, kFrame6, kFrame7]
  );

  // Game loop using requestAnimationFrame
  const animationFrameRef = useRef<number | undefined>(undefined);

  // K animation state
  const [isKAnimationPlaying, setIsKAnimationPlaying] = useState(false);
  const [kAnimationFrame, setKAnimationFrame] = useState(0);
  const [kAnimationPosition, setKAnimationPosition] = useState<{ x: number; y: number } | null>(null);
  const kAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // K animation effect
  useEffect(() => {
    if (isKAnimationPlaying) {
      setKAnimationFrame(0);
      let frame = 0;

      kAnimationRef.current = setInterval(() => {
        frame++;
        if (frame >= 7) {
          // Animation complete
          if (kAnimationRef.current) {
            clearInterval(kAnimationRef.current);
            kAnimationRef.current = null;
          }
          setIsKAnimationPlaying(false);
          setKAnimationFrame(0);
          setKAnimationPosition(null);
          // Trigger game over with +200 bonus
          onKAnimationComplete?.();
        } else {
          setKAnimationFrame(frame);
        }
      }, 180); // 180ms per frame (slower animation)
    }

    return () => {
      if (kAnimationRef.current) {
        clearInterval(kAnimationRef.current);
        kAnimationRef.current = null;
      }
    };
  }, [isKAnimationPlaying, onKAnimationComplete]);

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
    if (onResumeGame) {
      onResumeGame();
    } else if (gameEngine) {
      // Fallback to direct engine call if no callback provided
      gameEngine.resumeGame();
      onUpdate(performance.now());
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

        {xpEarned > 0 && (
          <Text style={styles.xpEarned}>+{xpEarned} XP მიღებულია! ⭐</Text>
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

                const platformColor = PLATFORM_COLORS[p.type] ?? DEFAULT_PLATFORM_COLOR;
                let baseColor = platformColor.base;
                let alpha = platformColor.alpha ?? 0.9;

                if (p.type === 'spring') {
                  baseColor = p.springUsed ? "rgba(100,100,100," : baseColor; // spring - gray when used
                  alpha = p.springUsed ? 0.6 : alpha;
                }

                if (p.type === 'disappearing') {
                  // Use platform's opacity if set (fading effect)
                  alpha = p.opacity !== undefined ? p.opacity : alpha;
                }

                const color = `${baseColor}${alpha})`;

                // Calculate position with shake offset for crumbling platforms
                const xPos = p.x + (p.shakeOffset || 0);

                return (
                  <Rect key={p.id} x={xPos} y={p.y} width={p.width} height={p.height} color={color} />
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

          {/* Player - show animation frames when K animation is playing */}
          {(gameState.phase === 'PLAYING' || gameState.phase === 'PAUSED') && (
            isKAnimationPlaying && kFrames[kAnimationFrame] && kAnimationPosition ? (
              <Image
                image={kFrames[kAnimationFrame]}
                x={kAnimationPosition.x}
                y={kAnimationPosition.y}
                width={spriteSize}
                height={spriteSize}
                fit="contain"
              />
            ) : playerImage && !isKAnimationPlaying && (
              <Image
                image={playerImage}
                x={gameState.player.x + (gameState.screenShake > 0 ? (Math.random() - 0.5) * gameState.screenShake : 0)}
                y={gameState.player.y + (gameState.screenShake > 0 ? (Math.random() - 0.5) * gameState.screenShake : 0)}
                width={spriteSize}
                height={spriteSize}
                fit="contain"
              />
            )
          )}
        </Canvas>

        {/* Overlay UI */}
        {gameState.phase === 'MENU' && renderMenuState()}
        {gameState.phase === 'PLAYING' && (
          <GameUI
            score={gameState.score}
            combo={gameState.combo}
            onPause={onPauseGame}
          />
        )}
        {gameState.phase === 'PAUSED' && renderPausedState()}
        {gameState.phase === 'GAME_OVER' && renderGameOverState()}

        {/* K Animation Button - hidden for now, kept for future use */}
        {false && gameState.phase === 'PLAYING' && !isKAnimationPlaying && (
          <Pressable
            style={styles.kAnimationButton}
            onPress={() => {
              // Find the nearest platform below or at player's position
              const playerBottom = gameState.player.y + spriteSize;

              // Find platforms below or at player's feet
              const nearbyPlatforms = gameState.platforms
                .filter(p => !p.broken && p.y >= playerBottom - 20) // Platform at or below player
                .sort((a, b) => a.y - b.y); // Sort by closest first

              let animX = gameState.player.x;
              let animY = gameState.player.y;

              if (nearbyPlatforms.length > 0) {
                // Use the closest platform below
                const platform = nearbyPlatforms[0];
                // Center animation on platform, positioned on top of it
                animX = platform.x + (platform.width - spriteSize) / 2;
                animY = platform.y - spriteSize;
              }

              // Store position for animation
              setKAnimationPosition({ x: animX, y: animY });

              // Notify parent to freeze player, then start animation
              onKAnimationStart?.();
              setIsKAnimationPlaying(true);
            }}
          >
            <Text style={styles.kAnimationButtonText}>K</Text>
          </Pressable>
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
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
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
  comboContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  comboText: {
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
  pauseButtonContainer: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
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
  xpEarned: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    marginBottom: 30,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  gameOverButtons: {
    gap: 30, // Increased gap for better spacing
  },
  kAnimationButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: 'rgba(196, 255, 0, 0.9)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  kAnimationButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.dark.background,
  },
});

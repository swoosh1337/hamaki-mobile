/**
 * No Pogodi Game Canvas Component
 * Handles Skia-based rendering of the game with proper image loading and sprite management
 * UI overlays are rendered using React Native components
 */

import {
  Canvas,
  Image,
  Line,
  Rect,
  SkImage,
  useImage,
  vec
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { NoPogodGameState } from '@/features/games/noPogod';
import { NOPOGOD_GAME_ASSETS } from '@/features/games/noPogod/utils/assets';
import { ResponsiveScalingManager } from '@/features/games/noPogod/utils/responsiveScaling';
import { NoPogodSpriteRenderer } from '@/features/games/noPogod/utils/spriteRenderer';
import { createLogger } from '@/utils/logger';

const log = createLogger('NoPogodCanvas');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NoPogodGameCanvasProps {
  gameState: NoPogodGameState;
  spriteRenderer: NoPogodSpriteRenderer;
  responsiveScaling?: ResponsiveScalingManager;
}

export const NoPogodGameCanvas: React.FC<NoPogodGameCanvasProps> = ({
  gameState,
  spriteRenderer,
  responsiveScaling,
}) => {
  // Initialize responsive scaling if not provided
  const scaling = responsiveScaling || new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);
  const scalingConfig = scaling.getScalingConfig();
  const responsiveSizes = scaling.getSizes();

  // Load all game images using useImage hook
  const backgroundImage = useImage(NOPOGOD_GAME_ASSETS.background);

  // Miro sprites
  const miroIdleImage = useImage(NOPOGOD_GAME_ASSETS.miro.idle);
  const miroStep1Image = useImage(NOPOGOD_GAME_ASSETS.miro.step1);
  const miroStep2Image = useImage(NOPOGOD_GAME_ASSETS.miro.step2);
  const miroAngle45Image = useImage(NOPOGOD_GAME_ASSETS.miro.angle45);
  const miroAngle90Image = useImage(NOPOGOD_GAME_ASSETS.miro.angle90);

  // Shonzika sprites
  const shonzikaIdleImage = useImage(NOPOGOD_GAME_ASSETS.shonzika.idle);
  const shonzikaIdle90Image = useImage(NOPOGOD_GAME_ASSETS.shonzika.angle90);
  const shonzikaWalk1Image = useImage(NOPOGOD_GAME_ASSETS.shonzika.walking1);
  const shonzikaWalk2Image = useImage(NOPOGOD_GAME_ASSETS.shonzika.walking2);
  const shonzikaHandProfileImage = useImage(NOPOGOD_GAME_ASSETS.shonzika.handProfile);
  const shonzikaHand45Image = useImage(NOPOGOD_GAME_ASSETS.shonzika.hand45);
  const shonzikaHand90Image = useImage(NOPOGOD_GAME_ASSETS.shonzika.hand90);

  // Item sprites
  const eggImage = useImage(NOPOGOD_GAME_ASSETS.items.egg);
  const tomatoImage = useImage(NOPOGOD_GAME_ASSETS.items.tomato);
  const pepperImage = useImage(NOPOGOD_GAME_ASSETS.items.pepper);
  const electricShockImage = useImage(NOPOGOD_GAME_ASSETS.items.electricShock);
  const bombImage = useImage(NOPOGOD_GAME_ASSETS.items.bomb);

  // Check if all critical images are loaded
  const allImagesLoaded = !!(
    backgroundImage &&
    miroIdleImage &&
    miroStep1Image &&
    miroStep2Image &&
    miroAngle90Image &&
    shonzikaIdleImage &&
    shonzikaIdle90Image &&
    shonzikaWalk1Image &&
    shonzikaWalk2Image &&
    shonzikaHandProfileImage &&
    eggImage &&
    tomatoImage &&
    pepperImage
  );

  if (!allImagesLoaded) {
    log.debug('Assets Loading Status', {
      bg: !!backgroundImage,
      miroIdle: !!miroIdleImage,
      miroStep1: !!miroStep1Image,
      miroStep2: !!miroStep2Image,
      miro90: !!miroAngle90Image,
      shonIdle: !!shonzikaIdleImage,
      shon90: !!shonzikaIdle90Image,
      shonW1: !!shonzikaWalk1Image,
      shonW2: !!shonzikaWalk2Image,
      shonHand: !!shonzikaHandProfileImage,
      egg: !!eggImage,
      tomato: !!tomatoImage,
      pepper: !!pepperImage
    });
  }

  // Get current Miro sprite based on state and animation
  const getCurrentMiroImage = () => {
    if (gameState.player.isMoving) {
      // Alternate between step sprites based on animation progress
      return gameState.player.animationProgress < 0.5 ? miroStep1Image : miroStep2Image;
    }
    return miroIdleImage;
  };

  // Get current Shonzika sprite based on state
  const getCurrentShonzikaImage = () => {
    if (gameState.shonzika.sprite === 'THROWING') {
      // Use hand profile for throwing animation
      return shonzikaHandProfileImage;
    }
    return shonzikaIdle90Image;
  };

  // Get item image based on type
  const getItemImage = (itemType: string) => {
    switch (itemType) {
      case 'EGG': return eggImage;
      case 'TOMATO': return tomatoImage;
      case 'PEPPER': return pepperImage;
      case 'ELECTRIC_SHOCK': return electricShockImage;
      case 'BOMB': return bombImage;
      default: return eggImage;
    }
  };

  // Calculate sprite positions and sizes using the sprite renderer with responsive scaling
  const renderData = useMemo(() => {
    if (!spriteRenderer) {
      // Return default render data when sprite renderer is not available
      const positions = scaling.getPositions();
      return {
        background: { sprite: null, x: 0, y: 0, width: scalingConfig.screenWidth, height: scalingConfig.screenHeight },
        miro: {
          sprite: null,
          x: positions.playerPositions.center,
          y: positions.miroGroundY,
          width: responsiveSizes.characterSize,
          height: responsiveSizes.characterSize
        },
        shonzika: {
          sprite: null,
          x: positions.playerPositions.center,
          y: positions.shonzikaY,
          width: responsiveSizes.characterSize,
          height: responsiveSizes.characterSize
        },
        items: [],
      };
    }

    return spriteRenderer.getAllSprites(gameState);
  }, [gameState, spriteRenderer, scaling, scalingConfig, responsiveSizes]);

  // Render background with responsive scaling
  const renderBackground = () => {
    if (!backgroundImage) {
      log.warn('Background image not loaded');
      return null; // Don't render if image not loaded
    }

    return (
      <Image
        image={backgroundImage}
        x={0}
        y={0}
        width={scalingConfig.screenWidth}
        height={scalingConfig.screenHeight}
        fit="cover"
      />
    );
  };

  // Render Miro character
  const renderMiro = () => {
    const miroSprite = renderData.miro;

    // Calculate actual sprite bounds on screen
    const spriteLeft = miroSprite.x;
    const spriteRight = miroSprite.x + miroSprite.width;
    const spriteTop = miroSprite.y;
    const spriteBottom = miroSprite.y + miroSprite.height;
    const isOnScreen = spriteRight >= 0 && spriteLeft <= scalingConfig.screenWidth &&
      spriteBottom >= 0 && spriteTop <= scalingConfig.screenHeight;

    log.debug('🎨 RENDER Miro:', {
      isMoving: gameState.player.isMoving,
      position: gameState.player.position,
      centerX: gameState.player.x,
      centerY: gameState.player.y,
      renderX: miroSprite.x,
      renderY: miroSprite.y,
      width: miroSprite.width,
      height: miroSprite.height,
      spriteLeft,
      spriteRight,
      screenWidth: scalingConfig.screenWidth,
      screenHeight: scalingConfig.screenHeight,
      isOnScreen,
      fullyOnScreen: spriteLeft >= 0 && spriteRight <= scalingConfig.screenWidth,
    });

    // Determine which sprite to use based on player state
    let miroImage;
    if (gameState.player.isMoving) {
      // Alternate between step sprites for smooth left-right stepping
      // 0.0 - 0.5: step1 (left leg forward)
      // 0.5 - 1.0: step2 (right leg forward)
      miroImage = gameState.player.animationProgress < 0.5 ? miroStep1Image : miroStep2Image;
    } else {
      // Use idle sprite (90 degree angle sprite) - this is the correct idle pose
      miroImage = miroAngle90Image;
    }

    if (!miroImage) {
      log.warn('Miro image not loaded');
      return null; // Don't render anything if image not loaded
    }

    // Determine if we need to flip horizontally (for left movement)
    // In continuous movement, flip when position is LEFT (moving or stopped on left side)
    const shouldFlip = gameState.player.position === 'LEFT';

    log.debug('🎨 RENDERING MIRO IMAGE', {
      x: miroSprite.x,
      y: miroSprite.y,
      flipped: shouldFlip,
      position: gameState.player.position,
      width: miroSprite.width
    });

    // When flipping, use origin to specify the center point of the flip
    // This ensures the sprite flips in place around its center
    const transforms = shouldFlip ? [{ scaleX: -1 }] : undefined;
    const origin = shouldFlip
      ? { x: miroSprite.x + miroSprite.width / 2, y: miroSprite.y + miroSprite.height / 2 }
      : undefined;

    return (
      <Image
        image={miroImage}
        x={miroSprite.x}
        y={miroSprite.y}
        width={miroSprite.width}
        height={miroSprite.height}
        fit="contain"
        transform={transforms}
        origin={origin}
      />
    );
  };

  // Render horizontal tightrope for Shonzika
  const renderRope = () => {
    const shonzikaSprite = renderData.shonzika;

    // Horizontal tightrope at Shonzika's feet level
    const ropeY = shonzikaSprite.y + shonzikaSprite.height; // At bottom of character (feet level)
    const ropeStartX = 0; // Starts at left edge
    const ropeEndX = scalingConfig.screenWidth; // Ends at right edge

    // Support posts on left and right sides
    const postWidth = 6;
    const postHeight = 40;
    const postTopY = ropeY - postHeight;

    // Left post
    const leftPostX = 20;

    // Right post
    const rightPostX = scalingConfig.screenWidth - 20 - postWidth;

    return (
      <>
        {/* Left support post */}
        <Rect
          x={leftPostX}
          y={postTopY}
          width={postWidth}
          height={postHeight}
          color="#654321"
        />

        {/* Right support post */}
        <Rect
          x={rightPostX}
          y={postTopY}
          width={postWidth}
          height={postHeight}
          color="#654321"
        />

        {/* Horizontal tightrope */}
        <Line
          p1={vec(leftPostX + postWidth / 2, ropeY)}
          p2={vec(rightPostX + postWidth / 2, ropeY)}
          color="#8B4513"
          style="stroke"
          strokeWidth={4}
        />

        {/* Small rope highlights for 3D effect */}
        <Line
          p1={vec(leftPostX + postWidth / 2, ropeY + 1)}
          p2={vec(rightPostX + postWidth / 2, ropeY + 1)}
          color="#A0826D"
          style="stroke"
          strokeWidth={1}
          opacity={0.5}
        />
      </>
    );
  };

  // Render Shonzika character
  const renderShonzika = () => {
    const shonzikaSprite = renderData.shonzika;

    log.debug('🎨 RENDER Shonzika:', {
      sprite: gameState.shonzika.sprite,
      position: gameState.shonzika.position,
      isMoving: gameState.shonzika.isMoving,
      x: shonzikaSprite.x,
      y: shonzikaSprite.y,
      width: shonzikaSprite.width,
      height: shonzikaSprite.height,
    });

    // Determine which sprite to use based on Shonzika's state
    let bodyImage;
    let showHand = false;

    if (gameState.shonzika.sprite === 'THROWING') {
      // Show 90-degree stance while preparing/doing the throw
      bodyImage = shonzikaIdle90Image;
      showHand = false; // no hand overlay for this test look
    } else if (gameState.shonzika.sprite === 'WALKING' || gameState.shonzika.isMoving) {
      // Walking cycle: step1 ↔ step2 only (no profile idle)
      bodyImage = gameState.shonzika.animationProgress < 0.5 ? shonzikaWalk1Image : shonzikaWalk2Image;
    } else {
      // When idle, use the 90-degree idle sprite
      bodyImage = shonzikaIdle90Image;
    }

    if (!bodyImage) {
      log.warn('Shonzika image not loaded');
      return null; // Don't render anything if image not loaded
    }

    // Determine if we need to flip horizontally
    // Match Miro logic: face left when moving/position is LEFT
    const shouldFlip = gameState.shonzika.position === 'LEFT';

    log.debug('🎨 Shonzika flip:', {
      shouldFlip,
      targetX: gameState.shonzika.targetX,
      currentX: gameState.shonzika.x
    });

    // Use origin for proper flip point
    const transforms = shouldFlip ? [{ scaleX: -1 }] : undefined;
    const origin = shouldFlip
      ? { x: shonzikaSprite.x + shonzikaSprite.width / 2, y: shonzikaSprite.y + shonzikaSprite.height / 2 }
      : undefined;

    return (
      <>
        {/* Body sprite */}
        <Image
          image={bodyImage}
          x={shonzikaSprite.x}
          y={shonzikaSprite.y}
          width={shonzikaSprite.width}
          height={shonzikaSprite.height}
          fit="contain"
          transform={transforms}
          origin={origin}
        />

        {/* Hand overlay when throwing */}
        {showHand && shonzikaHandProfileImage && (
          <Image
            image={shonzikaHandProfileImage}
            x={shonzikaSprite.x}
            y={shonzikaSprite.y}
            width={shonzikaSprite.width}
            height={shonzikaSprite.height}
            fit="contain"
            transform={transforms}
            origin={origin}
            opacity={0.9}
          />
        )}
      </>
    );
  };

  // Render falling items
  const renderItems = () => {
    return renderData.items.map((itemSprite, index) => {
      const item = gameState.items[index];
      if (!item) return null;

      const itemImage = getItemImage(item.type);

      if (!itemImage) {
        // Don't render if image not loaded
        log.warn('Item image not loaded', { type: item.type });
        return null;
      }

      return (
        <Image
          key={item.id}
          image={itemImage}
          x={itemSprite.x}
          y={itemSprite.y}
          width={itemSprite.width}
          height={itemSprite.height}
          fit="contain"
          transform={itemSprite.rotation ? [{ rotate: itemSprite.rotation * (Math.PI / 180) }] : undefined}
        />
      );
    });
  };

  // Get fallback color for items when images fail to load
  const getItemFallbackColor = (itemType: string): string => {
    switch (itemType) {
      case 'EGG': return '#FFFF99'; // Light yellow
      case 'TOMATO': return '#FF6B6B'; // Red
      case 'PEPPER': return '#4ECDC4'; // Teal
      case 'ELECTRIC_SHOCK': return '#FFD93D'; // Yellow
      case 'BOMB': return '#2C2C2C'; // Dark gray
      default: return '#FFFF99';
    }
  };

  // Show loading screen while images are loading
  if (!allImagesLoaded) {
    log.debug('Loading game assets...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.loadingText}>Loading Game...</Text>
        <Text style={styles.loadingSubtext}>Preparing assets</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        {/* Background */}
        {renderBackground()}





        {/* Rope/pulley system for Shonzika */}
        {renderRope()}

        {/* Characters - render directly, not in Group */}
        {renderShonzika()}
        {renderMiro()}

        {/* Falling items */}
        {renderItems()}
      </Canvas>
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  canvas: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    gap: 16,
  },
  loadingText: {
    fontSize: 24,
    fontFamily: 'hamaki-eng',
    color: Colors.dark.tint,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    opacity: 0.7,
  },
});

// Helper function to check if all required images are loaded
export const areImagesLoaded = (...images: Array<SkImage | null>): boolean => {
  return images.every(image => image !== null);
};

// Export sprite mapping for external use
export const SPRITE_MAPPING = {
  miro: {
    idle: NOPOGOD_GAME_ASSETS.miro.idle,
    step1: NOPOGOD_GAME_ASSETS.miro.step1,
    step2: NOPOGOD_GAME_ASSETS.miro.step2,
    angle45: NOPOGOD_GAME_ASSETS.miro.angle45,
    angle90: NOPOGOD_GAME_ASSETS.miro.angle90,
  },
  shonzika: {
    idle: NOPOGOD_GAME_ASSETS.shonzika.idle,
    idle90: NOPOGOD_GAME_ASSETS.shonzika.angle90,
    walking1: NOPOGOD_GAME_ASSETS.shonzika.walking1,
    walking2: NOPOGOD_GAME_ASSETS.shonzika.walking2,
    handProfile: NOPOGOD_GAME_ASSETS.shonzika.handProfile,
    hand45: NOPOGOD_GAME_ASSETS.shonzika.hand45,
    hand90: NOPOGOD_GAME_ASSETS.shonzika.hand90,
  },
  items: {
    egg: NOPOGOD_GAME_ASSETS.items.egg,
    tomato: NOPOGOD_GAME_ASSETS.items.tomato,
    pepper: NOPOGOD_GAME_ASSETS.items.pepper,
    electricShock: NOPOGOD_GAME_ASSETS.items.electricShock,
    bomb: NOPOGOD_GAME_ASSETS.items.bomb,
  },
};

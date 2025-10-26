/**
 * No Pogodi Game Canvas Component
 * Handles Skia-based rendering of the game with proper image loading and sprite management
 * UI overlays are rendered using React Native components
 */

import {
  Canvas,
  Circle,
  Image,
  Line,
  Rect,
  useImage,
  vec
} from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { NoPogodGameState } from '@/utils/noPogodGameEngine';
import { ResponsiveScalingManager } from '@/utils/noPogodResponsiveScaling';
import { NoPogodSpriteRenderer } from '@/utils/noPogodSpriteRenderer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NoPogodGameCanvasProps {
  gameState: NoPogodGameState;
  spriteRenderer: NoPogodSpriteRenderer;
  miroSprite?: any;
  shonzikaSprite?: any;
  responsiveScaling?: ResponsiveScalingManager;
}

export const NoPogodGameCanvas: React.FC<NoPogodGameCanvasProps> = ({
  gameState,
  spriteRenderer,
  miroSprite,
  shonzikaSprite,
  responsiveScaling,
}) => {
  // Initialize responsive scaling if not provided
  const scaling = responsiveScaling || new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);
  const scalingConfig = scaling.getScalingConfig();
  const responsiveSizes = scaling.getSizes();
  
  // Load all game images using useImage hook
  const backgroundImage = useImage(require('@/assets/images/game/bg.png'));
  
  // Miro sprites
  const miroIdleImage = useImage(require('@/assets/images/game/miro/პროფილი დგომა.png'));
  const miroStep1Image = useImage(require('@/assets/images/game/miro/ნაბიჯი 1.png'));
  const miroStep2Image = useImage(require('@/assets/images/game/miro/ნაბიჯი 2.png'));
  const miroAngle45Image = useImage(require('@/assets/images/game/miro/დგომა 45 გრადუსი.png'));
  const miroAngle90Image = useImage(require('@/assets/images/game/miro/დგომა 90 გრადუსი.png'));
  
  // Shonzika sprites
  const shonzikaIdleImage = useImage(require('@/assets/images/game/shonzika/დგომა პროფილი.png'));
  const shonzikaIdle90Image = useImage(require('@/assets/images/game/shonzika/დგომა 90 გრადუსი.png'));
  const shonzikaWalk1Image = useImage(require('@/assets/images/game/shonzika/სიარული 1.png'));
  const shonzikaWalk2Image = useImage(require('@/assets/images/game/shonzika/სიარული 2~.png'));
  const shonzikaHandProfileImage = useImage(require('@/assets/images/game/shonzika/ხელი პროფილი.png'));
  const shonzikaHand45Image = useImage(require('@/assets/images/game/shonzika/ხელი 45 აგრადუსი.png'));
  const shonzikaHand90Image = useImage(require('@/assets/images/game/shonzika/ხელი 90 გრადუსი.png'));
  
  // Item sprites
  const eggImage = useImage(require('@/assets/images/game/items/კვერცხი.png'));
  const tomatoImage = useImage(require('@/assets/images/game/items/პომიდორი.png'));
  const pepperImage = useImage(require('@/assets/images/game/items/წიწაკა.png'));
  const electricShockImage = useImage(require('@/assets/images/game/items/ელექტროშოკი.png'));
  const bombImage = useImage(require('@/assets/images/game/items/ბომბი.png'));

  // Check if all critical images are loaded
  const allImagesLoaded = !!(
    backgroundImage &&
    miroIdleImage &&
    miroStep1Image &&
    miroStep2Image &&
    miroAngle90Image &&
    shonzikaIdleImage &&
    shonzikaWalk1Image &&
    shonzikaWalk2Image &&
    shonzikaHandProfileImage &&
    eggImage &&
    tomatoImage &&
    pepperImage
  );

  // Get current Miro sprite based on state and animation
  const getCurrentMiroImage = () => {
    if (miroSprite) return miroSprite;
    
    if (gameState.player.isMoving) {
      // Alternate between step sprites based on animation progress
      const sprite = gameState.player.animationProgress < 0.5 ? miroStep1Image : miroStep2Image;
      console.log('Miro moving sprite:', sprite ? 'loaded' : 'null');
      return sprite;
    }
    console.log('Miro idle sprite:', miroIdleImage ? 'loaded' : 'null');
    return miroIdleImage;
  };

  // Get current Shonzika sprite based on state
  const getCurrentShonzikaImage = () => {
    if (shonzikaSprite) return shonzikaSprite;
    
    if (gameState.shonzika.sprite === 'THROWING') {
      // Use hand profile for throwing animation
      console.log('Shonzika throwing sprite:', shonzikaHandProfileImage ? 'loaded' : 'null');
      return shonzikaHandProfileImage;
    }
    console.log('Shonzika idle sprite:', shonzikaIdleImage ? 'loaded' : 'null');
    return shonzikaIdleImage;
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
    
    const currentMiroSprite = getCurrentMiroImage();
    const currentShonzikaSprite = getCurrentShonzikaImage();
    
    return spriteRenderer.getAllSprites(gameState, currentMiroSprite, currentShonzikaSprite);
  }, [gameState, spriteRenderer, scaling, scalingConfig, responsiveSizes, getCurrentMiroImage(), getCurrentShonzikaImage()]);

  // Render background with responsive scaling
  const renderBackground = () => {
    if (!backgroundImage) {
      console.log('🎨 ⚠️ BACKGROUND IMAGE NOT LOADED');
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

    console.log('🎨 RENDER Miro:', {
      isMoving: gameState.player.isMoving,
      position: gameState.player.position,
      centerX: gameState.player.x,
      centerY: gameState.player.y,
      renderX: miroSprite.x,
      renderY: miroSprite.y,
      width: miroSprite.width,
      height: miroSprite.height,
      spriteLeft: spriteLeft,
      spriteRight: spriteRight,
      screenWidth: scalingConfig.screenWidth,
      screenHeight: scalingConfig.screenHeight,
      isOnScreen: isOnScreen,
      fullyOnScreen: spriteLeft >= 0 && spriteRight <= scalingConfig.screenWidth,
    });

    // Determine which sprite to use based on player state
    let miroImage;
    if (gameState.player.isMoving) {
      // Alternate between step sprites for smooth left-right stepping
      // 0.0 - 0.5: step1 (left leg forward)
      // 0.5 - 1.0: step2 (right leg forward)
      miroImage = gameState.player.animationProgress < 0.5 ? miroStep1Image : miroStep2Image;
      console.log('🎨 Miro walking - progress:', gameState.player.animationProgress.toFixed(2), 'sprite:', gameState.player.animationProgress < 0.5 ? 'step1' : 'step2');
    } else {
      // Use idle sprite (90 degree angle sprite) - this is the correct idle pose
      miroImage = miroAngle90Image;
      console.log('🎨 Miro idle sprite. Image loaded?', miroImage ? 'YES' : 'NO');
    }

    if (!miroImage) {
      console.log('🎨 ⚠️ MIRO IMAGE NOT LOADED');
      return null; // Don't render anything if image not loaded
    }

    // Determine if we need to flip horizontally (for left movement)
    // In continuous movement, flip when position is LEFT (moving or stopped on left side)
    const shouldFlip = gameState.player.position === 'LEFT';

    console.log('🎨 RENDERING MIRO IMAGE at x:', miroSprite.x, 'y:', miroSprite.y, 'flipped?', shouldFlip, 'position:', gameState.player.position, 'width:', miroSprite.width);

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

    console.log('🎨 RENDER Shonzika:', {
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
      // When throwing, show BOTH body AND extended hand
      bodyImage = shonzikaIdleImage;  // Use idle body
      showHand = true;  // Overlay hand sprite
    } else if (gameState.shonzika.sprite === 'WALKING' || gameState.shonzika.isMoving) {
      // When walking, alternate between walking sprites for smooth left-right stepping
      // Use animation progress (0.0 to 1.0) to create smooth stepping cycle
      // 0.0 - 0.5: step1 (left leg forward)
      // 0.5 - 1.0: step2 (right leg forward)
      bodyImage = gameState.shonzika.animationProgress < 0.5 ? shonzikaWalk1Image : shonzikaWalk2Image;
      console.log('🎨 Shonzika walking - progress:', gameState.shonzika.animationProgress.toFixed(2), 'sprite:', gameState.shonzika.animationProgress < 0.5 ? 'walk1' : 'walk2');
    } else {
      // When idle, use the profile idle sprite
      bodyImage = shonzikaIdleImage;
    }

    if (!bodyImage) {
      console.log('🎨 ⚠️ SHONZIKA IMAGE NOT LOADED');
      return null; // Don't render anything if image not loaded
    }

    // Determine if we need to flip horizontally
    // Flip when moving LEFT (so character faces left)
    const shouldFlip = gameState.shonzika.isMoving && gameState.shonzika.targetX < gameState.shonzika.x;

    console.log('🎨 Shonzika flip:', shouldFlip, 'targetX:', gameState.shonzika.targetX, 'currentX:', gameState.shonzika.x);

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
        console.log('🎨 ⚠️ ITEM IMAGE NOT LOADED:', item.type);
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
    console.log('🎨 ⚠️ Loading game assets...');
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
export const areImagesLoaded = (...images: (any | null)[]): boolean => {
  return images.every(image => image !== null);
};

// Export sprite mapping for external use
export const SPRITE_MAPPING = {
  miro: {
    idle: require('@/assets/images/game/miro/პროფილი დგომა.png'),
    step1: require('@/assets/images/game/miro/ნაბიჯი 1.png'),
    step2: require('@/assets/images/game/miro/ნაბიჯი 2.png'),
    angle45: require('@/assets/images/game/miro/დგომა 45 გრადუსი.png'),
    angle90: require('@/assets/images/game/miro/დგომა 90 გრადუსი.png'),
  },
  shonzika: {
    idle: require('@/assets/images/game/shonzika/დგომა პროფილი.png'),
    idle90: require('@/assets/images/game/shonzika/დგომა 90 გრადუსი.png'),
    walking1: require('@/assets/images/game/shonzika/სიარული 1.png'),
    walking2: require('@/assets/images/game/shonzika/სიარული 2~.png'),
    handProfile: require('@/assets/images/game/shonzika/ხელი პროფილი.png'),
    hand45: require('@/assets/images/game/shonzika/ხელი 45 აგრადუსი.png'),
    hand90: require('@/assets/images/game/shonzika/ხელი 90 გრადუსი.png'),
  },
  items: {
    egg: require('@/assets/images/game/items/კვერცხი.png'),
    tomato: require('@/assets/images/game/items/პომიდორი.png'),
    pepper: require('@/assets/images/game/items/წიწაკა.png'),
    electricShock: require('@/assets/images/game/items/ელექტროშოკი.png'),
    bomb: require('@/assets/images/game/items/ბომბი.png'),
  },
};

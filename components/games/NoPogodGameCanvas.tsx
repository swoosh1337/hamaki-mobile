/**
 * No Pogodi Game Canvas Component
 * Handles Skia-based rendering of the game with proper image loading and sprite management
 * UI overlays are rendered using React Native components
 */

import {
  Canvas,
  Group,
  Image,
  Rect,
  useImage
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

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

  // Get current Miro sprite based on state and animation
  const getCurrentMiroImage = () => {
    if (miroSprite) return miroSprite;
    
    if (gameState.player.isMoving) {
      // Alternate between step sprites based on animation progress
      return gameState.player.animationProgress < 0.5 ? miroStep1Image : miroStep2Image;
    }
    return miroIdleImage;
  };

  // Get current Shonzika sprite based on state
  const getCurrentShonzikaImage = () => {
    if (shonzikaSprite) return shonzikaSprite;
    
    if (gameState.shonzika.sprite === 'THROWING') {
      // Use hand profile for throwing animation
      return shonzikaHandProfileImage;
    }
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
      console.log('⚠️ No sprite renderer, using fallback positions:', positions);
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
    
    const sprites = spriteRenderer.getAllSprites(gameState, currentMiroSprite, currentShonzikaSprite);
    console.log('🎮 Sprite render data:', {
      miro: { x: sprites.miro.x, y: sprites.miro.y, width: sprites.miro.width, height: sprites.miro.height },
      shonzika: { x: sprites.shonzika.x, y: sprites.shonzika.y, width: sprites.shonzika.width, height: sprites.shonzika.height },
      itemCount: sprites.items.length,
      screenSize: { width: scalingConfig.screenWidth, height: scalingConfig.screenHeight }
    });
    
    return sprites;
  }, [gameState, spriteRenderer, scaling, scalingConfig, responsiveSizes, getCurrentMiroImage(), getCurrentShonzikaImage()]);

  // Render background with responsive scaling
  const renderBackground = () => {
    if (!backgroundImage) {
      // Fallback to colored background
      return (
        <Rect
          x={0}
          y={0}
          width={scalingConfig.screenWidth}
          height={scalingConfig.screenHeight}
          color="#87CEEB"
        />
      );
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
    const miroImage = getCurrentMiroImage();
    const miroSprite = renderData.miro;

    console.log('🦊 Rendering Miro:', { 
      hasImage: !!miroImage, 
      position: { x: miroSprite.x, y: miroSprite.y }, 
      size: { width: miroSprite.width, height: miroSprite.height },
      isMoving: gameState.player.isMoving
    });

    // Always render fallback if image not loaded, or render image
    if (!miroImage) {
      console.log('⚠️ Miro image not loaded, using fallback rectangle');
      // Fallback to colored rectangle - bright blue for visibility
      return (
        <Rect
          x={miroSprite.x}
          y={miroSprite.y}
          width={miroSprite.width}
          height={miroSprite.height}
          color={gameState.player.isMoving ? "#00FF00" : "#FF00FF"}
        />
      );
    }

    return (
      <Image
        image={miroImage}
        x={miroSprite.x}
        y={miroSprite.y}
        width={miroSprite.width}
        height={miroSprite.height}
        fit="contain"
      />
    );
  };

  // Render Shonzika character
  const renderShonzika = () => {
    const shonzikaImage = getCurrentShonzikaImage();
    const shonzikaSprite = renderData.shonzika;

    console.log('🐺 Rendering Shonzika:', { 
      hasImage: !!shonzikaImage, 
      position: { x: shonzikaSprite.x, y: shonzikaSprite.y }, 
      size: { width: shonzikaSprite.width, height: shonzikaSprite.height },
      isThrowing: gameState.shonzika.sprite === 'THROWING'
    });

    if (!shonzikaImage) {
      console.log('⚠️ Shonzika image not loaded, using fallback rectangle');
      // Fallback to colored rectangle - bright red for visibility
      return (
        <Rect
          x={shonzikaSprite.x}
          y={shonzikaSprite.y}
          width={shonzikaSprite.width}
          height={shonzikaSprite.height}
          color={gameState.shonzika.sprite === 'THROWING' ? "#FFFF00" : "#FF0000"}
        />
      );
    }

    return (
      <Image
        image={shonzikaImage}
        x={shonzikaSprite.x}
        y={shonzikaSprite.y}
        width={shonzikaSprite.width}
        height={shonzikaSprite.height}
        fit="contain"
      />
    );
  };

  // Render falling items
  const renderItems = () => {
    return renderData.items.map((itemSprite, index) => {
      const item = gameState.items[index];
      if (!item) return null;

      const itemImage = getItemImage(item.type);

      if (!itemImage) {
        // Fallback to colored rectangle
        const itemColor = getItemFallbackColor(item.type);
        return (
          <Rect
            key={item.id}
            x={itemSprite.x}
            y={itemSprite.y}
            width={itemSprite.width}
            height={itemSprite.height}
            color={itemColor}
          />
        );
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



  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        {/* Background */}
        {renderBackground()}

        {/* Game elements - always render so characters are visible */}
        <Group>
          {/* Characters */}
          {renderMiro()}
          {renderShonzika()}
          
          {/* Falling items */}
          {renderItems()}
        </Group>
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

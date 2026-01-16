/**
 * No Pogodi Game Responsive Scaling System
 * Handles dynamic scaling and positioning for different screen sizes and orientations
 */

import { Dimensions } from 'react-native';

// Base design dimensions (iPhone 8 as reference)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 667;

// Minimum and maximum scale factors to prevent extreme scaling
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;

export interface ScalingConfig {
  screenWidth: number;
  screenHeight: number;
  scaleX: number;
  scaleY: number;
  uniformScale: number;
  characterScale: number;
  itemScale: number;
  uiScale: number;
  isTablet: boolean;
  isLandscape: boolean;
}

export interface ResponsivePositions {
  miroGroundY: number;
  shonzikaY: number;
  playerPositions: {
    left: number;
    center: number;
    right: number;
  };
  uiPadding: number;
  touchZoneHeight: number;
}

export interface ResponsiveSizes {
  characterSize: number;
  itemSize: number;
  fontSize: {
    title: number;
    score: number;
    ui: number;
    button: number;
  };
  spacing: {
    small: number;
    medium: number;
    large: number;
  };
}

export class ResponsiveScalingManager {
  private config: ScalingConfig;
  private positions: ResponsivePositions;
  private sizes: ResponsiveSizes;

  constructor(screenWidth?: number, screenHeight?: number) {
    const dimensions = screenWidth && screenHeight
      ? { width: screenWidth, height: screenHeight }
      : Dimensions.get('window');

    this.config = this.calculateScalingConfig(dimensions.width, dimensions.height);
    this.positions = this.calculateResponsivePositions();
    this.sizes = this.calculateResponsiveSizes();
  }

  // Calculate scaling configuration based on screen dimensions
  private calculateScalingConfig(screenWidth: number, screenHeight: number): ScalingConfig {
    // Calculate scale factors
    const scaleX = screenWidth / BASE_WIDTH;
    const scaleY = screenHeight / BASE_HEIGHT;

    // Use the smaller scale factor for uniform scaling to maintain aspect ratio
    const uniformScale = Math.min(scaleX, scaleY);

    // Clamp scale factors to prevent extreme scaling
    const clampedScaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX));
    const clampedScaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleY));
    const clampedUniformScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, uniformScale));

    // Determine device type
    const isTablet = screenWidth >= 768 || screenHeight >= 1024;
    const isLandscape = screenWidth > screenHeight;

    // Calculate specific scale factors for different elements
    const characterScale = clampedUniformScale * (isTablet ? 1.2 : 1.0);
    const itemScale = characterScale * 0.75; // Increased from 0.6 for larger items
    const uiScale = clampedUniformScale * (isTablet ? 1.1 : 1.0);

    return {
      screenWidth,
      screenHeight,
      scaleX: clampedScaleX,
      scaleY: clampedScaleY,
      uniformScale: clampedUniformScale,
      characterScale,
      itemScale,
      uiScale,
      isTablet,
      isLandscape,
    };
  }

  // Calculate responsive positions based on screen size
  private calculateResponsivePositions(): ResponsivePositions {
    const { screenWidth, screenHeight, isLandscape } = this.config;

    // Adjust ground level based on screen aspect ratio
    const groundYRatio = isLandscape ? 0.75 : 0.8;
    const shonzikaYRatio = isLandscape ? 0.20 : 0.22;  // Moved up to 22% for better visual with rope

    return {
      miroGroundY: screenHeight * groundYRatio,
      shonzikaY: screenHeight * shonzikaYRatio,
      playerPositions: {
        left: screenWidth * 0.25,
        center: screenWidth * 0.5,
        right: screenWidth * 0.75,
      },
      uiPadding: Math.max(20, screenWidth * 0.05),
      touchZoneHeight: screenHeight,
    };
  }

  // Calculate responsive sizes for all game elements
  private calculateResponsiveSizes(): ResponsiveSizes {
    const { characterScale, itemScale, uiScale, isTablet } = this.config;

    // Base sizes - increased for better visibility
    const baseCharacterSize = 150; // Increased from 80
    const baseItemSize = 80; // Increased from 40

    // Font sizes with tablet adjustments
    const baseFontSizes = {
      title: isTablet ? 56 : 48,
      score: isTablet ? 22 : 18,
      ui: isTablet ? 18 : 16,
      button: isTablet ? 24 : 20,
    };

    // Spacing with scale adjustments
    const baseSpacing = {
      small: 8,
      medium: 16,
      large: 24,
    };

    return {
      characterSize: baseCharacterSize * characterScale,
      itemSize: baseItemSize * itemScale,
      fontSize: {
        title: baseFontSizes.title * uiScale,
        score: baseFontSizes.score * uiScale,
        ui: baseFontSizes.ui * uiScale,
        button: baseFontSizes.button * uiScale,
      },
      spacing: {
        small: baseSpacing.small * uiScale,
        medium: baseSpacing.medium * uiScale,
        large: baseSpacing.large * uiScale,
      },
    };
  }

  // Update scaling for new screen dimensions
  public updateScreenSize(screenWidth: number, screenHeight: number): void {
    this.config = this.calculateScalingConfig(screenWidth, screenHeight);
    this.positions = this.calculateResponsivePositions();
    this.sizes = this.calculateResponsiveSizes();
  }

  // Get current scaling configuration
  public getScalingConfig(): ScalingConfig {
    return { ...this.config };
  }

  // Get responsive positions
  public getPositions(): ResponsivePositions {
    return { ...this.positions };
  }

  // Get responsive sizes
  public getSizes(): ResponsiveSizes {
    return { ...this.sizes };
  }

  // Get touch zones for player movement
  public getTouchZones(): Array<{ x: number; y: number; width: number; height: number; position: 'LEFT' | 'CENTER' | 'RIGHT' }> {
    const zoneWidth = this.config.screenWidth / 3;

    return [
      {
        x: 0,
        y: 0,
        width: zoneWidth,
        height: this.positions.touchZoneHeight,
        position: 'LEFT',
      },
      {
        x: zoneWidth,
        y: 0,
        width: zoneWidth,
        height: this.positions.touchZoneHeight,
        position: 'CENTER',
      },
      {
        x: zoneWidth * 2,
        y: 0,
        width: zoneWidth,
        height: this.positions.touchZoneHeight,
        position: 'RIGHT',
      },
    ];
  }

  // Get UI element positions with responsive scaling
  public getUIPositions(): {
    score: { x: number; y: number };
    lives: { x: number; y: number };
    timer: { x: number; y: number };
    pauseButton: { x: number; y: number; size: number };
  } {
    const { uiPadding } = this.positions;
    const { screenWidth } = this.config;
    const topY = Math.max(50, this.config.screenHeight * 0.08);
    const buttonSize = 44 * this.config.uiScale;

    return {
      score: {
        x: uiPadding,
        y: topY,
      },
      lives: {
        x: uiPadding,
        y: topY + this.sizes.spacing.large,
      },
      timer: {
        x: screenWidth - uiPadding,
        y: topY,
      },
      pauseButton: {
        x: screenWidth - uiPadding - buttonSize,
        y: topY + this.sizes.spacing.large,
        size: buttonSize,
      },
    };
  }

  // Calculate sprite bounds with responsive scaling
  public calculateSpriteBounds(
    centerX: number,
    centerY: number,
    spriteType: 'character' | 'item'
  ): { x: number; y: number; width: number; height: number } {
    const size = spriteType === 'character' ? this.sizes.characterSize : this.sizes.itemSize;

    return {
      x: centerX - size / 2,
      y: centerY - size / 2,
      width: size,
      height: size,
    };
  }

  // Get safe area adjustments for different devices
  public getSafeAreaAdjustments(): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } {
    const { isTablet, screenWidth, screenHeight } = this.config;

    // Estimate safe area based on screen dimensions and device type
    const hasNotch = screenHeight > 800 && screenWidth < 500; // Rough iPhone X+ detection

    return {
      top: hasNotch ? 44 : (isTablet ? 20 : 20),
      bottom: hasNotch ? 34 : (isTablet ? 20 : 0),
      left: 0,
      right: 0,
    };
  }

  // Get optimal animation durations based on device performance
  public getAnimationDurations(): {
    playerMovement: number;
    itemFall: number;
    characterAnimation: number;
    uiTransition: number;
  } {
    const { isTablet } = this.config;

    // Tablets can handle slightly longer animations for smoother experience
    const multiplier = isTablet ? 1.2 : 1.0;

    return {
      playerMovement: 200 * multiplier,
      itemFall: 100 * multiplier,
      characterAnimation: 300 * multiplier,
      uiTransition: 250 * multiplier,
    };
  }

  // Check if current configuration is suitable for gameplay
  public isConfigurationValid(): boolean {
    const { screenWidth, screenHeight } = this.config;

    // Minimum viable screen size
    const minWidth = 320;
    const minHeight = 480;

    return screenWidth >= minWidth && screenHeight >= minHeight;
  }

  // Get debug information for development
  public getDebugInfo(): string {
    const { screenWidth, screenHeight, uniformScale, isTablet, isLandscape } = this.config;
    const { characterSize, itemSize } = this.sizes;

    return `Screen: ${screenWidth}x${screenHeight}, Scale: ${uniformScale.toFixed(2)}, ` +
      `Character: ${characterSize.toFixed(0)}px, Item: ${itemSize.toFixed(0)}px, ` +
      `Tablet: ${isTablet}, Landscape: ${isLandscape}`;
  }
}

// Utility functions for responsive scaling
export const ResponsiveUtils = {
  // Scale a value based on screen size
  scale: (value: number, screenWidth: number, screenHeight: number): number => {
    const scaleX = screenWidth / BASE_WIDTH;
    const scaleY = screenHeight / BASE_HEIGHT;
    const uniformScale = Math.min(scaleX, scaleY);
    return value * Math.max(MIN_SCALE, Math.min(MAX_SCALE, uniformScale));
  },

  // Get responsive font size
  getFontSize: (baseSize: number, screenWidth: number, screenHeight: number): number => {
    return ResponsiveUtils.scale(baseSize, screenWidth, screenHeight);
  },

  // Check if device is tablet
  isTablet: (screenWidth: number, screenHeight: number): boolean => {
    return screenWidth >= 768 || screenHeight >= 1024;
  },

  // Check if device is in landscape mode
  isLandscape: (screenWidth: number, screenHeight: number): boolean => {
    return screenWidth > screenHeight;
  },
};

// Export singleton instance for global use
export const GlobalResponsiveScaling = new ResponsiveScalingManager();
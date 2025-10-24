/**
 * No Pogodi Game Sprite Renderer
 * Handles rendering of game sprites with proper scaling and positioning
 */

import { ImageRequireSource } from 'react-native';
import { NoPogodGameAssets } from './noPogodGameAssets';
import { FallingItem, ItemType, NoPogodGameState, PlayerState, ShonzikaState } from './noPogodGameEngine';

// Sprite rendering configuration
export interface SpriteRenderConfig {
  screenWidth: number;
  screenHeight: number;
  characterScale: number;
  itemScale: number;
}

// Sprite position and size information
export interface SpriteRenderInfo {
  sprite: ImageRequireSource;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
}

// Character sprite renderer class
export class NoPogodSpriteRenderer {
  private config: SpriteRenderConfig;
  private assets: NoPogodGameAssets;

  constructor(assets: NoPogodGameAssets, screenWidth: number, screenHeight: number) {
    this.assets = assets;
    this.config = this.calculateRenderConfig(screenWidth, screenHeight);
  }

  // Calculate optimal rendering configuration for the screen size
  private calculateRenderConfig(screenWidth: number, screenHeight: number): SpriteRenderConfig {
    // Scale characters based on screen size, making them appropriately sized
    const characterScale = Math.min(screenWidth / 400, screenHeight / 600);
    const itemScale = characterScale * 0.7; // Items proportional to characters

    return {
      screenWidth,
      screenHeight,
      characterScale: Math.max(characterScale, 0.8), // Reasonable minimum scale
      itemScale: Math.max(itemScale, 0.6), // Proportional item scale
    };
  }

  // Update screen dimensions and recalculate config
  public updateScreenSize(screenWidth: number, screenHeight: number): void {
    this.config = this.calculateRenderConfig(screenWidth, screenHeight);
  }

  // Get background sprite info
  public getBackgroundSprite(): SpriteRenderInfo {
    return {
      sprite: this.assets.background,
      x: 0,
      y: 0,
      width: this.config.screenWidth,
      height: this.config.screenHeight,
    };
  }

  // Get Miro (player) sprite info based on current state
  public getMiroSprite(playerState: PlayerState, currentSprite?: ImageRequireSource): SpriteRenderInfo {
    const characterSize = 150 * this.config.characterScale; // Match ResponsiveScaling base size
    
    // Use provided sprite or fall back to state-based sprite selection
    let sprite = currentSprite;
    if (!sprite) {
      sprite = playerState.isMoving ? this.assets.miro.step1 : this.assets.miro.idle;
    }

    // Center the sprite on the player's x position
    return {
      sprite,
      x: playerState.x - characterSize / 2,
      y: playerState.y - characterSize / 2, // Changed to center vertically too
      width: characterSize,
      height: characterSize,
    };
  }

  // Get Shonzika sprite info based on current state
  public getShonzikaSprite(shonzikaState: ShonzikaState, currentSprite?: ImageRequireSource): SpriteRenderInfo {
    const characterSize = 150 * this.config.characterScale; // Match ResponsiveScaling base size
    
    // Use provided sprite or fall back to state-based sprite selection
    let sprite = currentSprite;
    if (!sprite) {
      sprite = shonzikaState.sprite === 'THROWING' ? this.assets.shonzika.handProfile : this.assets.shonzika.idle;
    }

    return {
      sprite,
      x: shonzikaState.x - characterSize / 2,
      y: shonzikaState.y - characterSize / 2,
      width: characterSize,
      height: characterSize,
    };
  }

  // Get falling item sprite info
  public getItemSprite(item: FallingItem): SpriteRenderInfo {
    const itemSize = 80 * this.config.itemScale; // Match ResponsiveScaling base size
    
    // Get sprite based on item type
    let sprite = item.sprite;
    if (!sprite) {
      sprite = this.getItemSpriteByType(item.type);
    }

    // No rotation - keep items upright for clearer visibility
    const rotation = 0; // Removed rotation to prevent visual confusion

    return {
      sprite,
      x: item.x - itemSize / 2,
      y: item.y - itemSize / 2,
      width: itemSize,
      height: itemSize,
      rotation,
    };
  }

  // Get sprite for specific item type
  private getItemSpriteByType(itemType: ItemType): ImageRequireSource {
    switch (itemType) {
      case 'EGG':
        return this.assets.items.egg;
      case 'TOMATO':
        return this.assets.items.tomato;
      case 'PEPPER':
        return this.assets.items.pepper;
      case 'ELECTRIC_SHOCK':
        return this.assets.items.electricShock;
      case 'BOMB':
        return this.assets.items.bomb;
      default:
        return this.assets.items.egg; // Fallback
    }
  }

  // Get all sprites for current game state
  public getAllSprites(gameState: NoPogodGameState, miroSprite?: ImageRequireSource, shonzikaSprite?: ImageRequireSource): {
    background: SpriteRenderInfo;
    miro: SpriteRenderInfo;
    shonzika: SpriteRenderInfo;
    items: SpriteRenderInfo[];
  } {
    return {
      background: this.getBackgroundSprite(),
      miro: this.getMiroSprite(gameState.player, miroSprite),
      shonzika: this.getShonzikaSprite(gameState.shonzika, shonzikaSprite),
      items: gameState.items.map(item => this.getItemSprite(item)),
    };
  }

  // Get touch zones for player movement
  public getTouchZones(): {
    left: { x: number; y: number; width: number; height: number };
    center: { x: number; y: number; width: number; height: number };
    right: { x: number; y: number; width: number; height: number };
  } {
    const zoneWidth = this.config.screenWidth / 3;
    const zoneHeight = this.config.screenHeight;

    return {
      left: {
        x: 0,
        y: 0,
        width: zoneWidth,
        height: zoneHeight,
      },
      center: {
        x: zoneWidth,
        y: 0,
        width: zoneWidth,
        height: zoneHeight,
      },
      right: {
        x: zoneWidth * 2,
        y: 0,
        width: zoneWidth,
        height: zoneHeight,
      },
    };
  }

  // Get UI element positions
  public getUIPositions(): {
    score: { x: number; y: number };
    lives: { x: number; y: number };
    timer: { x: number; y: number };
    pauseButton: { x: number; y: number };
  } {
    const padding = 20;
    const topY = 50;

    return {
      score: {
        x: padding,
        y: topY,
      },
      lives: {
        x: padding,
        y: topY + 30,
      },
      timer: {
        x: this.config.screenWidth - padding,
        y: topY,
      },
      pauseButton: {
        x: this.config.screenWidth - padding - 44,
        y: topY + 40,
      },
    };
  }

  // Helper method to check if a point is within a sprite bounds
  public isPointInSprite(x: number, y: number, spriteInfo: SpriteRenderInfo): boolean {
    return (
      x >= spriteInfo.x &&
      x <= spriteInfo.x + spriteInfo.width &&
      y >= spriteInfo.y &&
      y <= spriteInfo.y + spriteInfo.height
    );
  }

  // Get current render configuration
  public getRenderConfig(): SpriteRenderConfig {
    return { ...this.config };
  }

  // Calculate optimal font sizes based on screen size
  public getFontSizes(): {
    title: number;
    score: number;
    ui: number;
    button: number;
  } {
    const baseScale = Math.min(this.config.screenWidth / 375, this.config.screenHeight / 667);
    
    return {
      title: Math.max(32 * baseScale, 24),
      score: Math.max(18 * baseScale, 14),
      ui: Math.max(16 * baseScale, 12),
      button: Math.max(20 * baseScale, 16),
    };
  }

  // Get animation-specific sprite variations
  public getAnimationSprites(): {
    miro: {
      idle: ImageRequireSource;
      walking: ImageRequireSource[];
      catching: ImageRequireSource[];
    };
    shonzika: {
      idle: ImageRequireSource;
      walking: ImageRequireSource[];
      throwing: ImageRequireSource[];
    };
  } {
    return {
      miro: {
        idle: this.assets.miro.idle,
        walking: [this.assets.miro.step1, this.assets.miro.step2],
        catching: [this.assets.miro.profile, this.assets.miro.angle45, this.assets.miro.angle90],
      },
      shonzika: {
        idle: this.assets.shonzika.idle,
        walking: [this.assets.shonzika.walking1, this.assets.shonzika.walking2],
        throwing: [
          this.assets.shonzika.profile,
          this.assets.shonzika.handProfile,
          this.assets.shonzika.hand45,
          this.assets.shonzika.hand90,
          this.assets.shonzika.handProfile,
          this.assets.shonzika.profile,
        ],
      },
    };
  }

  /**
   * Calculate Shonzika's hand position for item spawning
   * This matches the calculation in the game engine for visual coordination
   */
  public calculateShonzikaHandPosition(shonzikaState: ShonzikaState): { x: number; y: number } {
    const characterSize = 150 * this.config.characterScale; // Matches character rendering size
    
    // Base hand offsets for different sprites (relative to character center)
    let handOffsetX = 0;
    let handOffsetY = 0;
    
    // Determine hand offset based on current sprite state
    if (shonzikaState.sprite === 'THROWING') {
      // When throwing, hand is extended forward
      handOffsetX = 40 * this.config.characterScale;
      handOffsetY = -10 * this.config.characterScale;
    } else if (shonzikaState.sprite === 'WALKING' || shonzikaState.isMoving) {
      // When walking, hand is at side
      handOffsetX = 20 * this.config.characterScale;
      handOffsetY = 0;
    } else {
      // When idle, hand is at rest position
      handOffsetX = 25 * this.config.characterScale;
      handOffsetY = 5 * this.config.characterScale;
    }
    
    // Adjust hand offset based on Shonzika's position (flip for left side)
    const isOnLeft = shonzikaState.position === 'LEFT' || 
                     (shonzikaState.isMoving && shonzikaState.targetX < shonzikaState.x);
    
    if (isOnLeft) {
      handOffsetX = -handOffsetX;
    }
    
    // Calculate final hand position
    const handX = shonzikaState.x + handOffsetX;
    const handY = shonzikaState.y + handOffsetY + (characterSize * 0.2);
    
    return {
      x: handX,
      y: handY,
    };
  }
}

// Utility functions for sprite rendering
export const SpriteUtils = {
  // Calculate sprite position for centered rendering
  centerSprite: (x: number, y: number, width: number, height: number) => ({
    x: x - width / 2,
    y: y - height / 2,
  }),

  // Calculate sprite bounds
  getSpriteBounds: (spriteInfo: SpriteRenderInfo) => ({
    left: spriteInfo.x,
    right: spriteInfo.x + spriteInfo.width,
    top: spriteInfo.y,
    bottom: spriteInfo.y + spriteInfo.height,
  }),

  // Check collision between two sprites
  checkSpriteCollision: (sprite1: SpriteRenderInfo, sprite2: SpriteRenderInfo): boolean => {
    const bounds1 = SpriteUtils.getSpriteBounds(sprite1);
    const bounds2 = SpriteUtils.getSpriteBounds(sprite2);

    return !(
      bounds1.right < bounds2.left ||
      bounds1.left > bounds2.right ||
      bounds1.bottom < bounds2.top ||
      bounds1.top > bounds2.bottom
    );
  },

  // Calculate distance between two sprite centers
  getSpriteDistance: (sprite1: SpriteRenderInfo, sprite2: SpriteRenderInfo): number => {
    const center1 = {
      x: sprite1.x + sprite1.width / 2,
      y: sprite1.y + sprite1.height / 2,
    };
    const center2 = {
      x: sprite2.x + sprite2.width / 2,
      y: sprite2.y + sprite2.height / 2,
    };

    const dx = center1.x - center2.x;
    const dy = center1.y - center2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // Interpolate between two positions for smooth animations
  interpolatePosition: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number
  ): { x: number; y: number } => {
    return {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
  },
};
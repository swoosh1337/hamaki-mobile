/**
 * No Pogodi Game Assets Management
 * Handles loading and organizing all game sprites with error handling and fallbacks
 */

import { createLogger } from '@/utils/logger';
import { ImageRequireSource } from 'react-native';

const log = createLogger('NoPogodAssets');

// Asset type definitions
export interface MiroSprites {
  idle: ImageRequireSource;
  step1: ImageRequireSource;
  step2: ImageRequireSource;
  profile: ImageRequireSource;
  angle45: ImageRequireSource;
  angle90: ImageRequireSource;
}

export interface ShonzikaSprites {
  idle: ImageRequireSource;
  walking1: ImageRequireSource;
  walking2: ImageRequireSource;
  profile: ImageRequireSource;
  angle45: ImageRequireSource;
  angle90: ImageRequireSource;
  handProfile: ImageRequireSource;
  hand45: ImageRequireSource;
  hand90: ImageRequireSource;
}

export interface ItemSprites {
  egg: ImageRequireSource;
  tomato: ImageRequireSource;
  pepper: ImageRequireSource;
  electricShock: ImageRequireSource;
  bomb: ImageRequireSource;
}

export interface NoPogodGameAssets {
  background: ImageRequireSource;
  miro: MiroSprites;
  shonzika: ShonzikaSprites;
  items: ItemSprites;
}

// Animation frame sequences for sprite animations
export interface AnimationSequence {
  frames: ImageRequireSource[];
  duration: number; // Duration per frame in milliseconds
  loop: boolean;
}

export interface GameAnimations {
  miro: {
    idle: AnimationSequence;
    walking: AnimationSequence;
    catching: AnimationSequence;
  };
  shonzika: {
    idle: AnimationSequence;
    walking: AnimationSequence;
    throwing: AnimationSequence;
  };
}

// Load all game assets with error handling
export const loadNoPogodGameAssets = (): NoPogodGameAssets => {
  try {
    const assets: NoPogodGameAssets = {
      background: require('@/assets/images/game/bg.png'),

      miro: {
        idle: require('@/assets/images/game/miro/პროფილი დგომა.png'),
        step1: require('@/assets/images/game/miro/ნაბიჯი 1.png'),
        step2: require('@/assets/images/game/miro/ნაბიჯი 2.png'),
        profile: require('@/assets/images/game/miro/პროფილი დგომა.png'),
        angle45: require('@/assets/images/game/miro/დგომა 45 გრადუსი.png'),
        angle90: require('@/assets/images/game/miro/დგომა 90 გრადუსი.png'),
      },

      shonzika: {
        idle: require('@/assets/images/game/shonzika/დგომა პროფილი.png'),
        walking1: require('@/assets/images/game/shonzika/სიარული 1.png'),
        walking2: require('@/assets/images/game/shonzika/სიარული 2~.png'),
        profile: require('@/assets/images/game/shonzika/დგომა პროფილი.png'),
        angle45: require('@/assets/images/game/shonzika/დგომა 45გრადუსი.png'),
        angle90: require('@/assets/images/game/shonzika/დგომა 90 გრადუსი.png'),
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

    return assets;
  } catch (error) {
    log.error('Failed to load No Pogodi game assets', error);
    return getFallbackAssets();
  }
};

// Fallback assets in case of loading failures
const getFallbackAssets = (): NoPogodGameAssets => {
  // Use existing app assets as fallbacks
  const fallbackSprite = require('@/assets/images/person-1-idle.png');
  const fallbackBackground = require('@/assets/images/background.png');

  return {
    background: fallbackBackground,
    miro: {
      idle: fallbackSprite,
      step1: fallbackSprite,
      step2: fallbackSprite,
      profile: fallbackSprite,
      angle45: fallbackSprite,
      angle90: fallbackSprite,
    },
    shonzika: {
      idle: fallbackSprite,
      walking1: fallbackSprite,
      walking2: fallbackSprite,
      profile: fallbackSprite,
      angle45: fallbackSprite,
      angle90: fallbackSprite,
      handProfile: fallbackSprite,
      hand45: fallbackSprite,
      hand90: fallbackSprite,
    },
    items: {
      egg: fallbackSprite,
      tomato: fallbackSprite,
      pepper: fallbackSprite,
      electricShock: fallbackSprite,
      bomb: fallbackSprite,
    },
  };
};

// Create animation sequences for character movements
export const createGameAnimations = (assets: NoPogodGameAssets): GameAnimations => {
  return {
    miro: {
      idle: {
        frames: [assets.miro.idle],
        duration: 1000,
        loop: true,
      },
      walking: {
        frames: [assets.miro.step1, assets.miro.step2],
        duration: 300,
        loop: true,
      },
      catching: {
        frames: [assets.miro.profile, assets.miro.angle45, assets.miro.angle90],
        duration: 200,
        loop: false,
      },
    },
    shonzika: {
      idle: {
        frames: [assets.shonzika.idle],
        duration: 1000,
        loop: true,
      },
      walking: {
        frames: [assets.shonzika.walking1, assets.shonzika.walking2],
        duration: 400,
        loop: true,
      },
      throwing: {
        frames: [
          assets.shonzika.profile,
          assets.shonzika.handProfile,
          assets.shonzika.hand45,
          assets.shonzika.hand90,
          assets.shonzika.handProfile,
          assets.shonzika.profile,
        ],
        duration: 150,
        loop: false,
      },
    },
  };
};

// Sprite animation manager class
export class SpriteAnimationManager {
  private currentAnimation: AnimationSequence | null = null;
  private currentFrameIndex: number = 0;
  private elapsedTime: number = 0;
  private isInitialized: boolean = false;

  constructor() {
    this.reset();
  }

  // Start a new animation sequence
  public startAnimation(animation: AnimationSequence): void {
    this.currentAnimation = animation;
    this.currentFrameIndex = 0;
    this.elapsedTime = 0;
    this.isInitialized = false;
  }

  // Update animation and get current frame
  public update(currentTime: number): ImageRequireSource | null {
    if (!this.currentAnimation) {
      return null;
    }

    const { frames, duration, loop } = this.currentAnimation;

    // Initialize on first update
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.elapsedTime = 0;
      this.currentFrameIndex = 0;
      return frames[0];
    }

    // Calculate which frame we should be on based on elapsed time
    this.elapsedTime = currentTime;
    const targetFrameIndex = Math.floor(this.elapsedTime / duration);

    if (targetFrameIndex !== this.currentFrameIndex) {
      this.currentFrameIndex = targetFrameIndex;

      // Handle animation completion and looping
      if (this.currentFrameIndex >= frames.length) {
        if (loop) {
          // Loop back to the beginning
          this.currentFrameIndex = this.currentFrameIndex % frames.length;
        } else {
          // Animation finished, stay on last frame
          this.currentFrameIndex = frames.length - 1;
        }
      }
    }

    return frames[this.currentFrameIndex] || frames[0];
  }

  // Get current frame without updating
  public getCurrentFrame(): ImageRequireSource | null {
    if (!this.currentAnimation || this.currentAnimation.frames.length === 0) {
      return null;
    }
    return this.currentAnimation.frames[this.currentFrameIndex] || this.currentAnimation.frames[0];
  }

  // Check if animation is complete (for non-looping animations)
  public isAnimationComplete(): boolean {
    if (!this.currentAnimation || this.currentAnimation.loop) {
      return false;
    }
    return this.currentFrameIndex >= this.currentAnimation.frames.length - 1;
  }

  // Reset animation state
  public reset(): void {
    this.currentAnimation = null;
    this.currentFrameIndex = 0;
    this.elapsedTime = 0;
    this.isInitialized = false;
  }

  // Get animation progress (0-1)
  public getAnimationProgress(): number {
    if (!this.currentAnimation) {
      return 0;
    }

    const totalFrames = this.currentAnimation.frames.length;
    return Math.min(this.currentFrameIndex / Math.max(totalFrames - 1, 1), 1);
  }
}

// Asset validation utility
export const validateAssets = (assets: NoPogodGameAssets): boolean => {
  try {
    // Check if all required assets are present
    const requiredPaths = [
      'background',
      'miro.idle',
      'miro.step1',
      'miro.step2',
      'shonzika.idle',
      'shonzika.walking1',
      'shonzika.walking2',
      'items.egg',
      'items.tomato',
      'items.pepper',
      'items.electricShock',
      'items.bomb',
    ];

    for (const path of requiredPaths) {
      const pathParts = path.split('.');
      let current: NoPogodGameAssets | MiroSprites | ShonzikaSprites | ItemSprites | ImageRequireSource = assets;

      for (const part of pathParts) {
        if (!current || typeof current !== 'object' || !(part in current)) {
          log.warn(`Missing asset: ${path}`);
          return false;
        }
        current = (current as unknown as Record<string, unknown>)[part] as NoPogodGameAssets | MiroSprites | ShonzikaSprites | ItemSprites | ImageRequireSource;
      }
    }

    return true;
  } catch (error) {
    log.error('Asset validation failed', error);
    return false;
  }
};

// Export the main asset loading function
export const NOPOGOD_GAME_ASSETS = loadNoPogodGameAssets();

// Validate assets on load
if (!validateAssets(NOPOGOD_GAME_ASSETS)) {
  log.warn('Some No Pogodi game assets failed validation, using fallbacks');
}
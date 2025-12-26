/**
 * Tests for No Pogodi Game Assets Management System
 */

import {
    createGameAnimations,
    loadNoPogodGameAssets,
    NOPOGOD_GAME_ASSETS,
    SpriteAnimationManager,
    validateAssets,
} from '@/features/games/noPogod/utils/assets';

// Mock the require statements for testing
jest.mock('@/assets/images/game/bg.png', () => 'mocked-background', { virtual: true });
jest.mock('@/assets/images/game/miro/პროფილი დგომა.png', () => 'mocked-miro-idle', { virtual: true });
jest.mock('@/assets/images/game/miro/ნაბიჯი 1.png', () => 'mocked-miro-step1', { virtual: true });
jest.mock('@/assets/images/game/miro/ნაბიჯი 2.png', () => 'mocked-miro-step2', { virtual: true });
jest.mock('@/assets/images/game/miro/დგომა 45 გრადუსი.png', () => 'mocked-miro-45', { virtual: true });
jest.mock('@/assets/images/game/miro/დგომა 90 გრადუსი.png', () => 'mocked-miro-90', { virtual: true });

jest.mock('@/assets/images/game/shonzika/დგომა პროფილი.png', () => 'mocked-shonzika-idle', { virtual: true });
jest.mock('@/assets/images/game/shonzika/სიარული 1.png', () => 'mocked-shonzika-walk1', { virtual: true });
jest.mock('@/assets/images/game/shonzika/სიარული 2~.png', () => 'mocked-shonzika-walk2', { virtual: true });
jest.mock('@/assets/images/game/shonzika/დგომა 45გრადუსი.png', () => 'mocked-shonzika-45', { virtual: true });
jest.mock('@/assets/images/game/shonzika/დგომა 90 გრადუსი.png', () => 'mocked-shonzika-90', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი პროფილი.png', () => 'mocked-shonzika-hand-profile', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი 45 აგრადუსი.png', () => 'mocked-shonzika-hand-45', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი 90 გრადუსი.png', () => 'mocked-shonzika-hand-90', { virtual: true });

jest.mock('@/assets/images/game/items/კვერცხი.png', () => 'mocked-egg', { virtual: true });
jest.mock('@/assets/images/game/items/პომიდორი.png', () => 'mocked-tomato', { virtual: true });
jest.mock('@/assets/images/game/items/წიწაკა.png', () => 'mocked-pepper', { virtual: true });
jest.mock('@/assets/images/game/items/ელექტროშოკი.png', () => 'mocked-electric-shock', { virtual: true });
jest.mock('@/assets/images/game/items/ბომბი.png', () => 'mocked-bomb', { virtual: true });

// Mock fallback assets
jest.mock('@/assets/images/person-1-idle.png', () => 'mocked-fallback-sprite', { virtual: true });
jest.mock('@/assets/images/background.png', () => 'mocked-fallback-background', { virtual: true });

describe('No Pogodi Game Assets', () => {
  describe('loadNoPogodGameAssets', () => {
    it('should load all required assets successfully', () => {
      const assets = loadNoPogodGameAssets();
      
      expect(assets).toBeDefined();
      expect(assets.background).toBe('mocked-background');
      
      // Check Miro sprites
      expect(assets.miro.idle).toBe('mocked-miro-idle');
      expect(assets.miro.step1).toBe('mocked-miro-step1');
      expect(assets.miro.step2).toBe('mocked-miro-step2');
      expect(assets.miro.profile).toBe('mocked-miro-idle');
      expect(assets.miro.angle45).toBe('mocked-miro-45');
      expect(assets.miro.angle90).toBe('mocked-miro-90');
      
      // Check Shonzika sprites
      expect(assets.shonzika.idle).toBe('mocked-shonzika-idle');
      expect(assets.shonzika.walking1).toBe('mocked-shonzika-walk1');
      expect(assets.shonzika.walking2).toBe('mocked-shonzika-walk2');
      expect(assets.shonzika.profile).toBe('mocked-shonzika-idle');
      expect(assets.shonzika.angle45).toBe('mocked-shonzika-45');
      expect(assets.shonzika.angle90).toBe('mocked-shonzika-90');
      expect(assets.shonzika.handProfile).toBe('mocked-shonzika-hand-profile');
      expect(assets.shonzika.hand45).toBe('mocked-shonzika-hand-45');
      expect(assets.shonzika.hand90).toBe('mocked-shonzika-hand-90');
      
      // Check item sprites
      expect(assets.items.egg).toBe('mocked-egg');
      expect(assets.items.tomato).toBe('mocked-tomato');
      expect(assets.items.pepper).toBe('mocked-pepper');
      expect(assets.items.electricShock).toBe('mocked-electric-shock');
      expect(assets.items.bomb).toBe('mocked-bomb');
    });
  });

  describe('validateAssets', () => {
    it('should validate complete asset structure', () => {
      const assets = loadNoPogodGameAssets();
      const isValid = validateAssets(assets);
      
      expect(isValid).toBe(true);
    });

    it('should detect missing assets', () => {
      const incompleteAssets = {
        background: 'test',
        miro: {
          idle: 'test',
          // Missing other miro sprites
        },
        shonzika: {},
        items: {},
      } as any;
      
      const isValid = validateAssets(incompleteAssets);
      expect(isValid).toBe(false);
    });
  });

  describe('createGameAnimations', () => {
    it('should create animation sequences for all characters', () => {
      const assets = loadNoPogodGameAssets();
      const animations = createGameAnimations(assets);
      
      expect(animations).toBeDefined();
      
      // Check Miro animations
      expect(animations.miro.idle).toBeDefined();
      expect(animations.miro.walking).toBeDefined();
      expect(animations.miro.catching).toBeDefined();
      
      expect(animations.miro.idle.frames).toHaveLength(1);
      expect(animations.miro.walking.frames).toHaveLength(2);
      expect(animations.miro.catching.frames).toHaveLength(3);
      
      // Check Shonzika animations
      expect(animations.shonzika.idle).toBeDefined();
      expect(animations.shonzika.walking).toBeDefined();
      expect(animations.shonzika.throwing).toBeDefined();
      
      expect(animations.shonzika.idle.frames).toHaveLength(1);
      expect(animations.shonzika.walking.frames).toHaveLength(2);
      expect(animations.shonzika.throwing.frames).toHaveLength(6);
      
      // Check animation properties
      expect(animations.miro.idle.loop).toBe(true);
      expect(animations.miro.walking.loop).toBe(true);
      expect(animations.miro.catching.loop).toBe(false);
      
      expect(animations.shonzika.idle.loop).toBe(true);
      expect(animations.shonzika.walking.loop).toBe(true);
      expect(animations.shonzika.throwing.loop).toBe(false);
    });
  });

  describe('SpriteAnimationManager', () => {
    let animationManager: SpriteAnimationManager;
    let mockAnimation: any;

    beforeEach(() => {
      animationManager = new SpriteAnimationManager();
      mockAnimation = {
        frames: ['frame1', 'frame2', 'frame3'],
        duration: 100,
        loop: true,
      };
    });

    it('should initialize with no current animation', () => {
      expect(animationManager.getCurrentFrame()).toBeNull();
      expect(animationManager.isAnimationComplete()).toBe(false);
      expect(animationManager.getAnimationProgress()).toBe(0);
    });

    it('should start animation and return first frame', () => {
      animationManager.startAnimation(mockAnimation);
      
      expect(animationManager.getCurrentFrame()).toBe('frame1');
      expect(animationManager.getAnimationProgress()).toBe(0);
    });

    it('should advance frames based on time', () => {
      animationManager.startAnimation(mockAnimation);
      
      // First update initializes timing and returns first frame
      const currentFrame1 = animationManager.update(0);
      expect(currentFrame1).toBe('frame1');
      
      // Advance time to trigger frame change (100ms duration per frame)
      const currentFrame2 = animationManager.update(100); // 100ms later
      expect(currentFrame2).toBe('frame2');
      
      const currentFrame3 = animationManager.update(200); // 200ms later
      expect(currentFrame3).toBe('frame3');
    });

    it('should loop animation when loop is true', () => {
      animationManager.startAnimation(mockAnimation);
      
      // Advance through all frames and beyond
      animationManager.update(0);   // Initialize timing, frame 1
      animationManager.update(100); // Frame 2
      animationManager.update(200); // Frame 3
      animationManager.update(300); // Should loop back to frame 1
      
      expect(animationManager.getCurrentFrame()).toBe('frame1');
    });

    it('should not loop animation when loop is false', () => {
      const nonLoopingAnimation = {
        ...mockAnimation,
        loop: false,
      };
      
      animationManager.startAnimation(nonLoopingAnimation);
      
      // Advance through all frames and beyond
      animationManager.update(0);   // Initialize timing, frame 1
      animationManager.update(100); // Frame 2
      animationManager.update(200); // Frame 3
      animationManager.update(300); // Should stay on last frame
      
      expect(animationManager.getCurrentFrame()).toBe('frame3');
      expect(animationManager.isAnimationComplete()).toBe(true);
    });

    it('should calculate animation progress correctly', () => {
      animationManager.startAnimation(mockAnimation);
      
      animationManager.update(0);   // Initialize timing, frame index 0
      expect(animationManager.getAnimationProgress()).toBe(0);
      
      animationManager.update(100); // Frame index 1
      expect(animationManager.getAnimationProgress()).toBe(0.5);
      
      animationManager.update(200); // Frame index 2 (last frame)
      expect(animationManager.getAnimationProgress()).toBe(1);
    });

    it('should reset animation state', () => {
      animationManager.startAnimation(mockAnimation);
      animationManager.update(100);
      
      animationManager.reset();
      
      expect(animationManager.getCurrentFrame()).toBeNull();
      expect(animationManager.isAnimationComplete()).toBe(false);
      expect(animationManager.getAnimationProgress()).toBe(0);
    });
  });

  describe('NOPOGOD_GAME_ASSETS constant', () => {
    it('should export pre-loaded assets', () => {
      expect(NOPOGOD_GAME_ASSETS).toBeDefined();
      expect(NOPOGOD_GAME_ASSETS.background).toBeDefined();
      expect(NOPOGOD_GAME_ASSETS.miro).toBeDefined();
      expect(NOPOGOD_GAME_ASSETS.shonzika).toBeDefined();
      expect(NOPOGOD_GAME_ASSETS.items).toBeDefined();
    });
  });
});
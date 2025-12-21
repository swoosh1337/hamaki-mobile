/**
 * Tests for No Pogodi Game Sprite Renderer
 */

import { NoPogodEngine } from '@/features/games/noPogod';
import { loadNoPogodGameAssets } from '@/utils/noPogodGameAssets';
import { NoPogodSpriteRenderer, SpriteUtils } from '@/utils/noPogodSpriteRenderer';

// Mock the asset files
jest.mock('@/assets/images/game/bg.png', () => 'mocked-background', { virtual: true });
jest.mock('@/assets/images/game/miro/პროფილი დგომა.png', () => 'mocked-miro-idle', { virtual: true });
jest.mock('@/assets/images/game/miro/ნაბიჯი 1.png', () => 'mocked-miro-step1', { virtual: true });
jest.mock('@/assets/images/game/miro/ნაბიჯი 2.png', () => 'mocked-miro-step2', { virtual: true });
jest.mock('@/assets/images/game/miro/დგომა 45 გრადუსი.png', () => 'mocked-miro-45', { virtual: true });
jest.mock('@/assets/images/game/miro/დგომა 90 გრადუსი.png', () => 'mocked-miro-90', { virtual: true });

jest.mock('@/assets/images/game/shonzika/დგომა პროფილი.png', () => 'mocked-shonzika-idle', { virtual: true });
jest.mock('@/assets/images/game/shonzika/სიარული 1.png', () => 'mocked-shonzika-walk1', { virtual: true });
jest.mock('@/assets/images/game/shonzika/სიარული 2~.png', () => 'mocked-shonzika-walk2', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი პროფილი.png', () => 'mocked-shonzika-hand-profile', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი 45 აგრადუსი.png', () => 'mocked-shonzika-hand-45', { virtual: true });
jest.mock('@/assets/images/game/shonzika/ხელი 90 გრადუსი.png', () => 'mocked-shonzika-hand-90', { virtual: true });

jest.mock('@/assets/images/game/items/კვერცხი.png', () => 'mocked-egg', { virtual: true });
jest.mock('@/assets/images/game/items/პომიდორი.png', () => 'mocked-tomato', { virtual: true });
jest.mock('@/assets/images/game/items/წიწაკა.png', () => 'mocked-pepper', { virtual: true });
jest.mock('@/assets/images/game/items/ელექტროშოკი.png', () => 'mocked-electric-shock', { virtual: true });
jest.mock('@/assets/images/game/items/ბომბი.png', () => 'mocked-bomb', { virtual: true });

describe('NoPogodSpriteRenderer', () => {
  let renderer: NoPogodSpriteRenderer;
  let gameEngine: NoPogodEngine;
  let assets: any;

  const SCREEN_WIDTH = 375;
  const SCREEN_HEIGHT = 667;

  beforeEach(() => {
    assets = loadNoPogodGameAssets();
    renderer = new NoPogodSpriteRenderer(assets, SCREEN_WIDTH, SCREEN_HEIGHT);
    gameEngine = new NoPogodEngine(SCREEN_WIDTH, SCREEN_HEIGHT, assets);
  });

  describe('Initialization', () => {
    it('should initialize with correct screen dimensions', () => {
      const config = renderer.getRenderConfig();
      
      expect(config.screenWidth).toBe(SCREEN_WIDTH);
      expect(config.screenHeight).toBe(SCREEN_HEIGHT);
      expect(config.characterScale).toBeGreaterThan(0);
      expect(config.itemScale).toBeGreaterThan(0);
    });

    it('should calculate appropriate scaling factors', () => {
      const config = renderer.getRenderConfig();
      
      // Character scale should be reasonable for the screen size
      expect(config.characterScale).toBeGreaterThanOrEqual(0.5);
      expect(config.characterScale).toBeLessThanOrEqual(2.0);
      
      // Item scale should be smaller than character scale
      expect(config.itemScale).toBeLessThan(config.characterScale);
    });
  });

  describe('Background Rendering', () => {
    it('should provide background sprite info covering full screen', () => {
      const backgroundSprite = renderer.getBackgroundSprite();
      
      expect(backgroundSprite.sprite).toBe('mocked-background');
      expect(backgroundSprite.x).toBe(0);
      expect(backgroundSprite.y).toBe(0);
      expect(backgroundSprite.width).toBe(SCREEN_WIDTH);
      expect(backgroundSprite.height).toBe(SCREEN_HEIGHT);
    });
  });

  describe('Character Rendering', () => {
    it('should render Miro sprite with correct positioning', () => {
      const gameState = gameEngine.getState();
      const miroSprite = renderer.getMiroSprite(gameState.player);
      
      expect(miroSprite.sprite).toBe('mocked-miro-idle');
      expect(miroSprite.width).toBeGreaterThan(0);
      expect(miroSprite.height).toBeGreaterThan(0);
      
      // Sprite should be centered on player position
      const expectedCenterX = gameState.player.x;
      const actualCenterX = miroSprite.x + miroSprite.width / 2;
      expect(Math.abs(actualCenterX - expectedCenterX)).toBeLessThan(1);
    });

    it('should render Shonzika sprite with correct positioning', () => {
      const gameState = gameEngine.getState();
      const shonzikaSprite = renderer.getShonzikaSprite(gameState.shonzika);
      
      expect(shonzikaSprite.sprite).toBe('mocked-shonzika-idle');
      expect(shonzikaSprite.width).toBeGreaterThan(0);
      expect(shonzikaSprite.height).toBeGreaterThan(0);
      
      // Sprite should be centered on Shonzika position
      const expectedCenterX = gameState.shonzika.x;
      const actualCenterX = shonzikaSprite.x + shonzikaSprite.width / 2;
      expect(Math.abs(actualCenterX - expectedCenterX)).toBeLessThan(1);
    });

    it('should use different sprites based on character state', () => {
      const gameState = gameEngine.getState();
      
      // Test idle state
      const idleSprite = renderer.getMiroSprite(gameState.player);
      expect(idleSprite.sprite).toBe('mocked-miro-idle');
      
      // Test moving state
      const movingPlayer = { ...gameState.player, isMoving: true };
      const movingSprite = renderer.getMiroSprite(movingPlayer);
      expect(movingSprite.sprite).toBe('mocked-miro-step1');
    });

    it('should use custom sprite when provided', () => {
      const gameState = gameEngine.getState();
      const customSprite = 'custom-sprite' as any;
      
      const spriteInfo = renderer.getMiroSprite(gameState.player, customSprite);
      expect(spriteInfo.sprite).toBe(customSprite);
    });
  });

  describe('Item Rendering', () => {
    it('should render falling items with correct sprites', () => {
      const mockItem = {
        id: 'test-item',
        type: 'EGG' as const,
        x: 100,
        y: 200,
        velocityY: 5,
        sprite: 'mocked-egg',
        points: 10,
        isBad: false,
        isDeadly: false,
      };

      const itemSprite = renderer.getItemSprite(mockItem);
      
      expect(itemSprite.sprite).toBe('mocked-egg');
      expect(itemSprite.width).toBeGreaterThan(0);
      expect(itemSprite.height).toBeGreaterThan(0);
      expect(itemSprite.rotation).toBeDefined();
      
      // Item should be centered on its position
      const expectedCenterX = mockItem.x;
      const actualCenterX = itemSprite.x + itemSprite.width / 2;
      expect(Math.abs(actualCenterX - expectedCenterX)).toBeLessThan(1);
    });

    it('should render different item types with correct sprites', () => {
      const itemTypes = [
        { type: 'EGG' as const, expectedSprite: 'mocked-egg' },
        { type: 'TOMATO' as const, expectedSprite: 'mocked-tomato' },
        { type: 'PEPPER' as const, expectedSprite: 'mocked-pepper' },
        { type: 'ELECTRIC_SHOCK' as const, expectedSprite: 'mocked-electric-shock' },
        { type: 'BOMB' as const, expectedSprite: 'mocked-bomb' },
      ];

      itemTypes.forEach(({ type, expectedSprite }) => {
        const mockItem = {
          id: `test-${type}`,
          type,
          x: 100,
          y: 200,
          velocityY: 5,
          sprite: null,
          points: 10,
          isBad: false,
          isDeadly: false,
        };

        const itemSprite = renderer.getItemSprite(mockItem);
        expect(itemSprite.sprite).toBe(expectedSprite);
      });
    });
  });

  describe('Touch Zones', () => {
    it('should provide three equal touch zones', () => {
      const touchZones = renderer.getTouchZones();
      
      expect(touchZones.left.width).toBe(SCREEN_WIDTH / 3);
      expect(touchZones.center.width).toBe(SCREEN_WIDTH / 3);
      expect(touchZones.right.width).toBe(SCREEN_WIDTH / 3);
      
      expect(touchZones.left.x).toBe(0);
      expect(touchZones.center.x).toBe(SCREEN_WIDTH / 3);
      expect(touchZones.right.x).toBe((SCREEN_WIDTH / 3) * 2);
      
      // All zones should cover full height
      expect(touchZones.left.height).toBe(SCREEN_HEIGHT);
      expect(touchZones.center.height).toBe(SCREEN_HEIGHT);
      expect(touchZones.right.height).toBe(SCREEN_HEIGHT);
    });
  });

  describe('UI Positioning', () => {
    it('should provide UI element positions', () => {
      const uiPositions = renderer.getUIPositions();
      
      expect(uiPositions.score).toBeDefined();
      expect(uiPositions.lives).toBeDefined();
      expect(uiPositions.timer).toBeDefined();
      expect(uiPositions.pauseButton).toBeDefined();
      
      // Score should be on the left
      expect(uiPositions.score.x).toBeLessThan(SCREEN_WIDTH / 2);
      
      // Timer should be on the right
      expect(uiPositions.timer.x).toBeGreaterThan(SCREEN_WIDTH / 2);
    });
  });

  describe('Font Sizing', () => {
    it('should provide appropriate font sizes for screen', () => {
      const fontSizes = renderer.getFontSizes();
      
      expect(fontSizes.title).toBeGreaterThan(fontSizes.button);
      expect(fontSizes.button).toBeGreaterThan(fontSizes.score);
      expect(fontSizes.score).toBeGreaterThan(fontSizes.ui);
      
      // All font sizes should be reasonable
      expect(fontSizes.title).toBeGreaterThanOrEqual(24);
      expect(fontSizes.ui).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Screen Size Updates', () => {
    it('should update configuration when screen size changes', () => {
      const newWidth = 414;
      const newHeight = 896;
      
      renderer.updateScreenSize(newWidth, newHeight);
      const config = renderer.getRenderConfig();
      
      expect(config.screenWidth).toBe(newWidth);
      expect(config.screenHeight).toBe(newHeight);
    });
  });

  describe('Animation Sprites', () => {
    it('should provide animation sprite sequences', () => {
      const animationSprites = renderer.getAnimationSprites();
      
      expect(animationSprites.miro.idle).toBe('mocked-miro-idle');
      expect(animationSprites.miro.walking).toHaveLength(2);
      expect(animationSprites.miro.catching).toHaveLength(3);
      
      expect(animationSprites.shonzika.idle).toBe('mocked-shonzika-idle');
      expect(animationSprites.shonzika.walking).toHaveLength(2);
      expect(animationSprites.shonzika.throwing).toHaveLength(6);
    });
  });
});

describe('SpriteUtils', () => {
  describe('centerSprite', () => {
    it('should calculate centered position correctly', () => {
      const centered = SpriteUtils.centerSprite(100, 200, 50, 60);
      
      expect(centered.x).toBe(75); // 100 - 50/2
      expect(centered.y).toBe(170); // 200 - 60/2
    });
  });

  describe('getSpriteBounds', () => {
    it('should calculate sprite bounds correctly', () => {
      const spriteInfo = {
        sprite: 'test' as any,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      };
      
      const bounds = SpriteUtils.getSpriteBounds(spriteInfo);
      
      expect(bounds.left).toBe(10);
      expect(bounds.right).toBe(40); // 10 + 30
      expect(bounds.top).toBe(20);
      expect(bounds.bottom).toBe(60); // 20 + 40
    });
  });

  describe('checkSpriteCollision', () => {
    it('should detect collision between overlapping sprites', () => {
      const sprite1 = {
        sprite: 'test1' as any,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      };
      
      const sprite2 = {
        sprite: 'test2' as any,
        x: 25,
        y: 25,
        width: 50,
        height: 50,
      };
      
      expect(SpriteUtils.checkSpriteCollision(sprite1, sprite2)).toBe(true);
    });

    it('should not detect collision between non-overlapping sprites', () => {
      const sprite1 = {
        sprite: 'test1' as any,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      };
      
      const sprite2 = {
        sprite: 'test2' as any,
        x: 100,
        y: 100,
        width: 50,
        height: 50,
      };
      
      expect(SpriteUtils.checkSpriteCollision(sprite1, sprite2)).toBe(false);
    });
  });

  describe('getSpriteDistance', () => {
    it('should calculate distance between sprite centers', () => {
      const sprite1 = {
        sprite: 'test1' as any,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      };
      
      const sprite2 = {
        sprite: 'test2' as any,
        x: 30,
        y: 40,
        width: 20,
        height: 20,
      };
      
      // Centers are at (10, 10) and (40, 50)
      // Distance should be sqrt((40-10)^2 + (50-10)^2) = sqrt(900 + 1600) = 50
      const distance = SpriteUtils.getSpriteDistance(sprite1, sprite2);
      expect(distance).toBe(50);
    });
  });

  describe('interpolatePosition', () => {
    it('should interpolate between positions correctly', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 200 };
      
      const halfway = SpriteUtils.interpolatePosition(start, end, 0.5);
      expect(halfway.x).toBe(50);
      expect(halfway.y).toBe(100);
      
      const quarter = SpriteUtils.interpolatePosition(start, end, 0.25);
      expect(quarter.x).toBe(25);
      expect(quarter.y).toBe(50);
    });
  });
});
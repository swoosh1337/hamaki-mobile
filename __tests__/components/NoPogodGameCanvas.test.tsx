/**
 * Tests for No Pogodi Game Canvas Component
 * 
 * Run with: npm test -- __tests__/components/NoPogodGameCanvas.test.tsx --no-coverage
 */

import { areImagesLoaded, NoPogodGameCanvas, SPRITE_MAPPING } from '@/components/games/NoPogodGameCanvas';
import { loadNoPogodGameAssets } from '@/utils/noPogodGameAssets';
import { NoPogodGameEngine } from '@/utils/noPogodGameEngine';
import { ResponsiveScalingManager } from '@/utils/noPogodResponsiveScaling';
import { NoPogodSpriteRenderer } from '@/utils/noPogodSpriteRenderer';
import { render } from '@testing-library/react-native';
import React from 'react';

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children }: any) => children,
  Image: ({ image, x, y, width, height }: any) => null,
  useImage: (source: any) => source, // Mock useImage to return the source
  Group: ({ children }: any) => children,
  Rect: ({ x, y, width, height, color }: any) => null,
  Text: ({ x, y, text }: any) => null,
  Font: () => null,
  useFont: () => null,
}));

// Create mock scaling config data
const mockScalingConfig = {
  screenWidth: 375,
  screenHeight: 667,
  scaleX: 1,
  scaleY: 1,
  uniformScale: 1,
  characterScale: 1,
  itemScale: 0.6,
  uiScale: 1,
  isTablet: false,
  isLandscape: false,
};

const mockSizes = {
  characterSize: 80,
  itemSize: 40,
  fontSize: {
    title: 48,
    score: 18,
    ui: 16,
    button: 20,
  },
  spacing: {
    small: 8,
    medium: 16,
    large: 24,
  },
};

const mockPositions = {
  miroGroundY: 533.6,
  shonzikaY: 133.4,
  playerPositions: {
    left: 93.75,
    center: 187.5,
    right: 281.25,
  },
  uiPadding: 20,
  touchZoneHeight: 667,
};

// Mock ResponsiveScalingManager
const mockScalingInstance = {
  getScalingConfig: () => mockScalingConfig,
  getSizes: () => mockSizes,
  getPositions: () => mockPositions,
};

jest.mock('@/utils/noPogodResponsiveScaling', () => ({
  ResponsiveScalingManager: jest.fn().mockImplementation(() => mockScalingInstance),
}));

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

describe('NoPogodGameCanvas', () => {
  let gameEngine: NoPogodGameEngine;
  let spriteRenderer: NoPogodSpriteRenderer;
  let responsiveScaling: ResponsiveScalingManager;
  let assets: any;
  let mockCallbacks: any;

  const SCREEN_WIDTH = 375;
  const SCREEN_HEIGHT = 667;

  beforeEach(() => {
    assets = loadNoPogodGameAssets();
    gameEngine = new NoPogodGameEngine(SCREEN_WIDTH, SCREEN_HEIGHT, assets);
    spriteRenderer = new NoPogodSpriteRenderer(assets, SCREEN_WIDTH, SCREEN_HEIGHT);
    responsiveScaling = new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);
    
    mockCallbacks = {
      onStartGame: jest.fn(),
      onExitGame: jest.fn(),
      onPauseGame: jest.fn(),
      onResumeGame: jest.fn(),
      onRestartGame: jest.fn(),
    };
  });

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      const gameState = gameEngine.getState();
      
      const result = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
        />
      );
      
      expect(result).toBeTruthy();
    });

    it('should render with custom sprites', () => {
      const gameState = gameEngine.getState();
      const customMiroSprite = 'custom-miro-sprite';
      const customShonzikaSprite = 'custom-shonzika-sprite';
      
      const result = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          miroSprite={customMiroSprite}
          shonzikaSprite={customShonzikaSprite}
        />
      );
      
      expect(result).toBeTruthy();
    });

    it('should handle different game phases', () => {
      const phases = ['MENU', 'PLAYING', 'PAUSED', 'GAME_OVER'] as const;
      
      phases.forEach(phase => {
        const gameState = { ...gameEngine.getState(), phase };
        
        const result = render(
          <NoPogodGameCanvas
            gameState={gameState}
            spriteRenderer={spriteRenderer}
            responsiveScaling={mockScalingInstance as any}
          />
        );
        
        expect(result).toBeTruthy();
      });
    });
  });

  describe('Responsive Scaling Integration', () => {
    it('should handle different screen sizes through responsive scaling', () => {
      const gameState = gameEngine.getState();

      const smallResult = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
        />
      );
      
      expect(smallResult).toBeTruthy();

      const largeResult = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
        />
      );
      
      expect(largeResult).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing sprite renderer gracefully', () => {
      const gameState = gameEngine.getState();
      
      const result = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={null as any}
          responsiveScaling={mockScalingInstance as any}
        />
      );
      
      expect(result).toBeTruthy();
    });
  });

  describe('UI Components', () => {
    it('should render HUD during PLAYING phase', () => {
      gameEngine.startGame();
      const gameState = gameEngine.getState();
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      // Check for score display
      expect(getByText(/Score:/)).toBeTruthy();
      
      // Check for timer display
      expect(getByText(/60s/)).toBeTruthy();
    });

    it('should render menu screen during MENU phase', () => {
      const gameState = gameEngine.getState();
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText('No Pogodi!')).toBeTruthy();
      expect(getByText('START GAME')).toBeTruthy();
    });

    it('should render pause screen during PAUSED phase', () => {
      gameEngine.startGame();
      gameEngine.pauseGame();
      const gameState = gameEngine.getState();
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText('PAUSED')).toBeTruthy();
      expect(getByText('RESUME')).toBeTruthy();
      expect(getByText('EXIT')).toBeTruthy();
    });

    it('should render game over screen during GAME_OVER phase', () => {
      gameEngine.startGame();
      const gameState = { ...gameEngine.getState(), phase: 'GAME_OVER' as const, score: 150 };
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText('GAME OVER')).toBeTruthy();
      expect(getByText('Final Score: 150')).toBeTruthy();
      expect(getByText('PLAY AGAIN')).toBeTruthy();
    });

    it('should display lives with heart icons', () => {
      gameEngine.startGame();
      const gameState = gameEngine.getState();
      
      const { getAllByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      // Should have 3 heart icons for 3 lives
      const hearts = getAllByText('❤️');
      expect(hearts.length).toBe(3);
    });

    it('should show empty hearts for lost lives', () => {
      gameEngine.startGame();
      const gameState = { ...gameEngine.getState(), lives: 1 };
      
      const { getAllByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      // Should have 1 full heart and 2 empty hearts
      const fullHearts = getAllByText('❤️');
      const emptyHearts = getAllByText('🖤');
      expect(fullHearts.length).toBe(1);
      expect(emptyHearts.length).toBe(2);
    });

    it('should show timer warning when time is low', () => {
      gameEngine.startGame();
      const gameState = { ...gameEngine.getState(), timeRemaining: 5000 }; // 5 seconds
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      const timerText = getByText('5s');
      expect(timerText).toBeTruthy();
    });

    it('should display correct game end message for time up', () => {
      const gameState = { 
        ...gameEngine.getState(), 
        phase: 'GAME_OVER' as const,
        timeRemaining: 0,
        lives: 3
      };
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText("Time's up!")).toBeTruthy();
    });

    it('should display correct game end message for lives lost', () => {
      const gameState = { 
        ...gameEngine.getState(), 
        phase: 'GAME_OVER' as const,
        timeRemaining: 30000,
        lives: 0
      };
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText("Out of lives!")).toBeTruthy();
    });

    it('should display correct game end message for bomb caught', () => {
      const gameState = { 
        ...gameEngine.getState(), 
        phase: 'GAME_OVER' as const,
        timeRemaining: 30000,
        lives: 3
      };
      
      const { getByText } = render(
        <NoPogodGameCanvas
          gameState={gameState}
          spriteRenderer={spriteRenderer}
          responsiveScaling={mockScalingInstance as any}
          {...mockCallbacks}
        />
      );
      
      expect(getByText("Bomb caught!")).toBeTruthy();
    });
  });
});

describe('Utility Functions', () => {
  describe('areImagesLoaded', () => {
    it('should return true when all images are loaded', () => {
      const images = ['image1', 'image2', 'image3'];
      expect(areImagesLoaded(...images)).toBe(true);
    });

    it('should return false when some images are null', () => {
      const images = ['image1', null, 'image3'];
      expect(areImagesLoaded(...images)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(areImagesLoaded()).toBe(true);
    });
  });

  describe('SPRITE_MAPPING', () => {
    it('should contain all required sprite mappings', () => {
      expect(SPRITE_MAPPING.miro).toBeDefined();
      expect(SPRITE_MAPPING.shonzika).toBeDefined();
      expect(SPRITE_MAPPING.items).toBeDefined();
      
      // Check Miro sprites
      expect(SPRITE_MAPPING.miro.idle).toBeDefined();
      expect(SPRITE_MAPPING.miro.step1).toBeDefined();
      expect(SPRITE_MAPPING.miro.step2).toBeDefined();
      
      // Check Shonzika sprites
      expect(SPRITE_MAPPING.shonzika.idle).toBeDefined();
      expect(SPRITE_MAPPING.shonzika.handProfile).toBeDefined();
      
      // Check item sprites
      expect(SPRITE_MAPPING.items.egg).toBeDefined();
      expect(SPRITE_MAPPING.items.tomato).toBeDefined();
      expect(SPRITE_MAPPING.items.pepper).toBeDefined();
      expect(SPRITE_MAPPING.items.electricShock).toBeDefined();
      expect(SPRITE_MAPPING.items.bomb).toBeDefined();
    });
  });
});
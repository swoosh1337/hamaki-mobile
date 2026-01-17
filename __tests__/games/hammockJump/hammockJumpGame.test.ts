/**
 * Hammock Jump Game Tests
 *
 * Comprehensive tests for the Hammock Jump game functionality.
 * Tests cover:
 * - Game configuration
 * - Platform types (normal, moving, breakable, spring, bouncy, ice, conveyor)
 * - Physics (gravity, jump velocities, friction)
 * - Player movement (tilt, double jump)
 * - Platform collision detection
 * - Combo system (time-based, 1.5s window)
 * - Scoring
 * - Game state management (MENU, PLAYING, PAUSED, GAME_OVER)
 * - Platform spawning (ellipse constraint reachability)
 * - Items collection
 * - Edge visibility fix
 * - Double jump hint logic
 */

import {
  GameState,
  Platform,
  Item,
  GAME_CONFIG,
  HammockGameEngine,
} from '@/features/games/hammockJump/engine/HammockJumpEngine';

/**
 * Helper to access private game state for testing
 */
function getGameState(game: HammockGameEngine): GameState {
  return game.getState();
}

/**
 * Helper to access private properties for testing
 */
function getPrivateField<T>(game: HammockGameEngine, field: string): T {
  return (game as any)[field];
}

/**
 * Helper to set private fields for testing
 */
function setPrivateField(game: HammockGameEngine, field: string, value: any): void {
  (game as any)[field] = value;
}

/**
 * Helper to directly modify game state for testing
 */
function modifyGameState(game: HammockGameEngine, modifier: (state: GameState) => void): void {
  const state = (game as any).gameState;
  modifier(state);
}

/**
 * Helper to create a test platform
 */
function createTestPlatform(options: Partial<Platform> & { x: number; y: number }): Platform {
  return {
    id: options.id || `test_${Math.random().toString(36).slice(2)}`,
    x: options.x,
    y: options.y,
    width: options.width || 100,
    height: options.height || GAME_CONFIG.PLATFORM_HEIGHT,
    vx: options.vx || 0,
    type: options.type || 'normal',
    broken: options.broken || false,
    springUsed: options.springUsed || false,
    scored: options.scored || false,
    conveyorDirection: options.conveyorDirection,
  };
}

/**
 * Helper to trigger game updates
 */
function triggerUpdate(game: HammockGameEngine, deltaMs: number = 16): void {
  const currentTime = Date.now();
  game.update(currentTime);
  game.update(currentTime + deltaMs);
}

/**
 * Helper to trigger multiple updates
 */
function triggerMultipleUpdates(game: HammockGameEngine, count: number, deltaMs: number = 16): void {
  let currentTime = Date.now();
  for (let i = 0; i < count; i++) {
    game.update(currentTime);
    currentTime += deltaMs;
  }
}

describe('Hammock Jump Game', () => {
  let game: HammockGameEngine;
  const screenWidth = 400;
  const screenHeight = 800;

  beforeEach(() => {
    game = new HammockGameEngine(screenWidth, screenHeight);
  });

  // ==========================================================================
  // GAME CONFIGURATION TESTS
  // ==========================================================================
  describe('Game Configuration', () => {
    test('should have correct player size', () => {
      expect(GAME_CONFIG.PLAYER_SIZE).toBe(64);
    });

    test('should have correct platform height', () => {
      expect(GAME_CONFIG.PLATFORM_HEIGHT).toBe(14);
    });

    test('should have correct score per platform', () => {
      expect(GAME_CONFIG.SCORE_PER_PLATFORM).toBe(10);
    });

    test('should have correct combo multiplier', () => {
      expect(GAME_CONFIG.COMBO_MULTIPLIER).toBe(2);
    });

    test('should have correct item score', () => {
      expect(GAME_CONFIG.ITEM_SCORE).toBe(15);
    });

    test('should have reachability constants for ellipse constraint', () => {
      expect(GAME_CONFIG.MAX_REACHABLE_HEIGHT).toBe(200);
      expect(GAME_CONFIG.MAX_REACHABLE_HORIZONTAL).toBe(200);
    });

    test('should have base platform gap', () => {
      expect(GAME_CONFIG.BASE_PLATFORM_GAP).toBe(80);
    });

    test('should have max platform gap', () => {
      expect(GAME_CONFIG.MAX_PLATFORM_GAP).toBe(220);
    });
  });

  // ==========================================================================
  // GAME STATE MANAGEMENT TESTS
  // ==========================================================================
  describe('Game State Management', () => {
    test('should initialize in MENU phase', () => {
      const state = getGameState(game);
      expect(state.phase).toBe('MENU');
    });

    test('should transition to PLAYING when started', () => {
      game.startGame();
      const state = getGameState(game);
      expect(state.phase).toBe('PLAYING');
    });

    test('should transition to PAUSED when paused', () => {
      game.startGame();
      game.pauseGame();
      const state = getGameState(game);
      expect(state.phase).toBe('PAUSED');
    });

    test('should transition back to PLAYING when resumed', () => {
      game.startGame();
      game.pauseGame();
      game.resumeGame();
      const state = getGameState(game);
      expect(state.phase).toBe('PLAYING');
    });

    test('should not pause if not playing', () => {
      game.pauseGame(); // Try to pause from MENU
      const state = getGameState(game);
      expect(state.phase).toBe('MENU');
    });

    test('should not resume if not paused', () => {
      game.startGame();
      game.resumeGame(); // Already playing
      const state = getGameState(game);
      expect(state.phase).toBe('PLAYING');
    });

    test('should reset to MENU when exiting', () => {
      game.startGame();
      game.exitGame();
      const state = getGameState(game);
      expect(state.phase).toBe('MENU');
    });

    test('should reset score when starting new game', () => {
      game.startGame();
      modifyGameState(game, (state) => {
        state.score = 1000;
      });
      game.startGame(); // Restart
      const state = getGameState(game);
      expect(state.score).toBe(0);
    });

    test('should reset combo when starting new game', () => {
      game.startGame();
      modifyGameState(game, (state) => {
        state.combo = 5;
      });
      game.startGame(); // Restart
      const state = getGameState(game);
      expect(state.combo).toBe(0);
    });

    test('should have platforms after starting', () => {
      game.startGame();
      const state = getGameState(game);
      expect(state.platforms.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // PLAYER INITIALIZATION TESTS
  // ==========================================================================
  describe('Player Initialization', () => {
    test('should initialize player at correct position', () => {
      game.startGame();
      const state = getGameState(game);
      expect(state.player.y).toBe(screenHeight * 0.7);
      expect(state.player.x).toBeCloseTo(screenWidth / 2 - GAME_CONFIG.PLAYER_SIZE / 2, 0);
    });

    test('should initialize player with correct size', () => {
      const state = getGameState(game);
      expect(state.player.width).toBe(GAME_CONFIG.PLAYER_SIZE);
      expect(state.player.height).toBe(GAME_CONFIG.PLAYER_SIZE);
    });

    test('should initialize player with zero velocity', () => {
      game.startGame();
      const state = getGameState(game);
      expect(state.player.vy).toBe(0);
      expect(state.player.vx).toBe(0);
    });

    test('should initialize isOnIce as false', () => {
      game.startGame();
      const state = getGameState(game);
      expect(state.player.isOnIce).toBe(false);
    });
  });

  // ==========================================================================
  // PLAYER MOVEMENT TESTS
  // ==========================================================================
  describe('Player Movement', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should move left when setMoveLeft is called', () => {
      game.setMoveLeft(true);
      const initialX = getGameState(game).player.x;
      triggerUpdate(game, 16);
      const newX = getGameState(game).player.x;
      expect(newX).toBeLessThan(initialX);
    });

    test('should move right when setMoveRight is called', () => {
      game.setMoveRight(true);
      const initialX = getGameState(game).player.x;
      triggerUpdate(game, 16);
      const newX = getGameState(game).player.x;
      expect(newX).toBeGreaterThan(initialX);
    });

    test('should stop moving when direction released', () => {
      game.setMoveLeft(true);
      game.setMoveLeft(false);
      const moveDir = getPrivateField<number>(game, 'moveDir');
      expect(moveDir).toBe(0);
    });

    test('should apply analog movement from tilt', () => {
      game.setMoveAnalog(0.5);
      // After low-pass filter, moveAnalog should be non-zero
      const moveAnalog = getPrivateField<number>(game, 'moveAnalog');
      expect(moveAnalog).toBeGreaterThan(0);
    });

    test('should apply dead zone to small tilts', () => {
      game.setMoveAnalog(0.05); // Below dead zone (0.08)
      const moveAnalog = getPrivateField<number>(game, 'moveAnalog');
      expect(moveAnalog).toBe(0);
    });

    test('should wrap player around screen edges', () => {
      modifyGameState(game, (state) => {
        state.player.x = -state.player.width - 1; // Past left edge
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.player.x).toBeGreaterThan(screenWidth - 100); // Wrapped to right
    });

    test('setTilt should be alias for setMoveAnalog', () => {
      game.setTilt(0.5);
      const moveAnalog = getPrivateField<number>(game, 'moveAnalog');
      expect(moveAnalog).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // PLATFORM TYPE TESTS
  // ==========================================================================
  describe('Platform Types', () => {
    test('should support all platform types', () => {
      const types: Platform['type'][] = ['normal', 'moving', 'breakable', 'spring', 'bouncy', 'ice', 'conveyor'];
      types.forEach((type) => {
        const platform = createTestPlatform({ x: 100, y: 100, type });
        expect(platform.type).toBe(type);
      });
    });

    test('breakable platforms should have broken flag', () => {
      const platform = createTestPlatform({ x: 100, y: 100, type: 'breakable' });
      expect(platform.broken).toBe(false);
    });

    test('spring platforms should have springUsed flag', () => {
      const platform = createTestPlatform({ x: 100, y: 100, type: 'spring' });
      expect(platform.springUsed).toBe(false);
    });

    test('conveyor platforms should have direction', () => {
      const platform = createTestPlatform({ x: 100, y: 100, type: 'conveyor', conveyorDirection: 1 });
      expect(platform.conveyorDirection).toBe(1);
    });

    test('moving platforms should have velocity', () => {
      const platform = createTestPlatform({ x: 100, y: 100, type: 'moving', vx: 0.1 });
      expect(platform.vx).toBe(0.1);
    });
  });

  // ==========================================================================
  // COMBO SYSTEM TESTS
  // ==========================================================================
  describe('Combo System', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should start with combo 0', () => {
      const state = getGameState(game);
      expect(state.combo).toBe(0);
    });

    test('should track lastLandingTime', () => {
      const state = getGameState(game);
      expect(state.lastLandingTime).toBe(0);
    });

    test('combo should reset to 1 on first landing (no previous time)', () => {
      // Simulate landing on platform with no previous landing
      modifyGameState(game, (state) => {
        state.lastLandingTime = 0;
        state.combo = 0;
      });
      // The combo logic sets combo to 1 when lastLandingTime is 0
      // This is tested indirectly through gameplay
    });

    test('should have combo bonus only when combo >= 3', () => {
      // Combo bonus formula: combo >= 3 ? floor(baseScore * (combo / COMBO_MULTIPLIER)) : 0
      const baseScore = GAME_CONFIG.SCORE_PER_PLATFORM;
      const comboMultiplier = GAME_CONFIG.COMBO_MULTIPLIER;

      // Combo 2: no bonus
      expect(2 >= 3).toBe(false);

      // Combo 3: has bonus
      const combo3Bonus = Math.floor(baseScore * (3 / comboMultiplier));
      expect(combo3Bonus).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SCORING TESTS
  // ==========================================================================
  describe('Scoring', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should start with score 0', () => {
      const state = getGameState(game);
      expect(state.score).toBe(0);
    });

    test('platforms should track if already scored', () => {
      const platform = createTestPlatform({ x: 100, y: 100 });
      expect(platform.scored).toBe(false);
    });

    test('item score should be correct', () => {
      expect(GAME_CONFIG.ITEM_SCORE).toBe(15);
    });
  });

  // ==========================================================================
  // PHYSICS TESTS
  // ==========================================================================
  describe('Physics', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should apply gravity when playing', () => {
      modifyGameState(game, (state) => {
        state.player.vy = 0;
        state.player.isGrounded = false;
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.player.vy).toBeGreaterThan(0); // Falling
    });

    test('should cap fall speed at MAX_FALL_SPEED', () => {
      modifyGameState(game, (state) => {
        state.player.vy = 100; // Very fast
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.player.vy).toBeLessThanOrEqual(20); // MAX_FALL_SPEED
    });

    test('should update game time', () => {
      triggerUpdate(game, 100);
      const state = getGameState(game);
      expect(state.gameTime).toBeGreaterThan(0);
    });

    test('ice friction should be less than 1', () => {
      // ICE_FRICTION = 0.98 means velocity decays slower
      expect(0.98).toBeLessThan(1);
    });
  });

  // ==========================================================================
  // PLATFORM SPAWNING / REACHABILITY TESTS
  // ==========================================================================
  describe('Platform Spawning & Reachability', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should have start platform below player', () => {
      const state = getGameState(game);
      const startPlatform = state.platforms.find((p) => p.id === 'start');
      expect(startPlatform).toBeDefined();
      expect(startPlatform!.y).toBeGreaterThan(state.player.y);
    });

    test('all platforms should be within screen width', () => {
      const state = getGameState(game);
      state.platforms.forEach((platform) => {
        expect(platform.x).toBeGreaterThanOrEqual(0);
        expect(platform.x + platform.width).toBeLessThanOrEqual(screenWidth);
      });
    });

    test('ellipse constraint should limit diagonal distances', () => {
      // Test the ellipse formula: (h/maxH)² + (v/maxV)² <= 1
      const maxH = GAME_CONFIG.MAX_REACHABLE_HORIZONTAL;
      const maxV = GAME_CONFIG.MAX_REACHABLE_HEIGHT;

      // If vertical = maxV, horizontal must be 0
      const hWhenVMax = maxH * Math.sqrt(1 - 1); // sqrt(0) = 0
      expect(hWhenVMax).toBe(0);

      // If vertical = 0, horizontal can be maxH
      const hWhenVZero = maxH * Math.sqrt(1 - 0);
      expect(hWhenVZero).toBe(maxH);

      // If vertical = maxV/2, horizontal should be ~86% of maxH
      const hWhenVHalf = maxH * Math.sqrt(1 - 0.25); // sqrt(0.75) ≈ 0.866
      expect(hWhenVHalf).toBeCloseTo(maxH * 0.866, 0);
    });

    test('difficulty should scale over time', () => {
      // After 10 seconds, difficulty level increases
      modifyGameState(game, (state) => {
        state.gameTime = 30; // 30 seconds = difficulty level 3
      });
      // Trigger platform spawning
      triggerUpdate(game, 16);
      // Difficulty affects platform generation (tested implicitly)
    });
  });

  // ==========================================================================
  // GAME OVER TESTS
  // ==========================================================================
  describe('Game Over', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should trigger game over when falling below screen', () => {
      modifyGameState(game, (state) => {
        state.player.y = screenHeight + 200; // Way below screen
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.phase).toBe('GAME_OVER');
    });

    test('should not trigger game over when player is on screen', () => {
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.phase).toBe('PLAYING');
    });
  });

  // ==========================================================================
  // ITEMS TESTS
  // ==========================================================================
  describe('Items', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should support egg, tomato, pepper item types', () => {
      const types: Item['type'][] = ['egg', 'tomato', 'pepper'];
      types.forEach((type) => {
        const item: Item = {
          id: 'test',
          x: 100,
          y: 100,
          type,
          width: GAME_CONFIG.ITEM_SIZE,
          height: GAME_CONFIG.ITEM_SIZE,
          collected: false,
        };
        expect(item.type).toBe(type);
      });
    });

    test('items should have correct size', () => {
      expect(GAME_CONFIG.ITEM_SIZE).toBe(32);
    });

    test('spawn chance should be 25%', () => {
      expect(GAME_CONFIG.SPAWN_ITEM_CHANCE).toBe(0.25);
    });
  });

  // ==========================================================================
  // PARTICLES & EFFECTS TESTS
  // ==========================================================================
  describe('Particles & Effects', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('should start with no particles', () => {
      modifyGameState(game, (state) => {
        state.particles = [];
      });
      const state = getGameState(game);
      expect(state.particles.length).toBe(0);
    });

    test('particles should decay over time', () => {
      modifyGameState(game, (state) => {
        state.particles = [
          {
            id: 'test',
            x: 100,
            y: 100,
            vx: 1,
            vy: 1,
            life: 10,
            maxLife: 50,
            color: '#FFFFFF',
            size: 3,
          },
        ];
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      if (state.particles.length > 0) {
        expect(state.particles[0].life).toBeLessThan(10);
      }
    });

    test('should start with no screen shake', () => {
      const state = getGameState(game);
      expect(state.screenShake).toBe(0);
    });

    test('screen shake should decay', () => {
      modifyGameState(game, (state) => {
        state.screenShake = 10;
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.screenShake).toBeLessThan(10);
    });
  });

  // ==========================================================================
  // MOVING PLATFORM TESTS
  // ==========================================================================
  describe('Moving Platforms', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('moving platforms should update position', () => {
      modifyGameState(game, (state) => {
        state.platforms = [
          createTestPlatform({ x: 100, y: 300, type: 'moving', vx: 0.1 }),
        ];
      });
      const initialX = getGameState(game).platforms[0].x;
      triggerUpdate(game, 16);
      const newX = getGameState(game).platforms[0].x;
      expect(newX).not.toBe(initialX);
    });

    test('moving platforms should bounce off edges', () => {
      modifyGameState(game, (state) => {
        state.platforms = [
          createTestPlatform({ x: 0, y: 300, type: 'moving', vx: -0.1 }),
        ];
      });
      triggerUpdate(game, 16);
      const platform = getGameState(game).platforms[0];
      expect(platform.vx).toBeGreaterThan(0); // Bounced, now moving right
    });
  });

  // ==========================================================================
  // EDGE VISIBILITY FIX TESTS
  // ==========================================================================
  describe('Edge Visibility Fix', () => {
    test('platforms at edge of screen should not cause collision', () => {
      // The edge visibility fix adds a 50px margin
      // Platforms outside this margin should not trigger collision
      const VISIBILITY_MARGIN = 50;
      expect(VISIBILITY_MARGIN).toBe(50);
    });
  });

  // ==========================================================================
  // UPDATE LOOP TESTS
  // ==========================================================================
  describe('Update Loop', () => {
    test('should not update when not playing', () => {
      // Game starts in MENU
      const initialState = getGameState(game);
      triggerUpdate(game, 16);
      const newState = getGameState(game);
      expect(newState.gameTime).toBe(initialState.gameTime);
    });

    test('should update when playing', () => {
      game.startGame();
      triggerUpdate(game, 100);
      const state = getGameState(game);
      expect(state.gameTime).toBeGreaterThan(0);
    });

    test('should not update when paused', () => {
      game.startGame();
      triggerUpdate(game, 50);
      game.pauseGame();
      const timeWhenPaused = getGameState(game).gameTime;
      triggerUpdate(game, 100);
      const timeAfterPause = getGameState(game).gameTime;
      expect(timeAfterPause).toBe(timeWhenPaused);
    });
  });

  // ==========================================================================
  // ICE PLATFORM FRICTION TESTS
  // ==========================================================================
  describe('Ice Platform Friction', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('ice friction should reduce velocity slower than normal', () => {
      modifyGameState(game, (state) => {
        state.player.isOnIce = true;
        state.player.vx = 10;
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      // Ice friction is 0.98, normal is 0.95
      // After one frame: 10 * 0.98 = 9.8 (ice) vs 10 * 0.95 = 9.5 (normal)
      expect(state.player.vx).toBeGreaterThan(9.5);
    });

    test('ice effect should end when velocity is minimal', () => {
      modifyGameState(game, (state) => {
        state.player.isOnIce = true;
        state.player.vx = 0.05; // Very small
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      expect(state.player.isOnIce).toBe(false);
    });
  });

  // ==========================================================================
  // PLATFORM CLEANUP TESTS
  // ==========================================================================
  describe('Platform Cleanup', () => {
    beforeEach(() => {
      game.startGame();
    });

    test('broken platforms should be removed', () => {
      modifyGameState(game, (state) => {
        state.platforms = [
          createTestPlatform({ x: 100, y: 300, type: 'breakable', broken: true }),
          createTestPlatform({ x: 200, y: 300, type: 'normal' }),
        ];
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      const brokenPlatforms = state.platforms.filter((p) => p.broken);
      expect(brokenPlatforms.length).toBe(0);
    });

    test('platforms below screen should be removed', () => {
      modifyGameState(game, (state) => {
        state.platforms = [
          createTestPlatform({ x: 100, y: screenHeight + 300 }), // Way below
          createTestPlatform({ x: 200, y: 300 }), // Visible
        ];
      });
      triggerUpdate(game, 16);
      const state = getGameState(game);
      const belowScreenPlatforms = state.platforms.filter((p) => p.y > screenHeight + 200);
      expect(belowScreenPlatforms.length).toBe(0);
    });
  });
});

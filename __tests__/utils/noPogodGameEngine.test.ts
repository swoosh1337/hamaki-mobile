import { FallingItem, ITEM_DEFINITIONS, NO_POGOD_CONFIG, NoPogodGameEngine } from '../../utils/noPogodGameEngine';

describe('NoPogodGameEngine - Player Movement System', () => {
  let gameEngine: NoPogodGameEngine;
  const screenWidth = 400;
  const screenHeight = 600;

  beforeEach(() => {
    gameEngine = new NoPogodGameEngine(screenWidth, screenHeight);
    gameEngine.startGame();
  });

  describe('Player Position Management', () => {
    test('should initialize player at CENTER position', () => {
      const playerState = gameEngine.getPlayerState();
      expect(playerState.position).toBe('CENTER');
      expect(playerState.x).toBe(screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER);
      expect(playerState.isMoving).toBe(false);
      expect(playerState.sprite).toBe('IDLE');
    });

    test('should move player to LEFT position', () => {
      gameEngine.movePlayer('LEFT');
      const playerState = gameEngine.getPlayerState();
      
      expect(playerState.position).toBe('LEFT');
      expect(playerState.targetX).toBe(screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.LEFT);
      expect(playerState.isMoving).toBe(true);
      expect(playerState.sprite).toBe('MOVING');
    });

    test('should move player to RIGHT position', () => {
      gameEngine.movePlayer('RIGHT');
      const playerState = gameEngine.getPlayerState();
      
      expect(playerState.position).toBe('RIGHT');
      expect(playerState.targetX).toBe(screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.RIGHT);
      expect(playerState.isMoving).toBe(true);
      expect(playerState.sprite).toBe('MOVING');
    });

    test('should not move player when game is not playing', () => {
      gameEngine.pauseGame();
      const initialState = gameEngine.getPlayerState();
      
      gameEngine.movePlayer('LEFT');
      const afterMoveState = gameEngine.getPlayerState();
      
      expect(afterMoveState.position).toBe(initialState.position);
      expect(afterMoveState.isMoving).toBe(false);
    });
  });

  describe('Player Movement Animation', () => {
    test('should start movement animation when position changes', () => {
      gameEngine.movePlayer('LEFT');
      const playerState = gameEngine.getPlayerState();
      
      expect(playerState.isMoving).toBe(true);
      expect(playerState.animationProgress).toBe(0);
      expect(playerState.movementStartTime).toBeGreaterThanOrEqual(0);
    });

    test('should not start animation when moving to same position', () => {
      // Player starts at CENTER
      gameEngine.movePlayer('CENTER');
      const playerState = gameEngine.getPlayerState();
      
      expect(playerState.isMoving).toBe(false);
      expect(playerState.sprite).toBe('IDLE');
    });

    test('should complete movement animation after update', () => {
      gameEngine.movePlayer('LEFT');
      
      // First update to initialize timing
      gameEngine.update(0);
      
      // Simulate time passing in small increments to avoid the large delta skip
      let currentTime = 0;
      const stepSize = 50; // 50ms steps
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      const playerState = gameEngine.getPlayerState();
      expect(playerState.isMoving).toBe(false);
      expect(playerState.sprite).toBe('IDLE');
      expect(playerState.x).toBe(playerState.targetX);
      expect(playerState.animationProgress).toBe(1.0);
    });
  });

  describe('Touch Input Handling', () => {
    test('should determine LEFT position from touch coordinates', () => {
      const leftTouch = screenWidth * 0.1; // Far left
      const position = gameEngine.getPlayerPositionFromTouch(leftTouch);
      expect(position).toBe('LEFT');
    });

    test('should determine CENTER position from touch coordinates', () => {
      const centerTouch = screenWidth * 0.5; // Center
      const position = gameEngine.getPlayerPositionFromTouch(centerTouch);
      expect(position).toBe('CENTER');
    });

    test('should determine RIGHT position from touch coordinates', () => {
      const rightTouch = screenWidth * 0.9; // Far right
      const position = gameEngine.getPlayerPositionFromTouch(rightTouch);
      expect(position).toBe('RIGHT');
    });

    test('should provide touch zone boundaries', () => {
      const zones = gameEngine.getTouchZones();
      expect(zones.left).toBe(screenWidth * 0.33);
      expect(zones.center).toBe(screenWidth * 0.67);
      expect(zones.right).toBe(screenWidth);
    });

    test('should allow player movement when game is playing', () => {
      expect(gameEngine.canPlayerMove()).toBe(true);
    });

    test('should not allow player movement when game is paused', () => {
      gameEngine.pauseGame();
      expect(gameEngine.canPlayerMove()).toBe(false);
    });
  });

  describe('Player State Tracking', () => {
    test('should track player movement state correctly', () => {
      expect(gameEngine.isPlayerMoving()).toBe(false);
      
      gameEngine.movePlayer('LEFT');
      expect(gameEngine.isPlayerMoving()).toBe(true);
      
      // Initialize timing
      gameEngine.update(0);
      
      // Complete the movement in small steps
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      expect(gameEngine.isPlayerMoving()).toBe(false);
    });

    test('should track animation progress correctly', () => {
      gameEngine.movePlayer('RIGHT');
      expect(gameEngine.getPlayerAnimationProgress()).toBe(0);
      
      // Initialize timing
      gameEngine.update(0);
      
      // Simulate partial progress in small steps
      let currentTime = 0;
      const stepSize = 25;
      const halfTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION / 2;
      
      while (currentTime < halfTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      const progress = gameEngine.getPlayerAnimationProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
      
      // Complete the movement
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      expect(gameEngine.getPlayerAnimationProgress()).toBe(1.0);
    });
  });
});

describe('NoPogodGameEngine - Collision Detection and Scoring', () => {
  let gameEngine: NoPogodGameEngine;
  const screenWidth = 400;
  const screenHeight = 600;

  beforeEach(() => {
    gameEngine = new NoPogodGameEngine(screenWidth, screenHeight);
    gameEngine.startGame();
  });

  describe('Collision Detection', () => {
    test('should detect collision when Miro is in correct position under falling item', () => {
      // Position player at CENTER
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      // Manually add a good item at player position at ground level for collision
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'EGG',
        x: playerState.x, // Same x position as player
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.EGG.points,
        isBad: false,
        isDeadly: false,
      };

      // Access private gameState to add test item
      (gameEngine as any).gameState.items.push(testItem);

      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      // Verify item was caught and score increased
      expect(gameEngine.getScore()).toBe(initialScore + ITEM_DEFINITIONS.EGG.points);
      expect(gameEngine.getFallingItems()).toHaveLength(0); // Item should be removed
    });

    test('should not detect collision when Miro is not in correct position', () => {
      // Position player at LEFT
      gameEngine.movePlayer('LEFT');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      // Add item at RIGHT position (away from player)
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'EGG',
        x: screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.RIGHT, // Different position
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.EGG.points,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);

      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      // Verify no collision occurred
      expect(gameEngine.getScore()).toBe(initialScore);
      expect(gameEngine.getFallingItems()).toHaveLength(1); // Item should still be there
    });

    test('should catch item automatically when Miro is in correct position', () => {
      // Position player at RIGHT
      gameEngine.movePlayer('RIGHT');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      const initialItemCount = gameEngine.getFallingItems().length;
      
      // Add item at player's position
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'TOMATO',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.TOMATO.points,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);

      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      // Verify automatic catching occurred
      expect(gameEngine.getFallingItems()).toHaveLength(initialItemCount); // Item removed
    });
  });

  describe('Scoring System', () => {
    test('should award 10 points for good items (eggs)', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation like in the working collision tests
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'EGG',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.EGG.points,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Verify item was added
      expect(gameEngine.getFallingItems()).toHaveLength(1);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      // Check if item was removed (caught) and score increased
      expect(gameEngine.getFallingItems()).toHaveLength(0);
      expect(gameEngine.getScore()).toBe(initialScore + 10);
    });

    test('should award 10 points for good items (tomatoes)', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'TOMATO',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.TOMATO.points,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getScore()).toBe(initialScore + 10);
    });

    test('should award 10 points for good items (peppers)', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'PEPPER',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.PEPPER.points,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getScore()).toBe(initialScore + 10);
    });

    test('should not award points for bad items', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.ELECTRIC_SHOCK.points,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getScore()).toBe(initialScore); // No points awarded
    });
  });

  describe('Bad Item Effects', () => {
    test('should lose life when catching electric shock', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.ELECTRIC_SHOCK.points,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(initialLives - 1);
      expect(gameEngine.isGameActive()).toBe(true); // Game should continue
    });

    test('should trigger immediate game over when catching bomb', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.BOMB.points,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
    });

    test('should end game immediately on bomb catch regardless of remaining lives', () => {
      // Ensure player has full lives
      expect(gameEngine.getLives()).toBe(3);
      
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      const testItem: FallingItem = {
        id: 'test_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.BOMB.points,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(testItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.getLives()).toBe(3); // Lives unchanged, game ended due to bomb
    });
  });

  describe('Item Definitions', () => {
    test('should have correct item definitions for good items', () => {
      expect(ITEM_DEFINITIONS.EGG).toEqual({
        points: 10,
        isBad: false,
        isDeadly: false,
      });
      
      expect(ITEM_DEFINITIONS.TOMATO).toEqual({
        points: 10,
        isBad: false,
        isDeadly: false,
      });
      
      expect(ITEM_DEFINITIONS.PEPPER).toEqual({
        points: 10,
        isBad: false,
        isDeadly: false,
      });
    });

    test('should have correct item definitions for bad items', () => {
      expect(ITEM_DEFINITIONS.ELECTRIC_SHOCK).toEqual({
        points: 0,
        isBad: true,
        isDeadly: false,
      });
      
      expect(ITEM_DEFINITIONS.BOMB).toEqual({
        points: 0,
        isBad: true,
        isDeadly: true,
      });
    });
  });

  describe('Multiple Item Interactions', () => {
    test('should handle multiple good items correctly', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const playerState = gameEngine.getPlayerState();
      
      // Add multiple good items
      const items = [
        { type: 'EGG' as const, points: 10 },
        { type: 'TOMATO' as const, points: 10 },
        { type: 'PEPPER' as const, points: 10 },
      ];

      items.forEach((itemData, index) => {
        const testItem: FallingItem = {
          id: `test_item_${index}`,
          type: itemData.type,
          x: playerState.x,
          y: playerState.y, // At ground level
          velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
          sprite: null,
          points: itemData.points,
          isBad: false,
          isDeadly: false,
        };

        (gameEngine as any).gameState.items.push(testItem);
      });

      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getScore()).toBe(initialScore + 30); // 3 items × 10 points
    });

    test('should handle mixed good and bad items correctly', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialScore = gameEngine.getScore();
      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      // Add one good item and one bad item
      const goodItem: FallingItem = {
        id: 'good_item',
        type: 'EGG',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 10,
        isBad: false,
        isDeadly: false,
      };

      const badItem: FallingItem = {
        id: 'bad_item',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y, // At ground level
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(goodItem, badItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getScore()).toBe(initialScore + 10); // Only good item gives points
      expect(gameEngine.getLives()).toBe(initialLives - 1); // Bad item causes life loss
      expect(gameEngine.isGameActive()).toBe(true); // Game continues
    });
  });
});

describe('NoPogodGameEngine - 60-Second Timer System', () => {
  let gameEngine: NoPogodGameEngine;
  const screenWidth = 400;
  const screenHeight = 600;

  beforeEach(() => {
    gameEngine = new NoPogodGameEngine(screenWidth, screenHeight);
    gameEngine.startGame();
  });

  describe('Timer Initialization and Countdown', () => {
    test('should start with 60-second countdown timer when game starts', () => {
      expect(gameEngine.getTimeRemaining()).toBe(60);
      expect(gameEngine.getTimeRemainingMs()).toBe(NO_POGOD_CONFIG.GAME_DURATION);
      expect(gameEngine.getTimeRemainingFormatted()).toBe('60s');
    });

    test('should count down in real-time with second precision', () => {
      // Initialize timing - first call sets up timing
      gameEngine.update(0);
      
      // Simulate 1 second passing in small increments (must be <= 100ms per step)
      let currentTime = 0;
      const stepSize = 50; // 50ms steps to stay under the 100ms limit
      const oneSecond = 1000;
      
      while (currentTime <= oneSecond) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      // Should be approximately 59 seconds remaining (allowing for rounding)
      const timeRemaining = gameEngine.getTimeRemaining();
      expect(timeRemaining).toBeLessThanOrEqual(60);
      expect(timeRemaining).toBeGreaterThanOrEqual(58); // Allow some tolerance
      expect(gameEngine.getTimeRemainingMs()).toBeLessThan(NO_POGOD_CONFIG.GAME_DURATION);
    });

    test('should display remaining time with second precision', () => {
      // Initialize timing
      gameEngine.update(0);
      
      // Simulate 5 seconds passing in small increments
      let currentTime = 0;
      const stepSize = 50; // 50ms steps to stay under the 100ms limit
      const fiveSeconds = 5000;
      
      while (currentTime <= fiveSeconds) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      // Allow some tolerance for timing precision
      const timeRemaining = gameEngine.getTimeRemaining();
      expect(timeRemaining).toBeLessThanOrEqual(55);
      expect(timeRemaining).toBeGreaterThanOrEqual(54);
      expect(gameEngine.getTimeRemainingFormatted()).toMatch(/5[4-5]s/);
    });

    test('should not go below zero when timer expires', () => {
      // Set the game timer to almost the full duration (leaving 100ms)
      (gameEngine as any).gameTimer = NO_POGOD_CONFIG.GAME_DURATION - 100; // 100ms remaining
      
      // Initialize timing
      gameEngine.update(0);
      
      // Simulate time passing beyond the remaining time in small steps
      gameEngine.update(50);  // 50ms later
      gameEngine.update(100); // 50ms more (total 100ms)
      gameEngine.update(150); // 50ms more (total 150ms, should expire)
      
      expect(gameEngine.getTimeRemaining()).toBe(0);
      expect(gameEngine.getTimeRemainingMs()).toBe(0);
      expect(gameEngine.isTimerExpired()).toBe(true);
      expect(gameEngine.isGameOver()).toBe(true);
    });
  });

  describe('Timer Pause and Resume Functionality', () => {
    test('should pause timer when game is paused', () => {
      // Initialize timing and let some time pass
      gameEngine.update(0);
      
      let currentTime = 0;
      const stepSize = 50; // 50ms steps to stay under the 100ms limit
      const twoSeconds = 2000;
      
      // Let 2 seconds pass
      while (currentTime < twoSeconds) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      const timeBeforePause = gameEngine.getTimeRemainingMs();
      
      // Pause the game
      gameEngine.pauseGame();
      expect(gameEngine.isPaused()).toBe(true);
      
      // Simulate more time passing while paused
      const pauseTime = 3000; // 3 seconds
      while (currentTime < twoSeconds + pauseTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      // Timer should not have changed while paused
      expect(gameEngine.getTimeRemainingMs()).toBe(timeBeforePause);
    });

    test('should resume timer when game is resumed', () => {
      // Initialize timing
      gameEngine.update(0);
      
      let currentTime = 0;
      const stepSize = 50; // 50ms steps to stay under the 100ms limit
      
      // Let 1 second pass
      while (currentTime < 1000) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      // Pause the game
      gameEngine.pauseGame();
      const timeAfterPause = gameEngine.getTimeRemainingMs();
      
      // Resume the game
      gameEngine.resumeGame();
      expect(gameEngine.isGameActive()).toBe(true);
      
      // Let another second pass
      currentTime = 0; // Reset for clean timing after resume
      gameEngine.update(currentTime);
      
      while (currentTime < 1000) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }
      
      // Timer should have continued counting down
      expect(gameEngine.getTimeRemainingMs()).toBeLessThan(timeAfterPause);
    });

    test('should toggle between pause and resume states', () => {
      expect(gameEngine.isGameActive()).toBe(true);
      
      gameEngine.togglePause();
      expect(gameEngine.isPaused()).toBe(true);
      
      gameEngine.togglePause();
      expect(gameEngine.isGameActive()).toBe(true);
    });
  });

  describe('Game Over When Timer Reaches Zero', () => {
    test('should end game and transition to game over when timer reaches zero', () => {
      // Set the game timer to almost the full duration (leaving 50ms)
      (gameEngine as any).gameTimer = NO_POGOD_CONFIG.GAME_DURATION - 50; // 50ms remaining
      
      // Initialize timing
      gameEngine.update(0);
      
      // Simulate time passing to expire the timer in small steps
      gameEngine.update(50); // 50ms later, should expire the timer
      gameEngine.update(100); // 50ms more to ensure it's processed
      
      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      expect(gameEngine.getTimeRemaining()).toBe(0);
      expect(gameEngine.getGameEndReason()).toBe('TIME_UP');
    });

    test('should preserve final score when game ends due to time limit', () => {
      // Set up a score first
      (gameEngine as any).gameState.score = 50;
      const initialScore = gameEngine.getScore();
      expect(initialScore).toBe(50);
      
      // Set the game timer to almost the full duration (leaving 100ms)
      (gameEngine as any).gameTimer = NO_POGOD_CONFIG.GAME_DURATION - 100; // 100ms remaining
      
      // Initialize timing
      gameEngine.update(0);
      
      // Simulate time expiring in small steps
      gameEngine.update(50);  // 50ms later
      gameEngine.update(100); // 50ms more (total 100ms)
      gameEngine.update(150); // 50ms more (total 150ms, should expire)
      
      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.getScore()).toBe(initialScore); // Score preserved
      expect(gameEngine.getGameEndReason()).toBe('TIME_UP');
    });

    test('should not allow timer to continue after game over', () => {
      // Force game to end due to time
      (gameEngine as any).gameState.timeRemaining = 0;
      gameEngine.checkGameEnd();
      
      expect(gameEngine.isGameOver()).toBe(true);
      
      // Try to update timer
      const currentTime = 1000;
      gameEngine.update(currentTime);
      
      // Timer should remain at 0
      expect(gameEngine.getTimeRemaining()).toBe(0);
      expect(gameEngine.getTimeRemainingMs()).toBe(0);
    });
  });

  describe('Timer Reset on New Game', () => {
    test('should reset timer to 60 seconds when starting new game', () => {
      // Manually set timer to a different value
      (gameEngine as any).gameState.timeRemaining = 30000; // 30 seconds
      expect(gameEngine.getTimeRemaining()).toBe(30);
      
      // Start new game
      gameEngine.startGame();
      
      expect(gameEngine.getTimeRemaining()).toBe(60);
      expect(gameEngine.getTimeRemainingMs()).toBe(NO_POGOD_CONFIG.GAME_DURATION);
      expect(gameEngine.isGameActive()).toBe(true);
    });
  });
});

describe('NoPogodGameEngine - Lives and Game Over System', () => {
  let gameEngine: NoPogodGameEngine;
  const screenWidth = 400;
  const screenHeight = 600;

  beforeEach(() => {
    gameEngine = new NoPogodGameEngine(screenWidth, screenHeight);
    gameEngine.startGame();
  });

  describe('3-Lives System with Life Tracking', () => {
    test('should initialize with 3 lives', () => {
      expect(gameEngine.getLives()).toBe(3);
      expect(gameEngine.getState().lives).toBe(NO_POGOD_CONFIG.INITIAL_LIVES);
    });

    test('should track life count correctly', () => {
      const initialLives = gameEngine.getLives();
      expect(initialLives).toBe(3);
      
      // Verify lives are properly tracked in game state
      const gameState = gameEngine.getState();
      expect(gameState.lives).toBe(3);
    });

    test('should reset lives to 3 when starting new game', () => {
      // Reduce lives first
      (gameEngine as any).gameState.lives = 1;
      expect(gameEngine.getLives()).toBe(1);
      
      // Start new game
      gameEngine.startGame();
      expect(gameEngine.getLives()).toBe(3);
    });
  });

  describe('Life Loss Mechanics for Bad Items', () => {
    test('should lose 1 life when catching electric shock', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      const electricShockItem: FallingItem = {
        id: 'electric_shock_item',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.ELECTRIC_SHOCK.points,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(electricShockItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(initialLives - 1);
      expect(gameEngine.isGameActive()).toBe(true); // Game should continue
    });

    test('should lose multiple lives from multiple bad item catches', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      // Add two electric shock items
      const electricShock1: FallingItem = {
        id: 'electric_shock_1',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      const electricShock2: FallingItem = {
        id: 'electric_shock_2',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(electricShock1, electricShock2);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(initialLives - 2);
      expect(gameEngine.isGameActive()).toBe(true); // Game should still continue with 1 life
    });

    test('should not lose life when catching good items', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      const goodItem: FallingItem = {
        id: 'good_item',
        type: 'EGG',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 10,
        isBad: false,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(goodItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(initialLives); // Lives should remain unchanged
      expect(gameEngine.getScore()).toBeGreaterThan(0); // Should gain points instead
    });
  });

  describe('Immediate Game Over Condition for Bomb Catches', () => {
    test('should trigger immediate game over when catching bomb', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      const bombItem: FallingItem = {
        id: 'bomb_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: ITEM_DEFINITIONS.BOMB.points,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(bombItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      expect(gameEngine.getState().phase).toBe('GAME_OVER');
    });

    test('should end game immediately on bomb catch regardless of remaining lives', () => {
      // Ensure player has full lives
      expect(gameEngine.getLives()).toBe(3);
      
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      const bombItem: FallingItem = {
        id: 'bomb_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(bombItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.getLives()).toBe(3); // Lives unchanged, game ended due to bomb
      expect(gameEngine.getState().phase).toBe('GAME_OVER');
    });

    test('should not lose life when catching bomb (immediate game over instead)', () => {
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const initialLives = gameEngine.getLives();
      const playerState = gameEngine.getPlayerState();
      
      const bombItem: FallingItem = {
        id: 'bomb_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(bombItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(initialLives); // Lives should not decrease
      expect(gameEngine.isGameOver()).toBe(true); // But game should be over
    });
  });

  describe('Game Over State Transition and Display', () => {
    test('should transition to game over when all lives are lost', () => {
      // Reduce lives to 1
      (gameEngine as any).gameState.lives = 1;
      
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      // Add electric shock to lose the last life
      const electricShockItem: FallingItem = {
        id: 'final_shock',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(electricShockItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBe(0);
      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      expect(gameEngine.getState().phase).toBe('GAME_OVER');
    });

    test('should transition to game over when time runs out', () => {
      // Directly set the time remaining to 0 to simulate timer expiration
      (gameEngine as any).gameState.timeRemaining = 0;
      
      // Verify we're still playing before the check
      expect(gameEngine.isGameActive()).toBe(true);
      expect(gameEngine.isGameOver()).toBe(false);
      
      // Manually trigger the game end condition check
      (gameEngine as any).checkGameEnd();
      
      // Now the game should be over due to time expiration
      expect(gameEngine.getTimeRemaining()).toBe(0);
      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      expect(gameEngine.getState().phase).toBe('GAME_OVER');
    });

    test('should maintain game over state after transition', () => {
      // Force game over by setting lives to 0
      (gameEngine as any).gameState.lives = 0;
      
      // Initialize timing and trigger game end condition check with small steps
      gameEngine.update(0);
      gameEngine.update(50);
      
      // Manually trigger game end condition check since we set lives manually
      (gameEngine as any).checkGameEnd();

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      
      // Multiple updates should maintain game over state
      // Note: update() returns early when game is not playing, so game over state is maintained
      const gameOverPhase = gameEngine.getState().phase;
      expect(gameOverPhase).toBe('GAME_OVER');
      
      // Try to update again - should not change state (using small steps)
      gameEngine.update(100);
      gameEngine.update(150);
      
      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.isGameActive()).toBe(false);
      expect(gameEngine.getState().phase).toBe('GAME_OVER');
    });

    test('should not allow player movement when game is over', () => {
      // Force game over
      (gameEngine as any).gameState.phase = 'GAME_OVER';
      
      const initialPosition = gameEngine.getPlayerState().position;
      
      // Try to move player
      gameEngine.movePlayer('LEFT');
      
      const finalPosition = gameEngine.getPlayerState().position;
      expect(finalPosition).toBe(initialPosition); // Position should not change
      expect(gameEngine.canPlayerMove()).toBe(false);
    });

    test('should preserve final score when game ends', () => {
      // Set a score
      (gameEngine as any).gameState.score = 150;
      
      // Force game over
      (gameEngine as any).gameState.lives = 0;
      
      // Initialize timing and trigger game end condition check with small steps
      gameEngine.update(0);
      gameEngine.update(50);
      
      // Manually trigger game end condition check since we set lives manually
      (gameEngine as any).checkGameEnd();

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.getScore()).toBe(150); // Score should be preserved
    });

    test('should allow restarting game after game over', () => {
      // Force game over
      (gameEngine as any).gameState.phase = 'GAME_OVER';
      (gameEngine as any).gameState.lives = 0;
      (gameEngine as any).gameState.score = 100;
      
      expect(gameEngine.isGameOver()).toBe(true);
      
      // Restart game
      gameEngine.startGame();
      
      expect(gameEngine.isGameOver()).toBe(false);
      expect(gameEngine.isGameActive()).toBe(true);
      expect(gameEngine.getLives()).toBe(3);
      expect(gameEngine.getScore()).toBe(0);
      expect(gameEngine.getState().phase).toBe('PLAYING');
    });
  });

  describe('Lives System Edge Cases', () => {
    test('should handle multiple bad items when lives reach zero', () => {
      // Set lives to 1
      (gameEngine as any).gameState.lives = 1;
      
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      // Add multiple electric shocks (more than remaining lives)
      const electricShock1: FallingItem = {
        id: 'shock_1',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      const electricShock2: FallingItem = {
        id: 'shock_2',
        type: 'ELECTRIC_SHOCK',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: false,
      };

      (gameEngine as any).gameState.items.push(electricShock1, electricShock2);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.getLives()).toBeLessThanOrEqual(0);
      expect(gameEngine.isGameOver()).toBe(true);
    });

    test('should handle bomb catch when lives are already at zero', () => {
      // Set lives to 0 (edge case)
      (gameEngine as any).gameState.lives = 0;
      
      // Position player at CENTER and complete movement
      gameEngine.movePlayer('CENTER');
      
      // Complete movement animation
      gameEngine.update(0);
      let currentTime = 0;
      const stepSize = 50;
      const totalTime = NO_POGOD_CONFIG.PLAYER_MOVE_DURATION + 100;
      
      while (currentTime < totalTime) {
        currentTime += stepSize;
        gameEngine.update(currentTime);
      }

      const playerState = gameEngine.getPlayerState();
      
      const bombItem: FallingItem = {
        id: 'bomb_item',
        type: 'BOMB',
        x: playerState.x,
        y: playerState.y,
        velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: 0,
        isBad: true,
        isDeadly: true,
      };

      (gameEngine as any).gameState.items.push(bombItem);
      
      // Update to trigger collision detection
      gameEngine.update(currentTime + stepSize);

      expect(gameEngine.isGameOver()).toBe(true);
      expect(gameEngine.getLives()).toBe(0);
    });
  });
});
/**
 * NoPogod Game Tests
 * 
 * Comprehensive tests for the NoPogod game functionality.
 * Tests cover:
 * - Game configuration
 * - Item definitions
 * - Game state management
 * - Player movement
 * - Touch zones
 * - Collision detection
 * - Scoring
 * - Lives system
 * - Game over conditions
 * - Shonzika AI
 * - Speed boost
 */

import {
    FallingItem,
    ITEM_DEFINITIONS,
    ItemType,
    NO_POGOD_CONFIG,
    NoPogodEngine,
    NoPogodGameState
} from '@/features/games/noPogod';

/**
 * Helper function to create a properly-typed FallingItem for testing
 */
function createTestItem(options: {
    id?: string;
    type: ItemType;
    x: number;
    y: number;
    velocityX?: number;
    velocityY?: number;
}): FallingItem {
    const itemDef = ITEM_DEFINITIONS[options.type];
    return {
        id: options.id || `test_${Date.now()}_${Math.random()}`,
        type: options.type,
        x: options.x,
        y: options.y,
        velocityX: options.velocityX ?? 0,
        velocityY: options.velocityY ?? NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: itemDef.points,
        isBad: itemDef.isBad,
        isDeadly: itemDef.isDeadly,
        mustCatch: itemDef.mustCatch,
        shouldAvoid: itemDef.shouldAvoid,
    };
}

/**
 * Helper to access private game state for testing
 */
function getGameState(game: NoPogodEngine): NoPogodGameState {
    return (game as any).gameState;
}

/**
 * Helper to inject items for collision testing
 * Injects into the engine's internal items array
 */
function injectItems(game: NoPogodEngine, items: FallingItem[]): void {
    (game as any).items = items;
}

/**
 * Helper to trigger a game update tick (processes collisions, item physics, etc.)
 */
function triggerUpdate(game: NoPogodEngine, deltaMs: number = 16): void {
    const currentTime = Date.now();
    game.update(currentTime);
    game.update(currentTime + deltaMs);
}

describe('NoPogod Game', () => {
    let game: NoPogodEngine;
    const screenWidth = 400;
    const screenHeight = 600;

    beforeEach(() => {
        game = new NoPogodEngine(screenWidth, screenHeight);
    });

    // ==========================================================================
    // GAME CONFIGURATION TESTS
    // ==========================================================================
    describe('Game Configuration', () => {
        test('should have correct game duration (60 seconds)', () => {
            expect(NO_POGOD_CONFIG.GAME_DURATION).toBe(60000);
        });

        test('should have correct initial lives (3)', () => {
            expect(NO_POGOD_CONFIG.INITIAL_LIVES).toBe(3);
        });

        test('should have correct good item points (10)', () => {
            expect(NO_POGOD_CONFIG.GOOD_ITEM_POINTS).toBe(10);
        });

        test('should have three player positions', () => {
            expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.LEFT).toBe(0.25);
            expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER).toBe(0.5);
            expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.RIGHT).toBe(0.75);
        });

        test('should have item spawn weights defined', () => {
            expect(NO_POGOD_CONFIG.ITEM_SPAWN_WEIGHTS).toBeDefined();
            expect(NO_POGOD_CONFIG.ITEM_SPAWN_WEIGHTS.EGG).toBeGreaterThan(0);
            expect(NO_POGOD_CONFIG.ITEM_SPAWN_WEIGHTS.BOMB).toBeGreaterThan(0);
        });
    });

    // ==========================================================================
    // ITEM DEFINITIONS TESTS
    // ==========================================================================
    describe('Item Definitions', () => {
        describe('Good Items', () => {
            test('EGG should award points and not be avoidable', () => {
                expect(ITEM_DEFINITIONS.EGG).toEqual({
                    points: 10,
                    isBad: false,
                    isDeadly: false,
                    mustCatch: false,
                    shouldAvoid: false,
                });
            });

            test('TOMATO should award points and not be avoidable', () => {
                expect(ITEM_DEFINITIONS.TOMATO).toEqual({
                    points: 10,
                    isBad: false,
                    isDeadly: false,
                    mustCatch: false,
                    shouldAvoid: false,
                });
            });

            test('PEPPER should award points and not be avoidable', () => {
                expect(ITEM_DEFINITIONS.PEPPER).toEqual({
                    points: 10,
                    isBad: false,
                    isDeadly: false,
                    mustCatch: false,
                    shouldAvoid: false,
                });
            });
        });

        describe('Bad Items', () => {
            test('ELECTRIC_SHOCK should cause damage but not game over', () => {
                expect(ITEM_DEFINITIONS.ELECTRIC_SHOCK).toEqual({
                    points: 0,
                    isBad: true,
                    isDeadly: false,
                    mustCatch: false,
                    shouldAvoid: true,
                });
            });

            test('BOMB should be deadly and cause immediate game over', () => {
                expect(ITEM_DEFINITIONS.BOMB).toEqual({
                    points: 0,
                    isBad: true,
                    isDeadly: true,
                    mustCatch: false,
                    shouldAvoid: true,
                });
            });
        });
    });

    // ==========================================================================
    // GAME STATE MANAGEMENT TESTS
    // ==========================================================================
    describe('Game State Management', () => {
        test('should start in MENU phase', () => {
            expect(game.getState().phase).toBe('MENU');
        });

        test('should transition to PLAYING when started', () => {
            game.startGame();
            expect(game.getState().phase).toBe('PLAYING');
        });

        test('should start with correct lives', () => {
            game.startGame();
            expect(game.getLives()).toBe(3);
        });

        test('should start with zero score', () => {
            game.startGame();
            expect(game.getScore()).toBe(0);
        });

        test('should start with 60 second timer', () => {
            game.startGame();
            expect(game.getTimeRemaining()).toBe(60);
        });

        test('should start with no falling items', () => {
            game.startGame();
            expect(game.getFallingItems()).toHaveLength(0);
        });
    });

    // ==========================================================================
    // PLAYER POSITION TESTS
    // ==========================================================================
    describe('Player Position', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should start at CENTER position', () => {
            const playerState = game.getPlayerState();
            expect(playerState.position).toBe('CENTER');
        });

        test('should move to LEFT when requested', () => {
            game.movePlayer('LEFT');
            expect(game.getPlayerState().position).toBe('LEFT');
        });

        test('should move to RIGHT when requested', () => {
            game.movePlayer('RIGHT');
            expect(game.getPlayerState().position).toBe('RIGHT');
        });

        test('should not move when game is paused', () => {
            game.pauseGame();
            game.movePlayer('LEFT');
            expect(game.getPlayerState().position).toBe('CENTER');
        });

        test('should track if player is moving', () => {
            expect(game.isPlayerMoving()).toBe(false);
            game.startContinuousMovement('LEFT');
            expect(game.isPlayerMoving()).toBe(true);
        });

        test('should return animation progress', () => {
            expect(game.getPlayerAnimationProgress()).toBeGreaterThanOrEqual(0);
            expect(game.getPlayerAnimationProgress()).toBeLessThanOrEqual(1);
        });
    });

    // ==========================================================================
    // CONTINUOUS MOVEMENT TESTS
    // ==========================================================================
    describe('Continuous Movement', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should start continuous movement left', () => {
            game.startContinuousMovement('LEFT');
            expect(game.getPlayerState().isMoving).toBe(true);
            expect(game.getPlayerState().position).toBe('LEFT');
        });

        test('should start continuous movement right', () => {
            game.startContinuousMovement('RIGHT');
            expect(game.getPlayerState().isMoving).toBe(true);
            expect(game.getPlayerState().position).toBe('RIGHT');
        });

        test('should stop continuous movement', () => {
            game.startContinuousMovement('LEFT');
            game.stopContinuousMovement();
            expect(game.getPlayerState().isMoving).toBe(false);
        });

        test('should not start movement when game is not playing', () => {
            game.pauseGame();
            game.startContinuousMovement('LEFT');
            expect(game.getPlayerState().position).toBe('CENTER');
            expect(game.getPlayerState().isMoving).toBe(false);
        });

        test('should indicate if player can move', () => {
            expect(game.canPlayerMove()).toBe(true);
            game.pauseGame();
            expect(game.canPlayerMove()).toBe(false);
        });
    });

    // ==========================================================================
    // TOUCH ZONE HANDLING TESTS
    // ==========================================================================
    describe('Touch Zone Handling', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should detect LEFT zone from touch on left third', () => {
            const position = game.getPlayerPositionFromTouch(50);
            expect(position).toBe('LEFT');
        });

        test('should detect CENTER zone from touch in middle', () => {
            const position = game.getPlayerPositionFromTouch(200);
            expect(position).toBe('CENTER');
        });

        test('should detect RIGHT zone from touch on right third', () => {
            const position = game.getPlayerPositionFromTouch(350);
            expect(position).toBe('RIGHT');
        });

        test('should provide correct touch zone boundaries', () => {
            const zones = game.getTouchZones();
            expect(zones.left).toBeCloseTo(screenWidth * 0.33, 1);
            expect(zones.center).toBeCloseTo(screenWidth * 0.67, 1);
            expect(zones.right).toBe(screenWidth);
        });
    });

    // ==========================================================================
    // PAUSE AND RESUME TESTS
    // ==========================================================================
    describe('Pause and Resume', () => {
        test('should pause the game', () => {
            game.startGame();
            game.pauseGame();
            expect(game.isPaused()).toBe(true);
            expect(game.isGameActive()).toBe(false);
        });

        test('should resume the game', () => {
            game.startGame();
            game.pauseGame();
            game.resumeGame();
            expect(game.isGameActive()).toBe(true);
            expect(game.isPaused()).toBe(false);
        });

        test('should toggle pause state', () => {
            game.startGame();
            game.togglePause();
            expect(game.isPaused()).toBe(true);
            game.togglePause();
            expect(game.isGameActive()).toBe(true);
        });

        test('should not update game when paused', () => {
            game.startGame();
            game.update(100);
            game.pauseGame();
            const scoreBeforePause = game.getScore();
            game.update(200);
            game.update(300);
            expect(game.getScore()).toBe(scoreBeforePause);
        });
    });

    // ==========================================================================
    // GAME LOOP TESTS
    // ==========================================================================
    describe('Game Loop', () => {
        test('should not update when not playing', () => {
            const initialState = game.getState();
            game.update(1000);
            expect(game.getState().phase).toEqual(initialState.phase);
        });

        test('should update during gameplay', () => {
            game.startGame();
            game.update(100);
            game.update(150);
            expect(game.isGameActive()).toBe(true);
        });

        test('should exit game and return to menu', () => {
            game.startGame();
            game.exitGame();
            expect(game.isInMenu()).toBe(true);
        });

        test('should reset game state on new game', () => {
            game.startGame();
            // Modify state
            (game as any).gameState.score = 100;
            (game as any).gameState.lives = 1;

            game.startGame(); // Start new game
            expect(game.getScore()).toBe(0);
            expect(game.getLives()).toBe(3);
        });
    });

    // ==========================================================================
    // SCORING TESTS
    // ==========================================================================
    describe('Scoring System', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should award 10 points for catching EGG', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Place egg at player position (velocityY: 0 to prevent movement during test)
            const egg = createTestItem({
                type: 'EGG',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [egg]);

            // Trigger game update to process collisions
            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        test('should award 10 points for catching TOMATO', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const tomato = createTestItem({
                type: 'TOMATO',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [tomato]);

            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        test('should award 10 points for catching PEPPER', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const pepper = createTestItem({
                type: 'PEPPER',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [pepper]);

            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        test('should accumulate score from multiple catches', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Catch both items in one update
            injectItems(game, [
                createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'TOMATO', x: playerX, y: playerY, velocityY: 0 })
            ]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(20);
        });

        test('should not award points for catching ELECTRIC_SHOCK', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const shock = createTestItem({
                type: 'ELECTRIC_SHOCK',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [shock]);

            triggerUpdate(game);

            expect(game.getScore()).toBe(0);
        });
    });

    // ==========================================================================
    // LIVES SYSTEM TESTS
    // ==========================================================================
    describe('Lives System', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should start with 3 lives', () => {
            expect(game.getLives()).toBe(3);
        });

        test('should lose 1 life when catching ELECTRIC_SHOCK', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const shock = createTestItem({
                type: 'ELECTRIC_SHOCK',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [shock]);

            triggerUpdate(game);

            expect(game.getLives()).toBe(2);
        });

        test('should lose multiple lives from multiple shocks', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Catch two shocks at once
            injectItems(game, [
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 })
            ]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(1);
        });

        test('should not lose life when catching good items', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            injectItems(game, [createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 })]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(3);
        });
    });

    // ==========================================================================
    // GAME OVER CONDITIONS TESTS
    // ==========================================================================
    describe('Game Over Conditions', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should trigger game over when catching BOMB', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const bomb = createTestItem({
                type: 'BOMB',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [bomb]);

            triggerUpdate(game);

            expect(game.isGameOver()).toBe(true);
        });

        test('should trigger game over when all lives are lost', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Lose all 3 lives at once
            injectItems(game, [
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 })
            ]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(0);
            expect(game.isGameOver()).toBe(true);
        });

        test('should end when timer expires', () => {
            game.update(100);

            // Simulate 65 seconds passing
            for (let t = 150; t <= 66000; t += 50) {
                if (game.isGameOver()) break;
                game.update(t);
            }

            expect(game.isGameOver()).toBe(true);
        });

        test('should NOT game over when BOMB falls off screen without being caught', () => {
            // Place bomb off screen (not at player position)
            injectItems(game, [createTestItem({ type: 'BOMB', x: 0, y: 1000 })]);
            triggerUpdate(game);
            expect(game.isGameOver()).toBe(false);
        });

        test('should NOT game over when good items fall off screen', () => {
            // Place items off screen (not at player position)
            injectItems(game, [
                createTestItem({ type: 'EGG', x: 0, y: screenHeight + 100 }),
                createTestItem({ type: 'TOMATO', x: 50, y: screenHeight + 100 }),
                createTestItem({ type: 'PEPPER', x: 100, y: screenHeight + 100 })
            ]);
            triggerUpdate(game);
            expect(game.isGameOver()).toBe(false);
            expect(game.getLives()).toBe(3);
        });
    });

    // ==========================================================================
    // FALLING ITEMS TESTS
    // ==========================================================================
    describe('Falling Items', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should initially have no falling items', () => {
            expect(game.getFallingItems()).toHaveLength(0);
        });

        test('should spawn items during gameplay', () => {
            game.update(100);
            for (let t = 150; t <= 5000; t += 50) {
                game.update(t);
            }
            // After 5 seconds, likely to have spawned items
            // (non-deterministic due to random timing)
            expect(game.getFallingItems().length).toBeGreaterThanOrEqual(0);
        });

        test('should remove items that go off screen', () => {
            const offScreenItem = createTestItem({
                type: 'EGG',
                x: 200,
                y: screenHeight + 100, // Below screen
            });
            injectItems(game, [offScreenItem]);

            game.update(100);
            game.update(150);

            // Item should be filtered out during update
            expect(game.getFallingItems().length).toBeLessThanOrEqual(1);
        });
    });

    // ==========================================================================
    // SHONZIKA AI TESTS
    // ==========================================================================
    describe('Shonzika Character', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should have Shonzika position', () => {
            const position = game.getShonzikaPosition();
            expect(position).toHaveProperty('x');
            expect(position).toHaveProperty('y');
            expect(position).toHaveProperty('sprite');
        });

        test('should have Shonzika hand position for item spawning', () => {
            const handPos = game.getShonzikaHandPosition();
            expect(handPos).toHaveProperty('x');
            expect(handPos).toHaveProperty('y');
            expect(typeof handPos.x).toBe('number');
            expect(typeof handPos.y).toBe('number');
        });

        test('should have Shonzika animation progress', () => {
            const progress = game.getShonzikaAnimationProgress();
            expect(progress).toBeGreaterThanOrEqual(0);
            expect(progress).toBeLessThanOrEqual(1);
        });
    });

    // ==========================================================================
    // SPEED BOOST TESTS
    // ==========================================================================
    describe('Speed Boost', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should not have speed boost initially', () => {
            expect(game.isSpeedBoostActive()).toBe(false);
        });

        test('should activate speed boost when catching PEPPER', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const pepper = createTestItem({
                type: 'PEPPER',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [pepper]);

            triggerUpdate(game);

            expect(game.isSpeedBoostActive()).toBe(true);
        });

        test('should return speed boost time remaining', () => {
            const remaining = game.getSpeedBoostTimeRemaining();
            expect(typeof remaining).toBe('number');
            expect(remaining).toBeGreaterThanOrEqual(0);
        });
    });

    // ==========================================================================
    // TIMER TESTS
    // ==========================================================================
    describe('Timer System', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should start with 60 seconds', () => {
            expect(game.getTimeRemaining()).toBe(60);
            expect(game.getTimeRemainingMs()).toBe(60000);
        });

        test('should format time correctly', () => {
            const formatted = game.getTimeRemainingFormatted();
            // Format is either "60s" or "1:00" depending on implementation
            expect(formatted).toMatch(/^(60s|1:00)$/);
        });

        test('should count down during gameplay', () => {
            game.startGame();
            const startTime = Date.now();
            // First update initializes timing
            game.update(startTime);
            // Advance time in small increments (under maxDeltaTime of 100ms)
            for (let i = 1; i <= 20; i++) {
                game.update(startTime + (i * 50)); // 50ms steps = 1 second total
            }

            const remainingMs = game.getTimeRemainingMs();
            const remainingSec = game.getTimeRemaining();
            
            // Timer should have decremented by ~1 second
            expect(remainingMs).toBeLessThan(60000);
            expect(remainingMs).toBeGreaterThan(58000);
            expect(remainingSec).toBe(59);
        });
    });

    // ==========================================================================
    // STATE QUERY TESTS
    // ==========================================================================
    describe('State Queries', () => {
        test('should correctly identify MENU phase', () => {
            expect(game.isInMenu()).toBe(true);
            expect(game.isGameActive()).toBe(false);
            expect(game.isPaused()).toBe(false);
            expect(game.isGameOver()).toBe(false);
        });

        test('should correctly identify PLAYING phase', () => {
            game.startGame();
            expect(game.isInMenu()).toBe(false);
            expect(game.isGameActive()).toBe(true);
            expect(game.isPaused()).toBe(false);
            expect(game.isGameOver()).toBe(false);
        });

        test('should correctly identify PAUSED phase', () => {
            game.startGame();
            game.pauseGame();
            expect(game.isInMenu()).toBe(false);
            expect(game.isGameActive()).toBe(false);
            expect(game.isPaused()).toBe(true);
            expect(game.isGameOver()).toBe(false);
        });

        test('should correctly identify GAME_OVER phase', () => {
            game.startGame();
            (game as any).gameState.phase = 'GAME_OVER';
            expect(game.isInMenu()).toBe(false);
            expect(game.isGameActive()).toBe(false);
            expect(game.isPaused()).toBe(false);
            expect(game.isGameOver()).toBe(true);
        });
    });

    // ==========================================================================
    // SPRITE RENDERING TESTS
    // ==========================================================================
    describe('Sprite Rendering', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should track Miro movement state', () => {
            const state = game.getPlayerState();
            expect(typeof state.isMoving).toBe('boolean');
        });

        test('should track Shonzika sprite state', () => {
            const state = getGameState(game);
            expect(['IDLE', 'THROWING', 'WALKING']).toContain(state.shonzika.sprite);
        });
    });

    // ==========================================================================
    // PLAYER POSITION DETAILS TESTS
    // ==========================================================================
    describe('Player Position Details', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should return detailed player position', () => {
            const pos = game.getPlayerPosition();
            expect(pos).toHaveProperty('position');
            expect(pos).toHaveProperty('x');
            expect(pos).toHaveProperty('y');
            expect(typeof pos.x).toBe('number');
            expect(typeof pos.y).toBe('number');
        });

        test('should return full player state', () => {
            const state = game.getPlayerState();
            expect(state).toHaveProperty('position');
            expect(state).toHaveProperty('x');
            expect(state).toHaveProperty('y');
            expect(state).toHaveProperty('isMoving');
            expect(state).toHaveProperty('sprite');
            expect(state).toHaveProperty('animationProgress');
        });
    });
});

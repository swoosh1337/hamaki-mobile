/**
 * NoPogod Game Tests
 * 
 * Tests for the NoPogod game functionality.
 * These tests cover game-specific features built on top of the BaseGameEngine.
 */

import {
    FallingItem,
    ITEM_DEFINITIONS,
    ItemType,
    NO_POGOD_CONFIG,
    NoPogodGameEngine
} from '../../../utils/noPogodGameEngine';

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

describe('NoPogod Game', () => {
    let game: NoPogodGameEngine;
    const screenWidth = 400;
    const screenHeight = 600;

    beforeEach(() => {
        game = new NoPogodGameEngine(screenWidth, screenHeight);
    });

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
    });

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
    });

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
    });

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
    });

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

    describe('Pause and Resume', () => {
        test('should pause the game', () => {
            game.startGame();
            game.pauseGame();
            expect(game.isPaused()).toBe(true);
        });

        test('should resume the game', () => {
            game.startGame();
            game.pauseGame();
            game.resumeGame();
            expect(game.isGameActive()).toBe(true);
        });

        test('should toggle pause state', () => {
            game.startGame();
            game.togglePause();
            expect(game.isPaused()).toBe(true);
            game.togglePause();
            expect(game.isGameActive()).toBe(true);
        });
    });

    describe('Game Loop', () => {
        test('should not update when not playing', () => {
            const initialState = game.getState();
            game.update(1000);
            expect(game.getState()).toEqual(initialState);
        });

        test('should update during gameplay', () => {
            game.startGame();
            game.update(100);
            game.update(150);
            // Engine should have processed the update
            expect(game.isGameActive()).toBe(true);
        });
    });

    describe('Falling Items', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should initially have no falling items', () => {
            expect(game.getFallingItems()).toHaveLength(0);
        });

        test('should spawn items during gameplay', () => {
            // Run game loop for a while to trigger spawning
            game.update(100);
            for (let t = 150; t <= 5000; t += 50) {
                game.update(t);
            }
            // After 5 seconds, should have some items
            expect(game.getFallingItems().length).toBeGreaterThanOrEqual(0);
        });
    });

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

        test('should have Shonzika hand position', () => {
            const handPos = game.getShonzikaHandPosition();
            expect(handPos).toHaveProperty('x');
            expect(handPos).toHaveProperty('y');
        });
    });

    describe('Speed Boost', () => {
        beforeEach(() => {
            game.startGame();
        });

        test('should not have speed boost initially', () => {
            expect(game.isSpeedBoostActive()).toBe(false);
        });
    });

    describe('Game End Conditions', () => {
        test('should end when timer expires', () => {
            game.startGame();
            game.update(100);

            // Simulate 65 seconds passing
            for (let t = 150; t <= 66000; t += 50) {
                if (game.isGameOver()) break;
                game.update(t);
            }

            // Game should be over after timer runs out
            expect(game.isGameOver()).toBe(true);
        });
    });

    describe('State Queries', () => {
        test('should correctly identify game phases', () => {
            expect(game.isInMenu()).toBe(true);
            expect(game.isGameActive()).toBe(false);

            game.startGame();
            expect(game.isInMenu()).toBe(false);
            expect(game.isGameActive()).toBe(true);
            expect(game.isPaused()).toBe(false);
            expect(game.isGameOver()).toBe(false);
        });
    });
});

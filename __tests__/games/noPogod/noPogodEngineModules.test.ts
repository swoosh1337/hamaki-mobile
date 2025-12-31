/**
 * NoPogod Engine Tests
 * 
 * Tests for the refactored NoPogod game engine that extends BaseGameEngine.
 * These tests verify that the new modular architecture works correctly.
 */

import { NoPogodEngine, SCORING } from '../../../features/games/noPogod';
import * as CollisionSystem from '../../../features/games/noPogod/engine/CollisionSystem';
import * as ItemSpawner from '../../../features/games/noPogod/engine/ItemSpawner';
import * as PlayerController from '../../../features/games/noPogod/engine/PlayerController';
import * as ShonzikaAI from '../../../features/games/noPogod/engine/ShonzikaAI';

describe('NoPogod Engine (Refactored)', () => {
    const screenWidth = 400;
    const screenHeight = 600;

    describe('NoPogodEngine Class', () => {
        let engine: NoPogodEngine;

        beforeEach(() => {
            engine = new NoPogodEngine(screenWidth, screenHeight);
        });

        test('should initialize in MENU phase', () => {
            expect(engine.getState().phase).toBe('MENU');
        });

        test('should transition to PLAYING on start', () => {
            engine.startGame();
            expect(engine.getState().phase).toBe('PLAYING');
        });

        test('should have correct initial lives', () => {
            engine.startGame();
            expect(engine.getLives()).toBe(SCORING.INITIAL_LIVES);
        });

        test('should have correct initial score', () => {
            engine.startGame();
            expect(engine.getScore()).toBe(0);
        });

        test('should handle pause and resume', () => {
            engine.startGame();
            engine.pauseGame();
            expect(engine.isPaused()).toBe(true);
            engine.resumeGame();
            expect(engine.isGameActive()).toBe(true);
        });

        test('should return player state', () => {
            const state = engine.getPlayerState();
            expect(state).toHaveProperty('position');
            expect(state).toHaveProperty('x');
            expect(state).toHaveProperty('y');
        });

        test('should return Shonzika position', () => {
            const pos = engine.getShonzikaPosition();
            expect(pos).toHaveProperty('x');
            expect(pos).toHaveProperty('y');
            expect(pos).toHaveProperty('sprite');
        });

        test('should move player', () => {
            engine.startGame();
            engine.movePlayer('LEFT');
            expect(engine.getPlayerState().position).toBe('LEFT');
        });
    });
});

describe('PlayerController Module', () => {
    const screenWidth = 400;
    const screenHeight = 600;

    describe('createInitialPlayerState', () => {
        test('should create player at CENTER position', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            expect(state.position).toBe('CENTER');
        });

        test('should set correct X coordinate for CENTER', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            expect(state.x).toBe(screenWidth * 0.5);
        });

        test('should not be moving initially', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            expect(state.isMoving).toBe(false);
        });

        test('should have no speed boost initially', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            expect(state.speedBoostActive).toBe(false);
        });
    });

    describe('getPositionX', () => {
        test('should return correct X for LEFT', () => {
            const x = PlayerController.getPositionX('LEFT', screenWidth);
            expect(x).toBe(screenWidth * 0.25);
        });

        test('should return correct X for CENTER', () => {
            const x = PlayerController.getPositionX('CENTER', screenWidth);
            expect(x).toBe(screenWidth * 0.5);
        });

        test('should return correct X for RIGHT', () => {
            const x = PlayerController.getPositionX('RIGHT', screenWidth);
            expect(x).toBe(screenWidth * 0.75);
        });
    });

    describe('movePlayer', () => {
        test('should update position to LEFT', () => {
            const initial = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const moved = PlayerController.movePlayer(initial, 'LEFT', screenWidth, Date.now());
            expect(moved.position).toBe('LEFT');
        });

        test('should start moving animation', () => {
            const initial = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const moved = PlayerController.movePlayer(initial, 'LEFT', screenWidth, Date.now());
            expect(moved.isMoving).toBe(true);
        });

        test('should not move if already at position', () => {
            const initial = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const moved = PlayerController.movePlayer(initial, 'CENTER', screenWidth, Date.now());
            expect(moved).toBe(initial);
        });
    });

    describe('getPositionFromTouch', () => {
        test('should return LEFT for touch in left third', () => {
            const pos = PlayerController.getPositionFromTouch(50, screenWidth);
            expect(pos).toBe('LEFT');
        });

        test('should return CENTER for touch in middle', () => {
            const pos = PlayerController.getPositionFromTouch(200, screenWidth);
            expect(pos).toBe('CENTER');
        });

        test('should return RIGHT for touch in right third', () => {
            const pos = PlayerController.getPositionFromTouch(350, screenWidth);
            expect(pos).toBe('RIGHT');
        });
    });

    describe('getTouchZones', () => {
        test('should return correct zone boundaries', () => {
            const zones = PlayerController.getTouchZones(screenWidth);
            expect(zones.left).toBeCloseTo(screenWidth * 0.33);
            expect(zones.center).toBeCloseTo(screenWidth * 0.67);
            expect(zones.right).toBe(screenWidth);
        });
    });

    describe('activateSlowdown', () => {
        test('should activate slowdown when no speed boost', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const slowed = PlayerController.activateSlowdown(state, Date.now());
            expect(slowed.slowdownActive).toBe(true);
        });

        test('should set slowdown end time', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const now = Date.now();
            const slowed = PlayerController.activateSlowdown(state, now);
            expect(slowed.slowdownEndTime).toBeGreaterThan(now);
        });

        test('should negate speed boost instead of slowing when boosted', () => {
            let state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            // First activate speed boost
            state = PlayerController.activateSpeedBoost(state, Date.now());
            expect(state.speedBoostActive).toBe(true);

            // Then activate slowdown (from shocker)
            const slowed = PlayerController.activateSlowdown(state, Date.now());

            // Speed boost should be removed, but no slowdown applied
            expect(slowed.speedBoostActive).toBe(false);
            expect(slowed.slowdownActive).toBe(false);
        });
    });

    describe('updateSlowdown', () => {
        test('should keep slowdown active before end time', () => {
            let state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const now = Date.now();
            state = PlayerController.activateSlowdown(state, now);

            // Update 1 second later (should still be active)
            const updated = PlayerController.updateSlowdown(state, now + 1000);
            expect(updated.slowdownActive).toBe(true);
        });

        test('should deactivate slowdown after end time', () => {
            let state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const now = Date.now();
            state = PlayerController.activateSlowdown(state, now);

            // Update well past the end time (10 seconds later)
            const updated = PlayerController.updateSlowdown(state, now + 10000);
            expect(updated.slowdownActive).toBe(false);
            expect(updated.slowdownEndTime).toBe(0);
        });

        test('should not change state if slowdown not active', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            const updated = PlayerController.updateSlowdown(state, Date.now());
            expect(updated).toBe(state);
        });
    });

    describe('initial state slowdown', () => {
        test('should have no slowdown initially', () => {
            const state = PlayerController.createInitialPlayerState(screenWidth, screenHeight);
            expect(state.slowdownActive).toBe(false);
            expect(state.slowdownEndTime).toBe(0);
        });
    });
});

describe('ItemSpawner Module', () => {
    describe('createInitialSpawnerState', () => {
        test('should create spawner with zero counter', () => {
            const state = ItemSpawner.createInitialSpawnerState();
            expect(state.itemIdCounter).toBe(0);
        });
    });

    describe('selectRandomItemType', () => {
        test('should return valid item type', () => {
            const types = ['EGG', 'TOMATO', 'PEPPER', 'ELECTRIC_SHOCK', 'BOMB'];
            const type = ItemSpawner.selectRandomItemType();
            expect(types).toContain(type);
        });
    });

    describe('createFallingItem', () => {
        test('should create item with correct type', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 50, 'test_1');
            expect(item.type).toBe('EGG');
        });

        test('should create item with correct position', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 50, 'test_1');
            expect(item.x).toBe(100);
            expect(item.y).toBe(50);
        });

        test('should apply item definition properties', () => {
            const item = ItemSpawner.createFallingItem('BOMB', 100, 50, 'test_1');
            expect(item.isDeadly).toBe(true);
            expect(item.shouldAvoid).toBe(true);
        });
    });

    describe('updateItemPositions', () => {
        test('should move items down', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 50, 'test_1');
            const updated = ItemSpawner.updateItemPositions([item], 16);
            expect(updated[0].y).toBeGreaterThan(50);
        });
    });

    describe('removeOffscreenItems', () => {
        test('should remove items below screen', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 700, 'test_1');
            const filtered = ItemSpawner.removeOffscreenItems([item], 600);
            expect(filtered.length).toBe(0);
        });

        test('should keep items on screen', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 300, 'test_1');
            const filtered = ItemSpawner.removeOffscreenItems([item], 600);
            expect(filtered.length).toBe(1);
        });
    });
});

describe('CollisionSystem Module', () => {
    const screenWidth = 400;
    const screenHeight = 600;

    describe('processItemCatch', () => {
        test('should award points for EGG', () => {
            const item = ItemSpawner.createFallingItem('EGG', 100, 100, 'test_1');
            const outcome = CollisionSystem.processItemCatch(item);
            expect(outcome.pointsEarned).toBe(SCORING.GOOD_ITEM_POINTS);
        });

        test('should activate speed boost for PEPPER', () => {
            const item = ItemSpawner.createFallingItem('PEPPER', 100, 100, 'test_1');
            const outcome = CollisionSystem.processItemCatch(item);
            expect(outcome.activateSpeedBoost).toBe(true);
        });

        test('should lose life for ELECTRIC_SHOCK', () => {
            const item = ItemSpawner.createFallingItem('ELECTRIC_SHOCK', 100, 100, 'test_1');
            const outcome = CollisionSystem.processItemCatch(item);
            expect(outcome.livesLost).toBe(1);
        });

        test('should activate slowdown for ELECTRIC_SHOCK', () => {
            const item = ItemSpawner.createFallingItem('ELECTRIC_SHOCK', 100, 100, 'test_1');
            const outcome = CollisionSystem.processItemCatch(item);
            expect(outcome.activateSlowdown).toBe(true);
        });

        test('should game over for BOMB', () => {
            const item = ItemSpawner.createFallingItem('BOMB', 100, 100, 'test_1');
            const outcome = CollisionSystem.processItemCatch(item);
            expect(outcome.isGameOver).toBe(true);
        });
    });

    describe('aggregateOutcomes', () => {
        test('should sum points', () => {
            const outcomes = [
                { pointsEarned: 10, livesLost: 0, isGameOver: false, activateSpeedBoost: false, activateSlowdown: false, itemType: 'EGG' as const },
                { pointsEarned: 10, livesLost: 0, isGameOver: false, activateSpeedBoost: false, activateSlowdown: false, itemType: 'TOMATO' as const },
            ];
            const result = CollisionSystem.aggregateOutcomes(outcomes);
            expect(result.totalPoints).toBe(20);
        });

        test('should sum lives lost', () => {
            const outcomes = [
                { pointsEarned: 0, livesLost: 1, isGameOver: false, activateSpeedBoost: false, activateSlowdown: true, itemType: 'ELECTRIC_SHOCK' as const },
                { pointsEarned: 0, livesLost: 1, isGameOver: false, activateSpeedBoost: false, activateSlowdown: true, itemType: 'ELECTRIC_SHOCK' as const },
            ];
            const result = CollisionSystem.aggregateOutcomes(outcomes);
            expect(result.totalLivesLost).toBe(2);
        });

        test('should detect game over', () => {
            const outcomes = [
                { pointsEarned: 0, livesLost: 0, isGameOver: true, activateSpeedBoost: false, activateSlowdown: false, itemType: 'BOMB' as const },
            ];
            const result = CollisionSystem.aggregateOutcomes(outcomes);
            expect(result.shouldGameOver).toBe(true);
        });

        test('should detect slowdown activation', () => {
            const outcomes = [
                { pointsEarned: 0, livesLost: 1, isGameOver: false, activateSpeedBoost: false, activateSlowdown: true, itemType: 'ELECTRIC_SHOCK' as const },
            ];
            const result = CollisionSystem.aggregateOutcomes(outcomes);
            expect(result.shouldActivateSlowdown).toBe(true);
        });
    });
});

describe('ShonzikaAI Module', () => {
    const screenWidth = 400;
    const screenHeight = 600;

    describe('createInitialShonzikaState', () => {
        test('should create Shonzika at screen center', () => {
            const state = ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight);
            expect(state.x).toBe(screenWidth * 0.5);
        });

        test('should not be moving initially', () => {
            const state = ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight);
            expect(state.isMoving).toBe(false);
        });
    });

    describe('getHandPosition', () => {
        test('should return hand position below Shonzika', () => {
            const state = ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight);
            const hand = ShonzikaAI.getHandPosition(state);
            expect(hand.x).toBe(state.x);
            expect(hand.y).toBeGreaterThan(state.y);
        });
    });

    describe('triggerThrow', () => {
        test('should set sprite to THROWING', () => {
            const state = ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight);
            const throwing = ShonzikaAI.triggerThrow(state);
            expect(throwing.sprite).toBe('THROWING');
        });

        test('should set visual throw timer', () => {
            const state = ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight);
            const throwing = ShonzikaAI.triggerThrow(state);
            expect(throwing.visualThrowTimer).toBeGreaterThan(0);
        });
    });

    describe('pickRandomDirection', () => {
        test('should return 1 or -1', () => {
            const direction = ShonzikaAI.pickRandomDirection();
            expect([1, -1]).toContain(direction);
        });
    });
});

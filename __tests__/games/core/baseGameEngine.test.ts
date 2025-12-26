/**
 * Base Game Engine Tests
 * 
 * Tests for the abstract BaseGameEngine class.
 * We create a concrete test implementation to verify the base functionality.
 */

import {
    BaseGameEngine,
    BaseGameState
} from '../../../features/games/core';

/**
 * Concrete test implementation of BaseGameEngine
 */
interface TestGameState extends BaseGameState {
    testValue: number;
}

class TestGameEngine extends BaseGameEngine<TestGameState> {
    public onGameStartCalled = false;
    public onGameResetCalled = false;
    public onGameUpdateCalled = false;
    public lastDeltaTime = 0;

    protected createInitialState(screenWidth: number, screenHeight: number): TestGameState {
        return {
            phase: 'MENU',
            score: 0,
            screenWidth,
            screenHeight,
            testValue: 42,
        };
    }

    protected onGameUpdate(deltaTime: number): void {
        this.onGameUpdateCalled = true;
        this.lastDeltaTime = deltaTime;
    }

    protected onGameStart(): void {
        this.onGameStartCalled = true;
    }

    protected onGameReset(): void {
        this.onGameResetCalled = true;
    }

    // Expose protected methods for testing
    public testAddScore(points: number): void {
        this.addScore(points);
    }

    public testLoseLife(): void {
        this.loseLife();
    }

    public testTriggerGameOver(): void {
        this.triggerGameOver();
    }
}

describe('BaseGameEngine', () => {
    let engine: TestGameEngine;
    const screenWidth = 400;
    const screenHeight = 600;

    beforeEach(() => {
        engine = new TestGameEngine(screenWidth, screenHeight);
    });

    describe('Initialization', () => {
        test('should initialize with correct screen dimensions', () => {
            const state = engine.getState();
            expect(state.screenWidth).toBe(screenWidth);
            expect(state.screenHeight).toBe(screenHeight);
        });

        test('should initialize in MENU phase', () => {
            expect(engine.getPhase()).toBe('MENU');
            expect(engine.isInMenu()).toBe(true);
        });

        test('should initialize with zero score', () => {
            expect(engine.getScore()).toBe(0);
        });

        test('should initialize with default lives', () => {
            expect(engine.getLives()).toBe(3);
        });

        test('should initialize with default timer', () => {
            expect(engine.getTimeRemainingMs()).toBe(60000);
            expect(engine.getTimeRemaining()).toBe(60);
        });

        test('should initialize custom state values', () => {
            const state = engine.getState();
            expect(state.testValue).toBe(42);
        });
    });

    describe('Custom Configuration', () => {
        test('should accept custom game duration', () => {
            const customEngine = new TestGameEngine(400, 600, {
                gameDuration: 30000,
            });
            expect(customEngine.getTimeRemainingMs()).toBe(30000);
        });

        test('should accept custom initial lives', () => {
            const customEngine = new TestGameEngine(400, 600, {
                initialLives: 5,
            });
            expect(customEngine.getLives()).toBe(5);
        });
    });

    describe('Game State Transitions', () => {
        test('should transition to PLAYING when game starts', () => {
            engine.startGame();
            expect(engine.getPhase()).toBe('PLAYING');
            expect(engine.isGameActive()).toBe(true);
        });

        test('should call onGameStart when game starts', () => {
            engine.startGame();
            expect(engine.onGameStartCalled).toBe(true);
        });

        test('should call onGameReset when game starts', () => {
            engine.startGame();
            expect(engine.onGameResetCalled).toBe(true);
        });

        test('should transition to PAUSED when paused', () => {
            engine.startGame();
            engine.pauseGame();
            expect(engine.getPhase()).toBe('PAUSED');
            expect(engine.isPaused()).toBe(true);
        });

        test('should resume from PAUSED to PLAYING', () => {
            engine.startGame();
            engine.pauseGame();
            engine.resumeGame();
            expect(engine.getPhase()).toBe('PLAYING');
        });

        test('should toggle pause correctly', () => {
            engine.startGame();
            expect(engine.isGameActive()).toBe(true);

            engine.togglePause();
            expect(engine.isPaused()).toBe(true);

            engine.togglePause();
            expect(engine.isGameActive()).toBe(true);
        });

        test('should return to MENU when exiting', () => {
            engine.startGame();
            engine.exitGame();
            expect(engine.getPhase()).toBe('MENU');
            expect(engine.isInMenu()).toBe(true);
        });

        test('should not pause when not playing', () => {
            engine.pauseGame();
            expect(engine.isInMenu()).toBe(true);
        });

        test('should not resume when not paused', () => {
            engine.startGame();
            engine.resumeGame();
            expect(engine.isGameActive()).toBe(true);
        });
    });

    describe('Game Loop', () => {
        test('should not update when in MENU', () => {
            engine.update(1000);
            expect(engine.onGameUpdateCalled).toBe(false);
        });

        test('should not update when PAUSED', () => {
            engine.startGame();
            engine.pauseGame();
            engine.update(1000);
            expect(engine.onGameUpdateCalled).toBe(false);
        });

        test('should call onGameUpdate when PLAYING', () => {
            engine.startGame();
            engine.update(100);   // Initialize timing (non-zero)
            engine.update(150);  // First real update
            expect(engine.onGameUpdateCalled).toBe(true);
        });

        test('should calculate correct delta time', () => {
            engine.startGame();
            engine.update(100); // Initialize
            engine.update(150); // delta = 50
            expect(engine.lastDeltaTime).toBe(50);
        });

        test('should skip large delta times', () => {
            engine.startGame();
            engine.update(0);
            engine.onGameUpdateCalled = false;
            engine.update(200); // More than maxDeltaTime (100ms)
            expect(engine.onGameUpdateCalled).toBe(false);
        });
    });

    describe('Score System', () => {
        test('should add score correctly', () => {
            engine.startGame();
            engine.testAddScore(10);
            expect(engine.getScore()).toBe(10);
        });

        test('should accumulate score', () => {
            engine.startGame();
            engine.testAddScore(10);
            engine.testAddScore(15);
            expect(engine.getScore()).toBe(25);
        });

        test('should reset score on game restart', () => {
            engine.startGame();
            engine.testAddScore(100);
            engine.startGame();
            expect(engine.getScore()).toBe(0);
        });
    });

    describe('Lives System', () => {
        test('should lose life correctly', () => {
            engine.startGame();
            engine.testLoseLife();
            expect(engine.getLives()).toBe(2);
        });

        test('should not go below zero lives', () => {
            engine.startGame();
            engine.testLoseLife();
            engine.testLoseLife();
            engine.testLoseLife();
            engine.testLoseLife(); // Extra
            expect(engine.getLives()).toBe(0);
        });

        test('should reset lives on game restart', () => {
            engine.startGame();
            engine.testLoseLife();
            engine.testLoseLife();
            engine.startGame();
            expect(engine.getLives()).toBe(3);
        });

        test('should trigger game over when all lives lost during update', () => {
            engine.startGame();
            engine.update(0); // Initialize timing

            // Lose all lives
            engine.testLoseLife();
            engine.testLoseLife();
            engine.testLoseLife();

            // The game over check happens at the end of each update
            // So we need to run another update cycle
            engine.update(50);

            // Now lives are 0, but checkGameEndConditions runs at end of update
            // So we need one more update to process the game over
            engine.update(100);

            expect(engine.isGameOver()).toBe(true);
        });
    });

    describe('Timer System', () => {
        test('should count down during gameplay', () => {
            engine.startGame();
            engine.update(0);

            // Simulate 2 seconds in small steps
            for (let t = 50; t <= 2000; t += 50) {
                engine.update(t);
            }

            const remaining = engine.getTimeRemaining();
            expect(remaining).toBeLessThanOrEqual(59);
            expect(remaining).toBeGreaterThanOrEqual(57);
        });

        test('should not count down when paused', () => {
            engine.startGame();
            engine.update(0);
            engine.update(500);

            const timeBeforePause = engine.getTimeRemainingMs();

            engine.pauseGame();
            // Time passes while paused
            engine.update(2000);
            engine.update(3000);

            expect(engine.getTimeRemainingMs()).toBe(timeBeforePause);
        });

        test('should format time correctly', () => {
            // 60 seconds = 1:00
            expect(engine.getTimeRemainingFormatted()).toBe('1:00');
        });

        test('should trigger game over when timer expires', () => {
            const shortEngine = new TestGameEngine(400, 600, {
                gameDuration: 1000, // 1 second game
            });
            shortEngine.startGame();
            shortEngine.update(0);

            // Simulate 1.5 seconds
            for (let t = 50; t <= 1500; t += 50) {
                shortEngine.update(t);
            }

            expect(shortEngine.isGameOver()).toBe(true);
            expect(shortEngine.isTimerExpired()).toBe(true);
        });

        test('should reset timer on game restart', () => {
            engine.startGame();
            engine.update(0);
            for (let t = 50; t <= 5000; t += 50) {
                engine.update(t);
            }

            engine.startGame();
            expect(engine.getTimeRemainingMs()).toBe(60000);
        });
    });

    describe('Game Over', () => {
        test('should set phase to GAME_OVER', () => {
            engine.startGame();
            engine.testTriggerGameOver();
            expect(engine.isGameOver()).toBe(true);
            expect(engine.getPhase()).toBe('GAME_OVER');
        });

        test('should not be active when game over', () => {
            engine.startGame();
            engine.testTriggerGameOver();
            expect(engine.isGameActive()).toBe(false);
        });

        test('should not update when game over', () => {
            engine.startGame();
            engine.update(0);
            engine.update(50);
            engine.testTriggerGameOver();

            engine.onGameUpdateCalled = false;
            engine.update(100);
            expect(engine.onGameUpdateCalled).toBe(false);
        });
    });

    describe('Screen Info', () => {
        test('should return correct screen width', () => {
            expect(engine.getScreenWidth()).toBe(screenWidth);
        });

        test('should return correct screen height', () => {
            expect(engine.getScreenHeight()).toBe(screenHeight);
        });
    });
});

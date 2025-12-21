/**
 * Base Game Engine
 * 
 * Abstract base class that provides core game loop functionality.
 * All games should extend this class and implement game-specific logic.
 */

import { clamp, randomBetween } from './utils';

/**
 * Base game phases that all games support
 */
export type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

/**
 * Base game state interface that all games must implement
 */
export interface BaseGameState {
    phase: GamePhase;
    score: number;
    screenWidth: number;
    screenHeight: number;
}

/**
 * Configuration for the base game engine
 */
export interface BaseGameConfig {
    /** Game duration in milliseconds (0 for unlimited) */
    gameDuration: number;
    /** Initial number of lives (0 for unlimited) */
    initialLives: number;
    /** Target frames per second for update calculations */
    targetFps: number;
    /** Maximum delta time to prevent physics explosion */
    maxDeltaTime: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_GAME_CONFIG: BaseGameConfig = {
    gameDuration: 60000,  // 60 seconds
    initialLives: 3,
    targetFps: 60,
    maxDeltaTime: 100,    // Skip if more than 100ms between frames
};

/**
 * Abstract Base Game Engine
 * 
 * Provides:
 * - Game loop management (start, pause, resume, exit)
 * - Timer system (countdown with pause support)
 * - Lives system
 * - Score tracking
 * - Phase state machine
 * 
 * Games extend this and implement:
 * - createInitialState() - Initial game state
 * - onGameUpdate(deltaTime) - Game-specific update logic
 * - onGameStart() - Called when game starts
 * - onGameReset() - Called when game is reset
 */
export abstract class BaseGameEngine<TState extends BaseGameState> {
    protected gameState: TState;
    protected config: BaseGameConfig;

    // Timing
    protected lastUpdateTime: number = 0;
    protected gameTimer: number = 0;
    protected timeRemaining: number = 0;

    // Lives
    protected lives: number = 0;

    constructor(
        screenWidth: number,
        screenHeight: number,
        config: Partial<BaseGameConfig> = {}
    ) {
        this.config = { ...DEFAULT_GAME_CONFIG, ...config };
        this.gameState = this.createInitialState(screenWidth, screenHeight);
        this.timeRemaining = this.config.gameDuration;
        this.lives = this.config.initialLives;
    }

    // ==================== Abstract Methods ====================
    // These must be implemented by each game

    /**
     * Create the initial game state
     */
    protected abstract createInitialState(
        screenWidth: number,
        screenHeight: number
    ): TState;

    /**
     * Game-specific update logic called each frame
     * @param deltaTime Time since last update in milliseconds
     */
    protected abstract onGameUpdate(deltaTime: number): void;

    /**
     * Called when the game starts or restarts
     */
    protected abstract onGameStart(): void;

    /**
     * Called when the game is reset
     */
    protected abstract onGameReset(): void;

    // ==================== Public API ====================

    /**
     * Get the current game state
     */
    getState(): TState {
        return { ...this.gameState };
    }

    /**
     * Start the game
     */
    startGame(): void {
        this.resetGame();
        this.gameState.phase = 'PLAYING';
        this.lastUpdateTime = 0;
        this.gameTimer = 0;
        this.onGameStart();
    }

    /**
     * Pause the game
     */
    pauseGame(): void {
        if (this.gameState.phase === 'PLAYING') {
            this.gameState.phase = 'PAUSED';
        }
    }

    /**
     * Resume from pause
     */
    resumeGame(): void {
        if (this.gameState.phase === 'PAUSED') {
            this.gameState.phase = 'PLAYING';
            this.lastUpdateTime = 0; // Reset timing to avoid large delta
        }
    }

    /**
     * Toggle between pause and play
     */
    togglePause(): void {
        if (this.gameState.phase === 'PLAYING') {
            this.pauseGame();
        } else if (this.gameState.phase === 'PAUSED') {
            this.resumeGame();
        }
    }

    /**
     * Exit the game and return to menu
     */
    exitGame(): void {
        this.gameState.phase = 'MENU';
        this.resetGame();
    }

    /**
     * Main update loop - call this every frame
     */
    update(currentTime: number): void {
        if (this.gameState.phase !== 'PLAYING') return;

        // Initialize timing on first update
        if (this.lastUpdateTime === 0) {
            this.lastUpdateTime = currentTime;
            return;
        }

        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;

        // Skip if delta time is too large (first frame or after pause)
        if (deltaTime > this.config.maxDeltaTime) return;

        // Update game timer
        this.gameTimer += deltaTime;

        // Update time remaining (if game has a duration)
        if (this.config.gameDuration > 0) {
            this.timeRemaining = Math.max(0, this.config.gameDuration - this.gameTimer);
        }

        // Call game-specific update
        this.onGameUpdate(deltaTime);

        // Check game end conditions
        this.checkGameEndConditions();
    }

    // ==================== Score System ====================

    getScore(): number {
        return this.gameState.score;
    }

    protected addScore(points: number): void {
        this.gameState.score += points;
    }

    protected setScore(score: number): void {
        this.gameState.score = score;
    }

    // ==================== Lives System ====================

    getLives(): number {
        return this.lives;
    }

    protected loseLife(): void {
        if (this.config.initialLives > 0) {
            this.lives = Math.max(0, this.lives - 1);
        }
    }

    protected setLives(lives: number): void {
        this.lives = lives;
    }

    protected hasLivesRemaining(): boolean {
        return this.config.initialLives === 0 || this.lives > 0;
    }

    // ==================== Timer System ====================

    /**
     * Get remaining time in seconds (rounded up)
     */
    getTimeRemaining(): number {
        return Math.ceil(this.timeRemaining / 1000);
    }

    /**
     * Get remaining time in milliseconds
     */
    getTimeRemainingMs(): number {
        return this.timeRemaining;
    }

    /**
     * Get formatted time string (e.g., "60s" or "1:30")
     */
    getTimeRemainingFormatted(): string {
        const seconds = Math.ceil(this.timeRemaining / 1000);
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get game timer (time elapsed in ms)
     */
    protected getGameTimer(): number {
        return this.gameTimer;
    }

    isTimerExpired(): boolean {
        return this.config.gameDuration > 0 && this.timeRemaining <= 0;
    }

    // ==================== State Queries ====================

    isGameActive(): boolean {
        return this.gameState.phase === 'PLAYING';
    }

    isGameOver(): boolean {
        return this.gameState.phase === 'GAME_OVER';
    }

    isPaused(): boolean {
        return this.gameState.phase === 'PAUSED';
    }

    isInMenu(): boolean {
        return this.gameState.phase === 'MENU';
    }

    getPhase(): GamePhase {
        return this.gameState.phase;
    }

    // ==================== Screen Info ====================

    getScreenWidth(): number {
        return this.gameState.screenWidth;
    }

    getScreenHeight(): number {
        return this.gameState.screenHeight;
    }

    // ==================== Protected Helpers ====================

    /**
     * Trigger game over
     */
    protected triggerGameOver(): void {
        this.gameState.phase = 'GAME_OVER';
    }

    /**
     * Reset game state to initial values
     */
    protected resetGame(): void {
        this.gameState.score = 0;
        this.lives = this.config.initialLives;
        this.timeRemaining = this.config.gameDuration;
        this.gameTimer = 0;
        this.lastUpdateTime = 0;
        this.onGameReset();
    }

    /**
     * Check if game should end (timer expired or no lives)
     */
    protected checkGameEndConditions(): void {
        if (this.isTimerExpired()) {
            this.triggerGameOver();
            return;
        }

        if (this.config.initialLives > 0 && this.lives <= 0) {
            this.triggerGameOver();
            return;
        }
    }

    // ==================== Utility Methods ====================

    /**
     * Clamp a value between min and max
     */
    protected clamp(value: number, min: number, max: number): number {
        return clamp(value, min, max);
    }

    /**
     * Random number between min and max
     */
    protected randomBetween(min: number, max: number): number {
        return randomBetween(min, max);
    }

    /**
     * Linear interpolation
     */
    protected lerp(start: number, end: number, t: number): number {
        return start + (end - start) * this.clamp(t, 0, 1);
    }

    /**
     * Ease in-out quadratic
     */
    protected easeInOutQuad(t: number): number {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
}

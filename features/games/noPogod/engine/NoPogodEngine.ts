/**
 * NoPogod Game Engine
 * 
 * Main game engine that extends BaseGameEngine and orchestrates
 * all game systems (player, items, Shonzika, collisions).
 * 
 * This is the refactored version that follows clean architecture.
 */

import { BaseGameEngine } from '../../core';
import type { NoPogodGameAssets } from '../utils/assets';
import * as CollisionSystem from './CollisionSystem';
import { SCORING, TIMING } from './config';
import * as ItemSpawner from './ItemSpawner';
import * as PlayerController from './PlayerController';
import * as ShonzikaAI from './ShonzikaAI';
import type {
    FallingItem,
    NoPogodGameState,
    PlayerPosition,
    PlayerState,
    TouchZones
} from './types';

// Re-export for backwards compatibility
export * from './config';
export * from './types';

export type { NoPogodGameAssets } from '../utils/assets';

/**
 * NoPogod Game Engine
 * 
 * Manages the No Pogodi mini-game with:
 * - Player (Miro) catching items
 * - Shonzika throwing items
 * - Scoring and lives
 * - Speed boost from peppers
 */
export class NoPogodEngine extends BaseGameEngine<NoPogodGameState> {
    private spawnerState: ItemSpawner.SpawnerState;
    private shonzikaDirection: 1 | -1 = 1;
    private gameStartTime: number = 0;
    private items: FallingItem[] = [];

    // Asset support for backwards compatibility
    private assets: NoPogodGameAssets | null = null;

    constructor(screenWidth: number, screenHeight: number, assets?: NoPogodGameAssets) {
        super(screenWidth, screenHeight, {
            gameDuration: TIMING.GAME_DURATION,
            initialLives: SCORING.INITIAL_LIVES,
        });

        this.spawnerState = ItemSpawner.createInitialSpawnerState();

        if (assets) {
            this.setAssets(assets);
        }
    }

    /**
     * Set game assets
     */
    setAssets(assets: NoPogodGameAssets): void {
        this.assets = assets;
    }

    /**
     * Get current assets
     */
    getAssets(): NoPogodGameAssets | null {
        return this.assets;
    }

    // =========================================================================
    // BaseGameEngine Abstract Methods
    // =========================================================================

    protected createInitialState(
        screenWidth: number,
        screenHeight: number
    ): NoPogodGameState {
        return {
            phase: 'MENU',
            score: 0,
            lives: SCORING.INITIAL_LIVES,
            timeRemaining: TIMING.GAME_DURATION,
            player: PlayerController.createInitialPlayerState(screenWidth, screenHeight),
            items: [],
            shonzika: ShonzikaAI.createInitialShonzikaState(screenWidth, screenHeight),
            screenWidth,
            screenHeight,
            animations: {
                miro: null,
                shonzika: null,
            },
        };
    }

    protected onGameStart(): void {
        this.gameStartTime = Date.now();
        this.shonzikaDirection = ShonzikaAI.pickRandomDirection();
    }

    protected onGameReset(): void {
        this.spawnerState = ItemSpawner.createInitialSpawnerState();
        this.items = [];
        this.shonzikaDirection = 1;

        // Reset player and Shonzika positions
        this.gameState.player = PlayerController.createInitialPlayerState(
            this.gameState.screenWidth,
            this.gameState.screenHeight
        );
        this.gameState.shonzika = ShonzikaAI.createInitialShonzikaState(
            this.gameState.screenWidth,
            this.gameState.screenHeight
        );
        this.gameState.items = [];
    }

    protected onGameUpdate(deltaTime: number): void {
        const currentTime = Date.now();

        // Update player position/animation
        this.updatePlayer(deltaTime, currentTime);

        // Update Shonzika AI
        this.updateShonzika(deltaTime);

        // Update item spawning
        this.updateItemSpawning(currentTime);

        // Update item positions
        this.updateItems(deltaTime);

        // Process collisions
        this.processCollisions();

        // Note: Game end conditions are checked by base class after onGameUpdate

        // IMPORTANT: Sync base class state to gameState for UI
        this.gameState.timeRemaining = this.getTimeRemainingMs();
        this.gameState.lives = this.getLives();
        this.gameState.items = this.items;
    }

    // =========================================================================
    // Player Methods
    // =========================================================================

    /**
     * Move player to a specific position
     */
    movePlayer(position: PlayerPosition): void {
        if (!this.isGameActive()) return;

        this.gameState.player = PlayerController.movePlayer(
            this.gameState.player,
            position,
            this.gameState.screenWidth,
            Date.now()
        );
    }

    /**
     * Start continuous movement in a direction
     */
    startContinuousMovement(direction: 'LEFT' | 'RIGHT'): void {
        if (!this.isGameActive()) return;

        this.gameState.player = PlayerController.startContinuousMovement(
            this.gameState.player,
            direction,
            this.gameState.screenWidth,
            Date.now()
        );
    }

    /**
     * Stop continuous movement
     */
    stopContinuousMovement(): void {
        this.gameState.player = PlayerController.stopContinuousMovement(
            this.gameState.player
        );
    }

    /**
     * Get player state
     */
    getPlayerState(): PlayerState {
        return { ...this.gameState.player };
    }

    /**
     * Check if player is currently moving
     */
    isPlayerMoving(): boolean {
        return this.gameState.player.isMoving;
    }

    /**
     * Get player animation progress
     */
    getPlayerAnimationProgress(): number {
        return this.gameState.player.animationProgress;
    }

    /**
     * Check if player can move
     */
    canPlayerMove(): boolean {
        return this.isGameActive();
    }

    // =========================================================================
    // Touch Input Methods
    // =========================================================================

    /**
     * Determine player position from touch X coordinate
     */
    getPlayerPositionFromTouch(touchX: number): PlayerPosition {
        return PlayerController.getPositionFromTouch(
            touchX,
            this.gameState.screenWidth
        );
    }

    /**
     * Get touch zone boundaries
     */
    getTouchZones(): TouchZones {
        return PlayerController.getTouchZones(this.gameState.screenWidth);
    }

    // =========================================================================
    // Item Methods
    // =========================================================================

    /**
     * Get all falling items
     */
    getFallingItems(): FallingItem[] {
        return [...this.items];
    }

    // =========================================================================
    // Shonzika Methods
    // =========================================================================

    /**
     * Get Shonzika position info
     */
    getShonzikaPosition(): { x: number; y: number; sprite: string } {
        const info = ShonzikaAI.getShonzikaRenderInfo(this.gameState.shonzika);
        return {
            x: info.x,
            y: info.y,
            sprite: info.sprite,
        };
    }

    /**
     * Get Shonzika's hand position (where items spawn)
     */
    getShonzikaHandPosition(): { x: number; y: number } {
        return ShonzikaAI.getHandPosition(this.gameState.shonzika);
    }

    /**
     * Get Shonzika animation progress
     */
    getShonzikaAnimationProgress(): number {
        return this.gameState.shonzika.animationProgress;
    }

    // =========================================================================
    // Speed Boost Methods
    // =========================================================================

    /**
     * Check if speed boost is active
     */
    isSpeedBoostActive(): boolean {
        return this.gameState.player.speedBoostActive;
    }

    /**
     * Get remaining speed boost time in ms
     */
    getSpeedBoostTimeRemaining(): number {
        return PlayerController.getSpeedBoostTimeRemaining(
            this.gameState.player,
            Date.now()
        );
    }

    /**
     * Get remaining speed boost time in seconds
     */
    getSpeedBoostTimeRemainingSeconds(): number {
        return Math.ceil(this.getSpeedBoostTimeRemaining() / 1000);
    }

    // =========================================================================
    // Position Info Methods
    // =========================================================================

    /**
     * Get player position info for rendering
     */
    getPlayerPosition(): { position: string; x: number; y: number } {
        return {
            position: this.gameState.player.position,
            x: this.gameState.player.x,
            y: this.gameState.player.y,
        };
    }

    // =========================================================================
    // Internal Update Methods
    // =========================================================================

    private updatePlayer(deltaTime: number, currentTime: number): void {
        // Update position animation
        this.gameState.player = PlayerController.updatePlayerPosition(
            this.gameState.player,
            currentTime,
            deltaTime,
            this.gameState.screenWidth
        );

        // Update speed boost
        this.gameState.player = PlayerController.updateSpeedBoost(
            this.gameState.player,
            currentTime
        );
    }

    private updateShonzika(deltaTime: number): void {
        // Update throw timer
        this.gameState.shonzika = ShonzikaAI.updateThrowTimer(
            this.gameState.shonzika,
            deltaTime
        );

        // Update position (continuous walking)
        const { newState, newDirection } = ShonzikaAI.updateShonzikaPosition(
            this.gameState.shonzika,
            deltaTime,
            this.gameState.screenWidth,
            this.shonzikaDirection
        );

        this.gameState.shonzika = newState;
        this.shonzikaDirection = newDirection;
    }

    private updateItemSpawning(currentTime: number): void {
        // Check if it's time to spawn (handles both regular and burst timing)
        if (ItemSpawner.shouldSpawnNextItem(this.spawnerState, currentTime)) {
            // Trigger throw animation
            this.gameState.shonzika = ShonzikaAI.triggerThrow(this.gameState.shonzika);

            // Spawn item (may start a burst sequence - 40% chance for 2-3 items)
            const { item, newState } = ItemSpawner.spawnWithBurst(
                this.spawnerState,
                this.gameState.shonzika,
                currentTime
            );

            this.spawnerState = newState;
            this.items.push(item);
        }
    }

    private updateItems(deltaTime: number): void {
        // Update positions
        this.items = ItemSpawner.updateItemPositions(this.items, deltaTime);

        // Remove off-screen items
        this.items = ItemSpawner.removeOffscreenItems(
            this.items,
            this.gameState.screenHeight
        );
    }

    private processCollisions(): void {
        const { remainingItems, outcomes } = CollisionSystem.processCollisions(
            this.items,
            this.gameState.player
        );

        this.items = remainingItems;

        // Process outcomes
        const aggregate = CollisionSystem.aggregateOutcomes(outcomes);

        // Apply points
        if (aggregate.totalPoints > 0) {
            this.addScore(aggregate.totalPoints);
        }

        // Apply lives lost
        for (let i = 0; i < aggregate.totalLivesLost; i++) {
            this.loseLife();
        }

        // Check for game over from bomb
        if (aggregate.shouldGameOver) {
            this.triggerGameOver();
        }

        // Activate speed boost
        if (aggregate.shouldActivateSpeedBoost) {
            this.gameState.player = PlayerController.activateSpeedBoost(
                this.gameState.player,
                Date.now()
            );
        }
    }

    protected override checkGameEndConditions(): void {
        // Already game over from bomb
        if (this.gameState.phase === 'GAME_OVER') {
            return;
        }

        // Check lives
        if (this.getLives() <= 0) {
            this.triggerGameOver();
            return;
        }

        // Check timer (handled by base class)
        if (this.isTimerExpired()) {
            this.triggerGameOver();
        }
    }
}

/**
 * No Pogodi Game Asset Integration Example
 * Demonstrates how to use the asset system, game engine, and sprite renderer together
 */

import { NoPogodEngine } from '../engine/NoPogodEngine';
import type { NoPogodGameAssets } from './assets';
import { loadNoPogodGameAssets, NOPOGOD_GAME_ASSETS } from './assets';
import { NoPogodSpriteRenderer } from './spriteRenderer';

// Example integration class showing how all components work together
export class NoPogodGameIntegration {
  private gameEngine: NoPogodEngine;
  private spriteRenderer: NoPogodSpriteRenderer;
  private assets: NoPogodGameAssets;

  constructor(screenWidth: number, screenHeight: number) {
    // Load game assets
    this.assets = loadNoPogodGameAssets();

    // Create game engine with assets
    this.gameEngine = new NoPogodEngine(screenWidth, screenHeight, this.assets);

    // Create sprite renderer
    this.spriteRenderer = new NoPogodSpriteRenderer(this.assets, screenWidth, screenHeight);

  }

  // Get all rendering information for the current game state
  public getRenderData() {
    const gameState = this.gameEngine.getState();

    // Get all sprite render information
    const sprites = this.spriteRenderer.getAllSprites(gameState);

    // Get UI positions and font sizes
    const uiPositions = this.spriteRenderer.getUIPositions();
    const fontSizes = this.spriteRenderer.getFontSizes();
    const touchZones = this.spriteRenderer.getTouchZones();

    return {
      gameState,
      sprites,
      uiPositions,
      fontSizes,
      touchZones,
      animations: {
        miroProgress: this.gameEngine.getPlayerAnimationProgress(),
        shonzikaProgress: this.gameEngine.getShonzikaAnimationProgress(),
      },
    };
  }

  // Handle game updates
  public update(currentTime: number) {
    this.gameEngine.update(currentTime);
  }

  // Handle player input
  public handleTouch(x: number, y: number) {
    const touchZones = this.spriteRenderer.getTouchZones();

    if (x < touchZones.left.width) {
      this.gameEngine.movePlayer('LEFT');
    } else if (x < touchZones.left.width + touchZones.center.width) {
      this.gameEngine.movePlayer('CENTER');
    } else {
      this.gameEngine.movePlayer('RIGHT');
    }
  }

  // Game control methods
  public startGame() {
    this.gameEngine.startGame();
  }

  public pauseGame() {
    this.gameEngine.pauseGame();
  }

  public exitGame() {
    this.gameEngine.exitGame();
  }

  // Get game engine for direct access
  public getGameEngine(): NoPogodEngine {
    return this.gameEngine;
  }

  // Get sprite renderer for direct access
  public getSpriteRenderer(): NoPogodSpriteRenderer {
    return this.spriteRenderer;
  }

  // Get assets for direct access
  public getAssets() {
    return this.assets;
  }

  // Update screen size
  public updateScreenSize(screenWidth: number, screenHeight: number) {
    this.spriteRenderer.updateScreenSize(screenWidth, screenHeight);
  }
}

// Utility function to create a complete game instance
export function createNoPogodGame(screenWidth: number, screenHeight: number): NoPogodGameIntegration {
  return new NoPogodGameIntegration(screenWidth, screenHeight);
}

// Export pre-loaded assets for immediate use
export { NOPOGOD_GAME_ASSETS };

// Export all asset-related utilities
    export {
        ANIMATION, ITEM_DEFINITIONS, NO_POGOD_CONFIG, NoPogodEngine, PHYSICS, POSITIONS, SCORING, SIZES, SPAWN_WEIGHTS, TIMING
    } from '../engine';
    export * from './assets';
    export * from './spriteRenderer';


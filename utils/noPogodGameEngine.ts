// No Pogodi Game Engine
// Core interfaces and game logic for the No Pogodi mini game

// Import asset types from the asset management system
import {
    GameAnimations,
    NoPogodGameAssets,
    SpriteAnimationManager,
    createGameAnimations
} from './noPogodGameAssets';

// Core game interfaces
export interface NoPogodGameState {
  phase: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
  score: number;
  lives: number;
  timeRemaining: number;
  player: PlayerState;
  items: FallingItem[];
  shonzika: ShonzikaState;
  screenWidth: number;
  screenHeight: number;
  animations: {
    miro: SpriteAnimationManager;
    shonzika: SpriteAnimationManager;
  };
}

export interface PlayerState {
  position: 'LEFT' | 'CENTER' | 'RIGHT';
  x: number;
  y: number;
  targetX: number;
  startX: number;
  isMoving: boolean;
  sprite: 'IDLE' | 'MOVING';
  animationProgress: number;
  movementStartTime: number;
}

export interface FallingItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  velocityY: number;
  sprite: any;
  points: number;
  isBad: boolean;
  isDeadly: boolean;
}

export interface ShonzikaState {
  x: number;
  y: number;
  sprite: 'IDLE' | 'THROWING';
  throwCooldown: number;
}

export type ItemType = 'EGG' | 'TOMATO' | 'PEPPER' | 'ELECTRIC_SHOCK' | 'BOMB';

// Import asset types from the asset management system

// Game configuration constants
export const NO_POGOD_CONFIG = {
  // Timing
  GAME_DURATION: 60000, // 60 seconds in milliseconds
  ITEM_SPAWN_INTERVAL: 1500, // Base interval between item spawns
  ITEM_SPAWN_VARIANCE: 500, // Random variance in spawn timing
  
  // Scoring
  GOOD_ITEM_POINTS: 10,
  INITIAL_LIVES: 3,
  
  // Physics
  ITEM_FALL_SPEED: 3,
  ITEM_FALL_ACCELERATION: 0.1,
  
  // Positions
  PLAYER_POSITIONS: {
    LEFT: 0.25,
    CENTER: 0.5,
    RIGHT: 0.75,
  },
  SHONZIKA_POSITION: { x: 0.5, y: 0.15 },
  MIRO_GROUND_Y: 0.8,
  
  // Sprites
  CHARACTER_SIZE: 80,
  ITEM_SIZE: 40,
  
  // Animation
  PLAYER_MOVE_DURATION: 200, // milliseconds for smooth movement
  PLAYER_MOVE_SPEED: 0.8, // movement interpolation speed
  
  // Item probabilities
  ITEM_SPAWN_WEIGHTS: {
    EGG: 30,
    TOMATO: 25,
    PEPPER: 25,
    ELECTRIC_SHOCK: 15,
    BOMB: 5,
  },
} as const;

// Item type definitions
export const ITEM_DEFINITIONS: Record<ItemType, { points: number; isBad: boolean; isDeadly: boolean }> = {
  EGG: { points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, isBad: false, isDeadly: false },
  TOMATO: { points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, isBad: false, isDeadly: false },
  PEPPER: { points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, isBad: false, isDeadly: false },
  ELECTRIC_SHOCK: { points: 0, isBad: true, isDeadly: false },
  BOMB: { points: 0, isBad: true, isDeadly: true },
};

export class NoPogodGameEngine {
  private gameState: NoPogodGameState;
  private lastUpdateTime: number = 0;
  private gameTimer: number = 0;
  private lastItemSpawn: number = 0;
  private nextItemSpawnTime: number = 0;
  private gameAnimations: GameAnimations | null = null;
  private assets: NoPogodGameAssets | null = null;

  constructor(screenWidth: number, screenHeight: number, assets?: NoPogodGameAssets) {
    this.gameState = this.createInitialState(screenWidth, screenHeight);
    this.generateNextSpawnTime();
    
    if (assets) {
      this.setAssets(assets);
    }
  }

  // Set game assets and initialize animations
  public setAssets(assets: NoPogodGameAssets): void {
    this.assets = assets;
    this.gameAnimations = createGameAnimations(assets);
    
    // Initialize default animations
    if (this.gameAnimations) {
      this.gameState.animations.miro.startAnimation(this.gameAnimations.miro.idle);
      this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.idle);
    }
  }

  // Get current assets
  public getAssets(): NoPogodGameAssets | null {
    return this.assets;
  }

  private createInitialState(screenWidth: number, screenHeight: number): NoPogodGameState {
    const miroY = screenHeight * NO_POGOD_CONFIG.MIRO_GROUND_Y;
    const shonzikaY = screenHeight * NO_POGOD_CONFIG.SHONZIKA_POSITION.y;
    
    return {
      phase: 'MENU',
      score: 0,
      lives: NO_POGOD_CONFIG.INITIAL_LIVES,
      timeRemaining: NO_POGOD_CONFIG.GAME_DURATION,
      player: {
        position: 'CENTER',
        x: screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER,
        y: miroY,
        targetX: screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER,
        startX: screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER,
        isMoving: false,
        sprite: 'IDLE',
        animationProgress: 1.0,
        movementStartTime: 0,
      },
      items: [],
      shonzika: {
        x: screenWidth * NO_POGOD_CONFIG.SHONZIKA_POSITION.x,
        y: shonzikaY,
        sprite: 'IDLE',
        throwCooldown: 0,
      },
      screenWidth,
      screenHeight,
      animations: {
        miro: new SpriteAnimationManager(),
        shonzika: new SpriteAnimationManager(),
      },
    };
  }

  getState(): NoPogodGameState {
    return { ...this.gameState };
  }

  startGame(): void {
    this.gameState.phase = 'PLAYING';
    this.resetGame();
    this.lastUpdateTime = 0;
    this.gameTimer = 0;
    this.lastItemSpawn = 0;
    this.generateNextSpawnTime();
  }

  pauseGame(): void {
    if (this.gameState.phase === 'PLAYING') {
      this.gameState.phase = 'PAUSED';
    }
  }

  resumeGame(): void {
    if (this.gameState.phase === 'PAUSED') {
      this.gameState.phase = 'PLAYING';
      this.lastUpdateTime = 0; // Reset timing to avoid large delta
    }
  }

  togglePause(): void {
    if (this.gameState.phase === 'PLAYING') {
      this.pauseGame();
    } else if (this.gameState.phase === 'PAUSED') {
      this.resumeGame();
    }
  }

  exitGame(): void {
    this.gameState.phase = 'MENU';
    this.resetGame();
  }

  private resetGame(): void {
    this.gameState.score = 0;
    this.gameState.lives = NO_POGOD_CONFIG.INITIAL_LIVES;
    this.gameState.timeRemaining = NO_POGOD_CONFIG.GAME_DURATION;
    this.gameState.items = [];
    this.gameState.player.position = 'CENTER';
    this.gameState.player.x = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER;
    this.gameState.player.targetX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER;
    this.gameState.player.startX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER;
    this.gameState.player.isMoving = false;
    this.gameState.player.sprite = 'IDLE';
    this.gameState.player.animationProgress = 1.0;
    this.gameState.player.movementStartTime = 0;
    this.gameState.shonzika.sprite = 'IDLE';
    this.gameState.shonzika.throwCooldown = 0;
  }

  movePlayer(direction: 'LEFT' | 'CENTER' | 'RIGHT'): void {
    if (this.gameState.phase !== 'PLAYING') return;

    const previousPosition = this.gameState.player.position;
    
    // Only start movement if position is different
    if (previousPosition !== direction) {
      this.gameState.player.startX = this.gameState.player.x; // Store current position as start
      this.gameState.player.position = direction;
      this.gameState.player.targetX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS[direction];
      this.gameState.player.isMoving = true;
      this.gameState.player.sprite = 'MOVING';
      this.gameState.player.animationProgress = 0.0;
      this.gameState.player.movementStartTime = this.gameTimer;
      
      // Start walking animation
      if (this.gameAnimations) {
        this.gameState.animations.miro.startAnimation(this.gameAnimations.miro.walking);
      }
    }
  }

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
    if (deltaTime > 100) return;

    // Update game timer
    this.updateTimer(deltaTime);
    
    // Update sprite animations
    this.updateAnimations(currentTime);
    
    // Update game components
    this.updatePlayer(deltaTime);
    this.updateItems(deltaTime);
    this.updateShonzika(deltaTime);
    this.checkCollisions();
    
    // Check game end conditions
    this.checkGameEndConditions();
  }

  private updateTimer(deltaTime: number): void {
    // Only update timer when game is actively playing
    if (this.gameState.phase === 'PLAYING') {
      this.gameTimer += deltaTime;
      this.gameState.timeRemaining = Math.max(0, NO_POGOD_CONFIG.GAME_DURATION - this.gameTimer);
    }
  }

  private updateAnimations(currentTime: number): void {
    // Update character animations
    this.gameState.animations.miro.update(currentTime);
    this.gameState.animations.shonzika.update(currentTime);
  }

  private updatePlayer(deltaTime: number): void {
    const player = this.gameState.player;
    
    if (player.isMoving) {
      // Calculate animation progress based on time elapsed
      const elapsedTime = this.gameTimer - player.movementStartTime;
      const progress = Math.min(elapsedTime / NO_POGOD_CONFIG.PLAYER_MOVE_DURATION, 1.0);
      
      // Update animation progress
      player.animationProgress = progress;
      
      // Smooth interpolation between start and target position
      const easedProgress = this.easeInOutQuad(progress);
      player.x = player.startX + (player.targetX - player.startX) * easedProgress;
      
      // Check if movement is complete
      if (progress >= 1.0) {
        player.x = player.targetX;
        player.isMoving = false;
        player.sprite = 'IDLE';
        player.animationProgress = 1.0;
        
        // Switch back to idle animation
        if (this.gameAnimations) {
          this.gameState.animations.miro.startAnimation(this.gameAnimations.miro.idle);
        }
      }
    }
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private updateItems(deltaTime: number): void {
    // Update existing items
    this.gameState.items = this.gameState.items.filter(item => {
      // Update item position
      item.y += item.velocityY;
      item.velocityY += NO_POGOD_CONFIG.ITEM_FALL_ACCELERATION;

      // Remove items that have fallen off screen
      return item.y < this.gameState.screenHeight + NO_POGOD_CONFIG.ITEM_SIZE;
    });

    // Spawn new items (gameTimer is already updated in updateTimer)
    if (this.gameTimer - this.lastItemSpawn >= this.nextItemSpawnTime) {
      this.spawnItem();
      this.lastItemSpawn = this.gameTimer;
      this.generateNextSpawnTime();
    }
  }

  private updateShonzika(deltaTime: number): void {
    // Update throw cooldown
    if (this.gameState.shonzika.throwCooldown > 0) {
      this.gameState.shonzika.throwCooldown -= deltaTime;
      if (this.gameState.shonzika.throwCooldown <= 0) {
        this.gameState.shonzika.sprite = 'IDLE';
        
        // Switch back to idle animation
        if (this.gameAnimations) {
          this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.idle);
        }
      }
    }
  }

  private spawnItem(): void {
    const itemType = this.getRandomItemType();
    const itemDef = ITEM_DEFINITIONS[itemType];
    
    // Get the appropriate sprite for the item type
    let itemSprite = null;
    if (this.assets) {
      switch (itemType) {
        case 'EGG':
          itemSprite = this.assets.items.egg;
          break;
        case 'TOMATO':
          itemSprite = this.assets.items.tomato;
          break;
        case 'PEPPER':
          itemSprite = this.assets.items.pepper;
          break;
        case 'ELECTRIC_SHOCK':
          itemSprite = this.assets.items.electricShock;
          break;
        case 'BOMB':
          itemSprite = this.assets.items.bomb;
          break;
      }
    }
    
    const item: FallingItem = {
      id: `item_${Date.now()}_${Math.random()}`,
      type: itemType,
      x: this.gameState.shonzika.x,
      y: this.gameState.shonzika.y,
      velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
      sprite: itemSprite,
      points: itemDef.points,
      isBad: itemDef.isBad,
      isDeadly: itemDef.isDeadly,
    };

    this.gameState.items.push(item);
    
    // Set Shonzika to throwing state and start throwing animation
    this.gameState.shonzika.sprite = 'THROWING';
    this.gameState.shonzika.throwCooldown = 900; // 900ms throw animation (6 frames * 150ms)
    
    if (this.gameAnimations) {
      this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.throwing);
    }
  }

  private getRandomItemType(): ItemType {
    const weights = NO_POGOD_CONFIG.ITEM_SPAWN_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const [itemType, weight] of Object.entries(weights)) {
      currentWeight += weight;
      if (random <= currentWeight) {
        return itemType as ItemType;
      }
    }
    
    return 'EGG'; // Fallback
  }

  private generateNextSpawnTime(): void {
    const variance = Math.random() * NO_POGOD_CONFIG.ITEM_SPAWN_VARIANCE;
    this.nextItemSpawnTime = NO_POGOD_CONFIG.ITEM_SPAWN_INTERVAL + variance;
  }

  private checkCollisions(): void {
    const playerCenterX = this.gameState.player.x;
    const catchRadius = NO_POGOD_CONFIG.CHARACTER_SIZE / 2;
    const catchY = this.gameState.player.y;

    this.gameState.items = this.gameState.items.filter(item => {
      // Check if item is close enough to player position for catching
      const itemCenterX = item.x;
      const itemCenterY = item.y;
      
      const distanceX = Math.abs(itemCenterX - playerCenterX);
      const distanceY = Math.abs(itemCenterY - catchY);
      
      // Item is caught if it's close enough horizontally and at ground level
      if (distanceX <= catchRadius && distanceY <= NO_POGOD_CONFIG.ITEM_SIZE && 
          item.y >= catchY - NO_POGOD_CONFIG.ITEM_SIZE) {
        this.handleItemCatch(item);
        return false; // Remove caught item
      }
      
      return true; // Keep item
    });
  }

  private handleItemCatch(item: FallingItem): void {
    if (item.isDeadly) {
      // Bomb causes immediate game over
      this.gameState.phase = 'GAME_OVER';
    } else if (item.isBad) {
      // Bad items cause life loss
      this.gameState.lives--;
    } else {
      // Good items give points
      this.gameState.score += item.points;
    }
  }

  private checkGameEndConditions(): void {
    // Game ends if time runs out
    if (this.gameState.timeRemaining <= 0) {
      this.gameState.timeRemaining = 0; // Ensure it doesn't go negative
      this.gameState.phase = 'GAME_OVER';
    }
    
    // Game ends if all lives are lost
    if (this.gameState.lives <= 0) {
      this.gameState.phase = 'GAME_OVER';
    }
  }

  isTimerExpired(): boolean {
    return this.gameState.timeRemaining <= 0;
  }

  getGameEndReason(): 'TIME_UP' | 'LIVES_LOST' | 'BOMB_CAUGHT' | 'NONE' {
    if (this.gameState.phase !== 'GAME_OVER') {
      return 'NONE';
    }
    
    if (this.gameState.timeRemaining <= 0) {
      return 'TIME_UP';
    }
    
    if (this.gameState.lives <= 0) {
      return 'LIVES_LOST';
    }
    
    // If game is over but time and lives are still available, it was likely a bomb
    return 'BOMB_CAUGHT';
  }

  // Utility methods for getting game information
  getScore(): number {
    return this.gameState.score;
  }

  getLives(): number {
    return this.gameState.lives;
  }

  getTimeRemaining(): number {
    return Math.ceil(this.gameState.timeRemaining / 1000); // Return seconds
  }

  getTimeRemainingMs(): number {
    return this.gameState.timeRemaining; // Return milliseconds for precise display
  }

  getTimeRemainingFormatted(): string {
    const seconds = Math.ceil(this.gameState.timeRemaining / 1000);
    return `${seconds}s`;
  }

  getPlayerPosition(): { position: string; x: number; y: number } {
    return {
      position: this.gameState.player.position,
      x: this.gameState.player.x,
      y: this.gameState.player.y,
    };
  }

  getPlayerState(): PlayerState {
    return { ...this.gameState.player };
  }

  isPlayerMoving(): boolean {
    return this.gameState.player.isMoving;
  }

  getPlayerAnimationProgress(): number {
    return this.gameState.player.animationProgress;
  }

  getShonzikaPosition(): { x: number; y: number; sprite: string } {
    return {
      x: this.gameState.shonzika.x,
      y: this.gameState.shonzika.y,
      sprite: this.gameState.shonzika.sprite,
    };
  }

  getFallingItems(): FallingItem[] {
    return [...this.gameState.items];
  }

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

  // Touch input helper methods
  getPlayerPositionFromTouch(touchX: number): 'LEFT' | 'CENTER' | 'RIGHT' {
    const screenWidth = this.gameState.screenWidth;
    const leftZone = screenWidth * 0.33;
    const rightZone = screenWidth * 0.67;
    
    if (touchX < leftZone) {
      return 'LEFT';
    } else if (touchX > rightZone) {
      return 'RIGHT';
    } else {
      return 'CENTER';
    }
  }

  getTouchZones(): { left: number; center: number; right: number } {
    const screenWidth = this.gameState.screenWidth;
    return {
      left: screenWidth * 0.33,
      center: screenWidth * 0.67,
      right: screenWidth,
    };
  }

  canPlayerMove(): boolean {
    return this.gameState.phase === 'PLAYING';
  }

  // Method to manually trigger game end condition check (useful for testing)
  checkGameEnd(): void {
    this.checkGameEndConditions();
  }

  // Sprite animation methods for rendering
  getCurrentMiroSprite(): any {
    return this.gameState.animations.miro.getCurrentFrame();
  }

  getCurrentShonzikaSprite(): any {
    return this.gameState.animations.shonzika.getCurrentFrame();
  }

  // Get sprite for specific item type
  getItemSprite(itemType: ItemType): any {
    if (!this.assets) return null;
    
    switch (itemType) {
      case 'EGG':
        return this.assets.items.egg;
      case 'TOMATO':
        return this.assets.items.tomato;
      case 'PEPPER':
        return this.assets.items.pepper;
      case 'ELECTRIC_SHOCK':
        return this.assets.items.electricShock;
      case 'BOMB':
        return this.assets.items.bomb;
      default:
        return null;
    }
  }

  // Animation state queries
  isMiroAnimationComplete(): boolean {
    return this.gameState.animations.miro.isAnimationComplete();
  }

  isShonzikaAnimationComplete(): boolean {
    return this.gameState.animations.shonzika.isAnimationComplete();
  }

  getMiroAnimationProgress(): number {
    return this.gameState.animations.miro.getAnimationProgress();
  }

  getShonzikaAnimationProgress(): number {
    return this.gameState.animations.shonzika.getAnimationProgress();
  }
}
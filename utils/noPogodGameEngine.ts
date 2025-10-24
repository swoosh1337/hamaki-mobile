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
  speedBoostActive: boolean;
  speedBoostEndTime: number;
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
  mustCatch: boolean;
  shouldAvoid: boolean;
}

export interface ShonzikaState {
  position: 'LEFT' | 'CENTER' | 'RIGHT';
  x: number;
  y: number;
  targetX: number;
  startX: number;
  isMoving: boolean;
  sprite: 'IDLE' | 'THROWING' | 'WALKING';
  throwCooldown: number;
  animationProgress: number;
  movementStartTime: number;
  nextMoveTime: number;
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
  ITEM_FALL_SPEED: 2.5,
  ITEM_FALL_ACCELERATION: 0.05,
  
  // Positions
  PLAYER_POSITIONS: {
    LEFT: 0.25,
    CENTER: 0.5,
    RIGHT: 0.75,
  },
  SHONZIKA_POSITION: { x: 0.5, y: 0.35 },  // 35% from top to ensure visibility below safe area
  MIRO_GROUND_Y: 0.75,  // 75% from top - good position for catching
  
  // Sprites
  CHARACTER_SIZE: 80,
  ITEM_SIZE: 40,
  
  // Animation
  PLAYER_MOVE_DURATION: 200, // milliseconds for smooth movement
  PLAYER_MOVE_SPEED: 0.8, // movement interpolation speed
  PLAYER_MOVE_DURATION_BOOSTED: 100, // milliseconds for boosted movement (2x faster)
  SPEED_BOOST_DURATION: 5000, // 5 seconds speed boost duration
  SHONZIKA_MOVE_DURATION: 2000, // milliseconds for Shonzika movement (slower, more deliberate)
  SHONZIKA_MOVE_INTERVAL_MIN: 100, // minimum time between movements (very short for continuous movement)
  SHONZIKA_MOVE_INTERVAL_MAX: 300, // maximum time between movements (very short for continuous movement)
  
  // Item probabilities
  ITEM_SPAWN_WEIGHTS: {
    EGG: 30,
    TOMATO: 25,
    PEPPER: 25,
    ELECTRIC_SHOCK: 15,
    BOMB: 5,
  },
} as const;

// Item type definitions with specific behaviors
export const ITEM_DEFINITIONS: Record<ItemType, { 
  points: number; 
  isBad: boolean; 
  isDeadly: boolean;
  mustCatch: boolean; // If true, missing this item causes game over
  shouldAvoid: boolean; // If true, catching this item is bad
}> = {
  EGG: { 
    points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, 
    isBad: false, 
    isDeadly: false,
    mustCatch: false,
    shouldAvoid: false,
  },
  TOMATO: { 
    points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, 
    isBad: false, 
    isDeadly: false,
    mustCatch: false,
    shouldAvoid: false,
  },
  PEPPER: { 
    points: NO_POGOD_CONFIG.GOOD_ITEM_POINTS, 
    isBad: false, 
    isDeadly: false,
    mustCatch: false,
    shouldAvoid: false,
  },
  ELECTRIC_SHOCK: { 
    points: 0, 
    isBad: true, 
    isDeadly: false,
    mustCatch: false, // Good to miss
    shouldAvoid: true, // Should avoid catching
  },
  BOMB: { 
    points: 0, 
    isBad: false, // Not "bad" in the sense that catching it loses a life
    isDeadly: true, // Deadly means game over when caught
    mustCatch: true, // Must catch or game over
    shouldAvoid: false, // Must catch, not avoid
  },
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
    const shonzikaX = screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER;
    
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
        speedBoostActive: false,
        speedBoostEndTime: 0,
      },
      items: [],
      shonzika: {
        position: 'CENTER',
        x: shonzikaX,
        y: shonzikaY,
        targetX: shonzikaX,
        startX: shonzikaX,
        isMoving: false,
        sprite: 'IDLE',
        throwCooldown: 0,
        animationProgress: 1.0,
        movementStartTime: 0,
        nextMoveTime: this.getRandomMoveTime(),
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
    this.gameState.player.speedBoostActive = false;
    this.gameState.player.speedBoostEndTime = 0;
    
    const shonzikaX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER;
    this.gameState.shonzika.position = 'CENTER';
    this.gameState.shonzika.x = shonzikaX;
    this.gameState.shonzika.targetX = shonzikaX;
    this.gameState.shonzika.startX = shonzikaX;
    this.gameState.shonzika.isMoving = false;
    this.gameState.shonzika.sprite = 'IDLE';
    this.gameState.shonzika.throwCooldown = 0;
    this.gameState.shonzika.animationProgress = 1.0;
    this.gameState.shonzika.movementStartTime = 0;
    this.gameState.shonzika.nextMoveTime = this.getRandomMoveTime();
  }

  /**
   * Start continuous movement in a direction (hold-to-move)
   */
  startContinuousMovement(direction: 'LEFT' | 'RIGHT'): void {
    if (this.gameState.phase !== 'PLAYING') return;

    console.log('🎮 ENGINE: Start continuous movement:', direction);

    this.gameState.player.position = direction;
    this.gameState.player.isMoving = true;
    this.gameState.player.sprite = 'MOVING';

    // Start walking animation
    if (this.gameAnimations) {
      this.gameState.animations.miro.startAnimation(this.gameAnimations.miro.walking);
    }
  }

  /**
   * Stop continuous movement
   */
  stopContinuousMovement(): void {
    console.log('🎮 ENGINE: Stop continuous movement at x:', this.gameState.player.x);

    this.gameState.player.isMoving = false;
    this.gameState.player.sprite = 'IDLE';
    this.gameState.player.animationProgress = 1.0;

    // Switch back to idle animation
    if (this.gameAnimations) {
      this.gameState.animations.miro.startAnimation(this.gameAnimations.miro.idle);
    }
  }

  // OLD DISCRETE MOVEMENT (DEPRECATED - keeping for backwards compatibility)
  movePlayer(direction: 'LEFT' | 'CENTER' | 'RIGHT'): void {
    if (this.gameState.phase !== 'PLAYING') return;

    const previousPosition = this.gameState.player.position;

    // Only start movement if position is different
    if (previousPosition !== direction) {
      this.gameState.player.startX = this.gameState.player.x;
      this.gameState.player.position = direction;
      this.gameState.player.targetX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS[direction];
      this.gameState.player.isMoving = true;
      this.gameState.player.sprite = 'MOVING';
      this.gameState.player.animationProgress = 0.0;
      this.gameState.player.movementStartTime = this.gameTimer;

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
      
      // Update speed boost timer
      this.updateSpeedBoost();
    }
  }

  /**
   * Update speed boost state and automatically deactivate after duration
   */
  private updateSpeedBoost(): void {
    if (this.gameState.player.speedBoostActive) {
      // Check if speed boost has expired
      if (this.gameTimer >= this.gameState.player.speedBoostEndTime) {
        this.gameState.player.speedBoostActive = false;
        this.gameState.player.speedBoostEndTime = 0;
      }
    }
  }

  /**
   * Activate speed boost for 5 seconds
   */
  public activateSpeedBoost(): void {
    this.gameState.player.speedBoostActive = true;
    this.gameState.player.speedBoostEndTime = this.gameTimer + NO_POGOD_CONFIG.SPEED_BOOST_DURATION;
  }

  private updateAnimations(currentTime: number): void {
    // Update character animations
    this.gameState.animations.miro.update(currentTime);
    this.gameState.animations.shonzika.update(currentTime);
  }

  private updatePlayer(deltaTime: number): void {
    const player = this.gameState.player;

    if (player.isMoving) {
      // Continuous movement system
      const moveSpeed = player.speedBoostActive ? 8 : 4;  // Pixels per frame (faster!)

      const oldX = player.x;

      // Move in the current direction
      if (player.position === 'LEFT') {
        console.log('⬅️ MOVING LEFT: Before move - x:', player.x, 'moveSpeed:', moveSpeed);
        player.x -= moveSpeed;
        console.log('⬅️ MOVING LEFT: After move - x:', player.x);

        // Clamp to left edge - needs to account for character size!
        // Character is 150px wide (scaled), so half is 75px
        // Left edge should be 75px from left (so character doesn't go off-screen)
        const characterHalfWidth = 75;
        const leftEdge = characterHalfWidth + 10;  // 85px from left edge
        const leftSpriteEdge = player.x - characterHalfWidth;  // Actual left edge of sprite
        const rightSpriteEdge = player.x + characterHalfWidth;  // Actual right edge of sprite

        console.log('⬅️ LEFT BOUNDS CHECK: Center x:', player.x, '| Sprite left edge:', leftSpriteEdge, '| Sprite right edge:', rightSpriteEdge, '| Screen width:', this.gameState.screenWidth);
        console.log('⬅️ LEFT VISIBILITY: Left edge on screen?', leftSpriteEdge >= 0, '| Right edge on screen?', rightSpriteEdge <= this.gameState.screenWidth);

        if (player.x < leftEdge) {
          console.log('⬅️ HIT LEFT BOUNDARY! Clamping from', player.x, 'to', leftEdge);
          player.x = leftEdge;
        }
      } else if (player.position === 'RIGHT') {
        console.log('➡️ MOVING RIGHT: Before move - x:', player.x, 'moveSpeed:', moveSpeed);
        player.x += moveSpeed;
        console.log('➡️ MOVING RIGHT: After move - x:', player.x);

        // Clamp to right edge
        const characterHalfWidth = 75;
        const rightEdge = this.gameState.screenWidth - characterHalfWidth - 10;  // Stay within screen
        const leftSpriteEdge = player.x - characterHalfWidth;  // Actual left edge of sprite
        const rightSpriteEdge = player.x + characterHalfWidth;  // Actual right edge of sprite

        console.log('➡️ RIGHT BOUNDS CHECK: Center x:', player.x, '| Sprite left edge:', leftSpriteEdge, '| Sprite right edge:', rightSpriteEdge, '| Screen width:', this.gameState.screenWidth);
        console.log('➡️ RIGHT VISIBILITY: Left edge on screen?', leftSpriteEdge >= 0, '| Right edge on screen?', rightSpriteEdge <= this.gameState.screenWidth);

        if (player.x > rightEdge) {
          console.log('➡️ HIT RIGHT BOUNDARY! Clamping from', player.x, 'to', rightEdge);
          player.x = rightEdge;
        }
      }

      // Update animation progress for walking cycle
      player.animationProgress = (player.animationProgress + 0.05) % 1.0;

      if (oldX !== player.x) {
        console.log('🎮 ENGINE: Player moved', player.position, 'from', oldX, '→', player.x, '(delta:', player.x - oldX, ')');
      }
    }
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private getRandomMoveTime(): number {
    const min = NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MIN;
    const max = NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MAX;
    return min + Math.random() * (max - min);
  }

  private getRandomPosition(): 'LEFT' | 'CENTER' | 'RIGHT' {
    const positions: ('LEFT' | 'CENTER' | 'RIGHT')[] = ['LEFT', 'CENTER', 'RIGHT'];
    return positions[Math.floor(Math.random() * positions.length)];
  }

  private updateItems(deltaTime: number): void {
    // Update existing items
    this.gameState.items = this.gameState.items.filter(item => {
      // Update item position
      item.y += item.velocityY;
      item.velocityY += NO_POGOD_CONFIG.ITEM_FALL_ACCELERATION;

      // Check if item has fallen past the catch zone (missed)
      const catchY = this.gameState.player.y;
      if (item.y > catchY + NO_POGOD_CONFIG.ITEM_SIZE * 2) {
        // Item was missed
        this.handleItemMiss(item);
        return false; // Remove missed item
      }

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
    const shonzika = this.gameState.shonzika;
    
    // Update throw cooldown
    if (shonzika.throwCooldown > 0) {
      shonzika.throwCooldown -= deltaTime;
      if (shonzika.throwCooldown <= 0) {
        shonzika.throwCooldown = 0;
        // Only return to idle if not moving
        if (!shonzika.isMoving) {
          shonzika.sprite = 'IDLE';
          
          // Switch back to idle animation
          if (this.gameAnimations) {
            this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.idle);
          }
        } else {
          // If moving, return to walking sprite
          shonzika.sprite = 'WALKING';
          if (this.gameAnimations) {
            this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.walking);
          }
        }
      }
    }
    
    // Handle movement animation
    if (shonzika.isMoving) {
      // Calculate animation progress based on time elapsed
      const elapsedTime = this.gameTimer - shonzika.movementStartTime;
      const progress = Math.min(elapsedTime / NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION, 1.0);
      
      // Update animation progress
      shonzika.animationProgress = progress;
      
      // Smooth interpolation between start and target position
      const easedProgress = this.easeInOutQuad(progress);
      shonzika.x = shonzika.startX + (shonzika.targetX - shonzika.startX) * easedProgress;
      
      // Check if movement is complete
      if (progress >= 1.0) {
        shonzika.x = shonzika.targetX;
        shonzika.isMoving = false;
        shonzika.animationProgress = 1.0;

        console.log('🎯 Shonzika COMPLETED movement to position:', shonzika.position, 'at x:', shonzika.x);

        // Schedule next movement
        shonzika.nextMoveTime = this.gameTimer + this.getRandomMoveTime();

        // Only set to idle if not throwing
        if (shonzika.throwCooldown <= 0) {
          shonzika.sprite = 'IDLE';

          // Switch back to idle animation
          if (this.gameAnimations) {
            this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.idle);
          }
        }
      }
    } else if (shonzika.throwCooldown <= 0) {
      // Only check for new movement if not throwing
      // Check if it's time to start a new movement
      if (this.gameTimer >= shonzika.nextMoveTime) {
        // New movement pattern: bounce between LEFT and RIGHT edges continuously
        let newPosition: 'LEFT' | 'CENTER' | 'RIGHT';

        console.log('🎯 Shonzika deciding movement - current position:', shonzika.position, 'x:', shonzika.x, 'targetX:', shonzika.targetX, 'startX:', shonzika.startX);

        // Simple bounce: if at LEFT, go RIGHT; if at RIGHT, go LEFT
        if (shonzika.position === 'LEFT') {
          newPosition = 'RIGHT';
          console.log('🎯 At LEFT → moving RIGHT');
        } else if (shonzika.position === 'RIGHT') {
          newPosition = 'LEFT';
          console.log('🎯 At RIGHT → moving LEFT');
        } else {
          // At CENTER - determine direction based on LAST completed movement
          // Check which direction we just came from
          if (shonzika.x > this.gameState.screenWidth * 0.5) {
            // We're on the right side of center, go LEFT
            newPosition = 'LEFT';
            console.log('🎯 At CENTER (right side) → moving LEFT');
          } else {
            // We're on the left side of center, go RIGHT
            newPosition = 'RIGHT';
            console.log('🎯 At CENTER (left side) → moving RIGHT');
          }
        }

        // Start movement
        shonzika.startX = shonzika.x;
        shonzika.position = newPosition;
        shonzika.targetX = this.gameState.screenWidth * NO_POGOD_CONFIG.PLAYER_POSITIONS[newPosition];
        shonzika.isMoving = true;
        shonzika.sprite = 'WALKING';
        shonzika.animationProgress = 0.0;
        shonzika.movementStartTime = this.gameTimer;

        console.log('🎯 Shonzika STARTING movement to:', newPosition, 'targetX:', shonzika.targetX, 'startX:', shonzika.startX);

        // Start walking animation
        if (this.gameAnimations) {
          this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.walking);
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
    
    // Calculate hand position based on Shonzika's current state
    const handPosition = this.calculateShonzikaHandPosition();
    
    const item: FallingItem = {
      id: `item_${Date.now()}_${Math.random()}`,
      type: itemType,
      x: handPosition.x,
      y: handPosition.y,
      velocityY: NO_POGOD_CONFIG.ITEM_FALL_SPEED,
      sprite: itemSprite,
      points: itemDef.points,
      isBad: itemDef.isBad,
      isDeadly: itemDef.isDeadly,
      mustCatch: itemDef.mustCatch,
      shouldAvoid: itemDef.shouldAvoid,
    };

    this.gameState.items.push(item);
    
    // Set Shonzika to throwing state and start throwing animation
    this.gameState.shonzika.sprite = 'THROWING';
    this.gameState.shonzika.throwCooldown = 900; // 900ms throw animation (6 frames * 150ms)
    
    if (this.gameAnimations) {
      this.gameState.animations.shonzika.startAnimation(this.gameAnimations.shonzika.throwing);
    }
  }

  /**
   * Calculate Shonzika's hand position based on current sprite and position
   * This ensures items spawn from the correct hand location
   */
  private calculateShonzikaHandPosition(): { x: number; y: number } {
    const shonzika = this.gameState.shonzika;
    const characterSize = 150; // Base character size (matches rendering)
    
    // Base hand offsets for different sprites (relative to character center)
    // These values are based on the sprite artwork and may need fine-tuning
    let handOffsetX = 0;
    let handOffsetY = 0;
    
    // Determine hand offset based on current sprite state
    if (shonzika.sprite === 'THROWING') {
      // When throwing, hand is extended forward
      // Hand is typically in front of the character
      handOffsetX = 40; // Hand extends forward
      handOffsetY = -10; // Hand is slightly above center
    } else if (shonzika.sprite === 'WALKING' || shonzika.isMoving) {
      // When walking, hand is at side
      handOffsetX = 20; // Hand at side
      handOffsetY = 0; // Hand at center height
    } else {
      // When idle, hand is at rest position
      handOffsetX = 25; // Hand slightly forward
      handOffsetY = 5; // Hand slightly below center
    }
    
    // Adjust hand offset based on Shonzika's position (flip for left side)
    // When Shonzika is on the left, we need to flip the horizontal offset
    const isOnLeft = shonzika.position === 'LEFT' || 
                     (shonzika.isMoving && shonzika.targetX < shonzika.x);
    
    if (isOnLeft) {
      handOffsetX = -handOffsetX; // Flip horizontal offset for left-facing
    }
    
    // Calculate final hand position
    // Start from Shonzika's center position and apply offsets
    const handX = shonzika.x + handOffsetX;
    const handY = shonzika.y + handOffsetY + (characterSize * 0.2); // Offset down from center
    
    return {
      x: handX,
      y: handY,
    };
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

  /**
   * Handle item catch with specific behaviors per item type
   */
  private handleItemCatch(item: FallingItem): void {
    switch (item.type) {
      case 'EGG':
        // EGG: +10 points, award XP when caught
        this.gameState.score += item.points;
        // TODO: Award XP (will be handled by game component)
        break;
        
      case 'TOMATO':
        // TOMATO: +10 points, award XP when caught
        this.gameState.score += item.points;
        // TODO: Award XP (will be handled by game component)
        break;
        
      case 'PEPPER':
        // PEPPER: +10 points, award XP, activate 5-second speed boost when caught
        this.gameState.score += item.points;
        // TODO: Award XP (will be handled by game component)
        // Activate speed boost
        this.activateSpeedBoost();
        break;
        
      case 'ELECTRIC_SHOCK':
        // ELECTRIC_SHOCK: -1 life when caught (player should avoid)
        this.gameState.lives--;
        break;
        
      case 'BOMB':
        // BOMB: Catching a bomb causes immediate game over
        this.gameState.phase = 'GAME_OVER';
        break;
    }
  }

  /**
   * Handle item miss with different consequences per item type
   */
  private handleItemMiss(item: FallingItem): void {
    switch (item.type) {
      case 'BOMB':
        // BOMB miss: Immediate game over if bomb is not caught
        this.gameState.phase = 'GAME_OVER';
        break;
        
      case 'ELECTRIC_SHOCK':
        // ELECTRIC_SHOCK miss: No penalty (good to miss)
        // Do nothing - this is the desired outcome
        break;
        
      case 'EGG':
      case 'TOMATO':
      case 'PEPPER':
        // Good items: No penalty for missing (just lost opportunity for points)
        // Do nothing
        break;
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

  getShonzikaHandPosition(): { x: number; y: number } {
    return this.calculateShonzikaHandPosition();
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

  // Speed boost state queries
  isSpeedBoostActive(): boolean {
    return this.gameState.player.speedBoostActive;
  }

  getSpeedBoostTimeRemaining(): number {
    if (!this.gameState.player.speedBoostActive) {
      return 0;
    }
    return Math.max(0, this.gameState.player.speedBoostEndTime - this.gameTimer);
  }

  getSpeedBoostTimeRemainingSeconds(): number {
    return Math.ceil(this.getSpeedBoostTimeRemaining() / 1000);
  }
}
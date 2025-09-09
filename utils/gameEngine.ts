// Game Engine for Hammock Jump Game
export interface GameState {
  phase: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
  score: number;
  lives: number;
  player: {
    x: number;
    y: number;
    velocityY: number;
    isJumping: boolean;
    isGrounded: boolean;
    groundY: number;
  };
  screenWidth: number;
  screenHeight: number;
}

export interface GameAssets {
  background: any;
  person1: any;
  person2: any;
  person3: any;
}

// Physics constants
export const PHYSICS = {
  GRAVITY: 0.8,
  JUMP_FORCE: -16,
  GROUND_FRICTION: 0.9,
  MAX_FALL_SPEED: 15,
} as const;

// Game configuration
export const GAME_CONFIG = {
  INITIAL_LIVES: 3,
  PLAYER_SIZE: 64,
  PERSON_SIZE: 64,
} as const;

export class HammockGameEngine {
  private gameState: GameState;
  private lastUpdateTime: number = 0;

  constructor(screenWidth: number, screenHeight: number) {
    this.gameState = this.createInitialState(screenWidth, screenHeight);
  }

  private createInitialState(screenWidth: number, screenHeight: number): GameState {
    const groundY = screenHeight * 0.8; // Ground at 80% of screen height
    
    return {
      phase: 'MENU',
      score: 0,
      lives: GAME_CONFIG.INITIAL_LIVES,
      player: {
        x: screenWidth / 2,
        y: groundY,
        velocityY: 0,
        isJumping: false,
        isGrounded: true,
        groundY,
      },
      screenWidth,
      screenHeight,
    };
  }

  getState(): GameState {
    return { ...this.gameState };
  }

  startGame(): void {
    this.gameState.phase = 'PLAYING';
    this.lastUpdateTime = 0; // Reset timing for new game
  }

  pauseGame(): void {
    this.gameState.phase = 'PAUSED';
  }

  exitGame(): void {
    this.gameState.phase = 'MENU';
    this.resetGame();
  }

  private resetGame(): void {
    this.gameState.score = 0;
    this.gameState.lives = GAME_CONFIG.INITIAL_LIVES;
    this.gameState.player.y = this.gameState.player.groundY;
    this.gameState.player.velocityY = 0;
    this.gameState.player.isJumping = false;
    this.gameState.player.isGrounded = true;
    this.lastUpdateTime = 0;
  }

  jump(): void {
    if (this.gameState.phase !== 'PLAYING') return;
    
    // Only allow jumping if player is grounded
    if (this.gameState.player.isGrounded) {
      this.gameState.player.velocityY = PHYSICS.JUMP_FORCE;
      this.gameState.player.isJumping = true;
      this.gameState.player.isGrounded = false;
    }
  }

  update(currentTime: number): void {
    if (this.gameState.phase !== 'PLAYING') return;

    // Initialize lastUpdateTime on first update
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = currentTime;
      return;
    }

    const deltaTime = currentTime - this.lastUpdateTime;
    this.lastUpdateTime = currentTime;

    // Skip if delta time is too large (first frame or after pause)
    if (deltaTime > 100) return;

    this.updatePlayer();
  }

  private updatePlayer(): void {
    const player = this.gameState.player;

    // Apply gravity
    if (!player.isGrounded) {
      player.velocityY += PHYSICS.GRAVITY;
      player.velocityY = Math.min(player.velocityY, PHYSICS.MAX_FALL_SPEED);
    }

    // Update position
    player.y += player.velocityY;

    // Ground collision
    if (player.y >= player.groundY) {
      player.y = player.groundY;
      player.velocityY = 0;
      player.isJumping = false;
      player.isGrounded = true;
    }
  }

  // Get positions for rendering
  getPlayerPosition(): { x: number; y: number; isJumping: boolean } {
    return {
      x: this.gameState.player.x,
      y: this.gameState.player.y,
      isJumping: this.gameState.player.isJumping,
    };
  }

  getPerson1Position(): { x: number; y: number } {
    // Left corner position
    return {
      x: this.gameState.screenWidth * 0.15,
      y: this.gameState.player.groundY,
    };
  }

  getPerson2Position(): { x: number; y: number } {
    // Right corner position
    return {
      x: this.gameState.screenWidth * 0.85,
      y: this.gameState.player.groundY,
    };
  }

  addScore(points: number): void {
    if (this.gameState.phase === 'PLAYING') {
      this.gameState.score += points;
    }
  }

  loseLife(): void {
    if (this.gameState.phase === 'PLAYING') {
      this.gameState.lives--;
      if (this.gameState.lives <= 0) {
        this.gameState.phase = 'GAME_OVER';
      }
    }
  }
}
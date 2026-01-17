// Doodle Jump-style Engine for Hammock Jump
import { createLogger } from '@/utils/logger';

const log = createLogger('GameEngine');

export interface GameState {
  phase: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
  score: number;
  maxHeight: number; // Track highest point reached for XP calculation
  screenWidth: number;
  screenHeight: number;
  player: {
    x: number;
    y: number;
    vy: number;
    vx: number; // horizontal velocity for boosts
    width: number;
    height: number;
    hasShield?: boolean;
    shieldTime?: number;
    isGrounded: boolean;
    isOnIce: boolean; // Slippery ice platform effect
    groundedFrames: number; // Track frames since last grounded to prevent flicker
  };
  cameraY: number; // how far the world has scrolled up
  platforms: Platform[];
  particles: Particle[];
  screenShake: number;
  combo: number; // consecutive platform hits
  lastScoredPlatformId: string | null; // Track last platform that gave score
  lastLandingTime: number; // Timestamp of last platform landing for combo timing
  lastComboPlatformId: string | null; // Track last platform for combo (different platform required)
  gameTime: number; // Time elapsed in seconds
  items: Item[];
}

export interface Item {
  id: string;
  x: number;
  y: number;
  type: 'egg' | 'tomato' | 'pepper';
  width: number;
  height: number;
  collected: boolean;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number; // moving platforms
  type: 'normal' | 'moving' | 'breakable' | 'spring' | 'bouncy' | 'ice' | 'conveyor' | 'disappearing' | 'crumbling';
  broken?: boolean; // for breakable platforms
  springUsed?: boolean; // for spring platforms
  scored?: boolean; // track if this platform already gave score
  conveyorDirection?: 1 | -1; // for conveyor platforms
  // Disappearing platform state
  disappearTimer?: number; // countdown in ms after landing
  isDisappearing?: boolean; // true when fading
  opacity?: number; // 0-1 for fade effect
  // Crumbling platform state
  crumbleTimer?: number; // countdown in ms after landing
  isCrumbling?: boolean; // true when shaking/falling
  shakeOffset?: number; // horizontal shake offset
  fallVy?: number; // vertical velocity when falling
}

export interface GameAssets {
  background: any;
  player: any;
}

const PHYSICS = {
  GRAVITY: 0.8, // px/frame (proper gravity)
  JUMP_VELOCITY: -15, // px/frame upward - max height ~140px
  SPRING_VELOCITY: -25, // px/frame upward (super bounce) - max height ~390px
  BOUNCY_VELOCITY: -20, // px/frame upward - MORE DRAMATIC ~250px max height
  HORIZONTAL_SPEED: 6, // px/frame (responsive movement)
  MAX_FALL_SPEED: 20, // px/frame (terminal velocity)
  PLATFORM_SPEED: 100, // px/second baseline for moving platforms (scaled by frameMultiplier)
  ICE_FRICTION: 0.995, // MORE SLIPPERY - almost no friction (1.0 = no friction)
  ICE_SLIDE_FORCE: 8, // Stronger initial slide force
  CONVEYOR_SPEED: 3, // px/frame horizontal push for conveyor platforms
  // Disappearing/Crumbling timers
  DISAPPEAR_DELAY: 800, // ms before platform starts fading
  DISAPPEAR_DURATION: 400, // ms for fade animation
  CRUMBLE_DELAY: 500, // ms before platform starts falling
  CRUMBLE_SHAKE_DURATION: 300, // ms of shaking before fall
};

export const GAME_CONFIG = {
  PLAYER_SIZE: 64,
  PLATFORM_HEIGHT: 14,
  // Gap tuning: designed for single jump only (max jump height ~140px)
  BASE_PLATFORM_GAP: 60,        // px — initial average vertical gap (easy start)
  MAX_PLATFORM_GAP: 115,        // px — max gap at high difficulty (still reachable with single jump)
  // Width tuning: start wide (easy), get narrower (hard)
  PLATFORM_WIDTH_MIN_EASY: 100,
  PLATFORM_WIDTH_MIN_HARD: 50,  // Narrower at high difficulty but not too hard
  PLATFORM_WIDTH_MAX_EASY: 160,
  PLATFORM_WIDTH_MAX_HARD: 90,  // Smaller max width
  // Count tuning: start with more platforms visible, then reduce to increase challenge
  TARGET_COUNT_EASY: 18,        // More platforms for easier gameplay
  TARGET_COUNT_HARD: 10,        // Still reasonable at high difficulty
  // Moving platform speed tuning
  MOVING_SPEED_BASE: 0.06,      // Slightly slower base speed
  MOVING_SPEED_MAX: 0.14,       // Max speed at high difficulty
  // Scoring: points per platform landed (not continuous)
  SCORE_PER_PLATFORM: 10,       // Base score per platform
  COMBO_MULTIPLIER: 2,          // Bonus for combos
  // Sparsity controls: probability to skip spawning a platform (creates gaps)
  SPARSE_SKIP_PROB_EASY: 0.05,  // Lower skip probability
  SPARSE_SKIP_PROB_HARD: 0.20,  // Reduced from 0.35 to ensure reachability
  // Horizontal spacing: minimum separation between consecutive platforms
  MIN_H_SEPARATION_EASY: 0.08,  // as fraction of screen width
  MIN_H_SEPARATION_HARD: 0.20,  // Slightly reduced for single jump
  // Item configs
  SPAWN_ITEM_CHANCE: 0.12, // 12% chance - items are rare but valuable
  ITEM_SIZE: 48,
  // Dynamic scoring based on difficulty (calculated at runtime)
  ITEM_SCORE_BASE: 100,     // Base points at start
  ITEM_SCORE_MAX: 200,      // Max points at high difficulty
  // Physics-based reachability (single jump only - max jump height ~140px)
  MAX_REACHABLE_HEIGHT: 115,     // Conservative max vertical reach with single jump
  MAX_REACHABLE_HORIZONTAL: 160, // Max horizontal distance during jump arc
} as const;

// Item spawn pattern types
type ItemSpawnPattern = 'GAP_JUMPER' | 'OPPOSITE_SIDE' | 'BELOW_PLATFORM' | 'MOVING_TARGET' | 'ZIGZAG_TRAIL';

export class HammockGameEngine {
  private gameState: GameState;
  private lastUpdateTime = 0;
  private moveDir: -1 | 0 | 1 = 0;
  private moveAnalog = 0; // -1..1 from device tilt

  // Audio callbacks
  public onPlatformLand: (() => void) | null = null;
  public onPlayerFalling: (() => void) | null = null;
  public onItemCollected: ((itemType: string) => void) | null = null;
  public onBigBoostLand: (() => void) | null = null; // Spring, Bouncy platforms
  public onSpecialPlatformLand: (() => void) | null = null; // Moving, Ice, Conveyor, Disappearing, Crumbling
  public onBreakableLand: (() => void) | null = null; // Breakable platforms
  private fallingTriggered = false;

  // Player freeze state (for K animation)
  private isPlayerFrozen = false;

  constructor(screenWidth: number, screenHeight: number) {
    this.gameState = this.createInitialState(screenWidth, screenHeight);
  }

  private createInitialState(screenWidth: number, screenHeight: number): GameState {
    const playerSize = GAME_CONFIG.PLAYER_SIZE;
    const startY = screenHeight * 0.7;

    const initial: GameState = {
      phase: 'MENU',
      score: 0,
      maxHeight: startY, // Initialize with starting position
      screenWidth,
      screenHeight,
      player: {
        x: screenWidth / 2 - playerSize / 2,
        y: startY,
        vy: 0,
        vx: 0,
        width: playerSize,
        height: playerSize,
        hasShield: false,
        shieldTime: 0,
        isGrounded: false,
        isOnIce: false,
        groundedFrames: 0,
      },
      cameraY: 0,
      platforms: [],
      particles: [],
      screenShake: 0,
      combo: 0,
      lastScoredPlatformId: null,
      lastLandingTime: 0,
      lastComboPlatformId: null,
      gameTime: 0,
      items: [],
    };

    // seed platforms
    this.seedPlatforms(initial);
    return initial;
  }

  private seedPlatforms(state: GameState) {
    state.platforms = [];
    const { screenWidth, screenHeight } = state;
    const gap = GAME_CONFIG.BASE_PLATFORM_GAP;

    // Generate initial platforms - starting from the start platform
    let lastX = screenWidth / 2; // Start from center

    // First, create a starting platform right below the player
    const startPlatformWidth = 120;
    const startPlatformX = Math.max(0, Math.min(screenWidth - startPlatformWidth, state.player.x - startPlatformWidth / 2));
    const startPlatformY = state.player.y + state.player.height + 20;

    state.platforms.push({
      id: 'start',
      x: startPlatformX,
      y: startPlatformY,
      width: startPlatformWidth,
      height: GAME_CONFIG.PLATFORM_HEIGHT,
      vx: 0,
      type: 'normal'
    });

    // Create a few platforms below the start platform (but not below screen bottom)
    let y = startPlatformY + gap;
    lastX = startPlatformX;
    const screenBottom = screenHeight;

    while (y < screenBottom - 50 && state.platforms.length < 5) {
      // Wide platforms at start (easy)
      const width = this.randBetween(GAME_CONFIG.PLATFORM_WIDTH_MIN_EASY, GAME_CONFIG.PLATFORM_WIDTH_MAX_EASY);
      const x = this.generateReachablePlatformX(lastX, width, screenWidth, 0);

      state.platforms.push({
        id: Math.random().toString(36).slice(2),
        x, y, width,
        height: GAME_CONFIG.PLATFORM_HEIGHT,
        vx: 0, // No moving platforms at start
        type: 'normal'
      });

      lastX = x;
      y += gap;
    }

    // Now create platforms ABOVE the start platform (reachable with single jump)
    // Start from the start platform position, not player position
    y = startPlatformY - gap;
    lastX = startPlatformX;

    while (y > -screenHeight * 2 && state.platforms.length < 25) {
      // Wide platforms and gentle movement at start (difficulty=0)
      const width = this.randBetween(GAME_CONFIG.PLATFORM_WIDTH_MIN_EASY, GAME_CONFIG.PLATFORM_WIDTH_MAX_EASY);
      const x = this.generateReachablePlatformX(lastX, width, screenWidth, 0);
      const platformType = this.getPlatformType(y, screenHeight, 0);
      const speed = GAME_CONFIG.MOVING_SPEED_BASE;
      const vx = platformType === 'moving' ? (Math.random() < 0.5 ? -speed : speed) : 0;

      state.platforms.push({
        id: Math.random().toString(36).slice(2),
        x, y, width,
        height: GAME_CONFIG.PLATFORM_HEIGHT,
        vx,
        type: platformType
      });

      lastX = x;
      y -= gap;
    }

    log.info(`Game started with ${state.platforms.length} platforms`);
  }

  private getPlatformType(y: number, screenHeight: number, difficulty: number = 0): Platform['type'] {
    const heightRatio = Math.abs(y) / screenHeight;
    const bias = Math.min(0.25, 0.25 * difficulty); // up to +25% more chance for special types

    // Higher up = more special platforms
    if (heightRatio > 3) {
      const rand = Math.random();
      if (rand < 0.08 + bias * 0.3) return 'spring';
      if (rand < 0.14 + bias * 0.4) return 'bouncy';
      if (rand < 0.20 + bias * 0.3) return 'ice';
      if (rand < 0.26 + bias * 0.3) return 'conveyor';
      if (rand < 0.38 + bias * 0.5) return 'breakable';
      if (rand < 0.55 + bias) return 'moving';
    } else if (heightRatio > 2) {
      const rand = Math.random();
      if (rand < 0.05 + bias * 0.2) return 'spring';
      if (rand < 0.12 + bias * 0.3) return 'bouncy';
      if (rand < 0.17 + bias * 0.2) return 'ice';
      if (rand < 0.22 + bias * 0.2) return 'conveyor';
      if (rand < 0.32 + bias * 0.4) return 'breakable';
      if (rand < 0.50 + bias) return 'moving';
    } else if (heightRatio > 1) {
      const rand = Math.random();
      if (rand < 0.03 + bias * 0.2) return 'spring';
      if (rand < 0.10 + bias * 0.3) return 'bouncy';
      if (rand < 0.20 + bias * 0.4) return 'breakable';
      if (rand < 0.40 + bias) return 'moving';
    } else if (heightRatio > 0.5) {
      const rand = Math.random();
      if (rand < 0.05 + bias * 0.2) return 'bouncy';
      if (rand < 0.25 + bias * 0.8) return 'moving';
    }

    return 'normal';
  }

  getState(): GameState {
    return { ...this.gameState, platforms: [...this.gameState.platforms] };
  }

  startGame(): void {
    // Reset player position and velocity
    const startY = this.gameState.screenHeight * 0.7;
    this.gameState.player.x = this.gameState.screenWidth / 2 - this.gameState.player.width / 2;
    this.gameState.player.y = startY;
    this.gameState.player.vy = 0;
    this.gameState.player.hasShield = false;
    this.gameState.player.shieldTime = 0;

    // Reset game state
    this.gameState.phase = 'PLAYING';
    this.gameState.score = 0;
    this.gameState.maxHeight = startY; // Reset max height
    this.lastUpdateTime = 0;
    this.gameState.cameraY = 0;
    this.gameState.particles = [];
    this.gameState.screenShake = 0;
    this.gameState.combo = 0;
    this.gameState.lastScoredPlatformId = null; // Reset scored platform tracking
    this.gameState.lastLandingTime = 0; // Reset combo timing
    this.gameState.lastComboPlatformId = null; // Reset combo platform tracking
    this.gameState.gameTime = 0;
    this.gameState.items = [];

    // Reset movement
    this.moveDir = 0;
    this.moveAnalog = 0;

    // Reset falling trigger for sound
    this.fallingTriggered = false;

    // Regenerate platforms
    this.seedPlatforms(this.gameState);
  }

  pauseGame(): void {
    if (this.gameState.phase === 'PLAYING') this.gameState.phase = 'PAUSED';
  }

  resumeGame(): void {
    if (this.gameState.phase === 'PAUSED') this.gameState.phase = 'PLAYING';
  }

  exitGame(): void {
    this.gameState = this.createInitialState(this.gameState.screenWidth, this.gameState.screenHeight);
  }

  /**
   * Trigger game over with a score bonus (used for K animation completion)
   */
  triggerGameOverWithBonus(bonus: number): void {
    if (this.gameState.phase === 'PLAYING') {
      this.gameState.score += bonus;
      this.gameState.phase = 'GAME_OVER';
      this.isPlayerFrozen = false;
    }
  }

  /**
   * Freeze the player in place (for K animation)
   */
  freezePlayer(): void {
    this.isPlayerFrozen = true;
    // Stop all movement
    this.gameState.player.vy = 0;
    this.moveDir = 0;
    this.moveAnalog = 0;
  }

  /**
   * Unfreeze the player
   */
  unfreezePlayer(): void {
    this.isPlayerFrozen = false;
  }

  /**
   * Check if player is frozen
   */
  isPlayerCurrentlyFrozen(): boolean {
    return this.isPlayerFrozen;
  }

  setMoveLeft(isDown: boolean) {
    this.moveDir = isDown ? -1 : (this.moveDir === -1 ? 0 : this.moveDir);
  }
  setMoveRight(isDown: boolean) {
    this.moveDir = isDown ? 1 : (this.moveDir === 1 ? 0 : this.moveDir);
  }

  // Tilt-based analog control (-1..1)
  setMoveAnalog(value: number) {
    // Dead zone to prevent drift from small tilts
    const DEAD_ZONE = 0.08;
    let adjustedValue = value;

    if (Math.abs(value) < DEAD_ZONE) {
      adjustedValue = 0;
    } else {
      // Scale value outside dead zone to full range
      const sign = value > 0 ? 1 : -1;
      adjustedValue = sign * ((Math.abs(value) - DEAD_ZONE) / (1 - DEAD_ZONE));
    }

    // Low-pass filter to smooth sudden spikes (more responsive than before)
    const alpha = 0.35; // Increased from 0.2 for better responsiveness
    this.moveAnalog = Math.max(-1, Math.min(1, alpha * adjustedValue + (1 - alpha) * this.moveAnalog));
  }

  // Legacy method name for compatibility
  setTilt(value: number) {
    this.setMoveAnalog(value);
  }

  update(currentTime: number): void {
    if (this.gameState.phase !== 'PLAYING') return;
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = currentTime;
      log.info('Game loop started');
      return;
    }
    const dt = Math.min(34, currentTime - this.lastUpdateTime); // clamp
    this.lastUpdateTime = currentTime;

    // Update game time (in seconds)
    this.gameState.gameTime += dt / 1000;

    this.updatePlayer(dt);
    this.updatePlatforms(dt);
    this.updateItems(dt);
    this.updateParticles(dt);
    this.updateScreenShake(dt);
    this.scrollWorld();
    this.cleanupAndSpawnPlatforms();
  }

  private updateItems(dt: number) {
    // Items don't move relative to world, but need collision check if player overlaps
    const s = this.gameState;
    const p = s.player;

    s.items = s.items.filter(item => {
      if (item.collected) return false;

      // CLEANUP: Remove items that have scrolled below the visible screen
      // Items below screen + 200px buffer are no longer reachable
      if (item.y > s.screenHeight + 200) {
        return false; // Remove from list
      }

      // Simple AABB collision check
      const collision =
        p.x < item.x + item.width &&
        p.x + p.width > item.x &&
        p.y < item.y + item.height &&
        p.y + p.height > item.y;

      if (collision) {
        // Collected! Calculate score based on current difficulty
        const difficultyLevel = Math.floor(s.gameTime / 10);
        const itemScore = this.getItemScore(difficultyLevel);
        s.score += itemScore;
        this.createParticles(item.x + item.width / 2, item.y + item.height / 2, '#FFD700', 8);
        log.debug(`Collected item: ${item.type}`, { score: itemScore, difficulty: difficultyLevel });

        // Trigger audio callback
        if (this.onItemCollected) {
          this.onItemCollected(item.type);
        }

        return false; // Remove from list
      }

      return true;
    });
  }

  private updatePlayer(dt: number) {
    // Skip all physics updates if player is frozen (K animation)
    if (this.isPlayerFrozen) {
      return;
    }

    const s = this.gameState; const p = s.player;

    // Normalize dt to 60fps (16.67ms per frame)
    const frameMultiplier = dt / 16.67;

    // horizontal movement with wrap
    // Combined digital + analog input + velocity from boosts
    const input = Math.max(-1, Math.min(1, this.moveDir + this.moveAnalog));
    const horizontalMovement = input * PHYSICS.HORIZONTAL_SPEED * frameMultiplier;

    // Apply horizontal velocity (from double jump boosts) with decay
    // Use reduced friction if on ice platform
    if (p.isOnIce) {
      p.vx *= PHYSICS.ICE_FRICTION; // Slower decay on ice
      if (Math.abs(p.vx) < 0.1) {
        p.isOnIce = false; // Stop ice effect when velocity is minimal
      }
    } else {
      p.vx *= 0.95; // Normal decay
    }
    p.x += horizontalMovement + p.vx * frameMultiplier;

    // Wrap around screen edges
    if (p.x + p.width < 0) p.x = s.screenWidth;
    if (p.x > s.screenWidth) p.x = -p.width;

    // Apply gravity
    p.vy += PHYSICS.GRAVITY * frameMultiplier;

    // Cap fall speed
    if (p.vy > PHYSICS.MAX_FALL_SPEED) {
      p.vy = PHYSICS.MAX_FALL_SPEED;
    }

    // Update position
    const oldY = p.y;
    p.y += p.vy * frameMultiplier;

    // Track grounded frames to prevent flicker
    if (p.isGrounded) {
      p.groundedFrames++;
      // Only set to not grounded after enough frames of being airborne
      // This prevents flicker when bouncing off platforms (increased from 2 to 8)
      if (p.vy < 0 && p.groundedFrames > 8) {
        p.isGrounded = false;
        p.groundedFrames = 0;
      }
    }

    // Track max height reached (for height display)
    if (p.y < s.maxHeight) {
      s.maxHeight = p.y;
    }

    // Platform collision detection (only when falling)
    if (p.vy > 0) {
      for (const plat of s.platforms) {
        // Skip broken platforms
        if (plat.broken) continue;

        // Skip platforms that are barely visible (prevent magical landings)
        // Platforms must be at least 50px into visible area
        const VISIBILITY_MARGIN = 50;
        if (plat.y < -VISIBILITY_MARGIN || plat.y > s.screenHeight + VISIBILITY_MARGIN) {
          continue;
        }

        // Check horizontal overlap with some tolerance
        const playerLeft = p.x + p.width * 0.2; // 20% tolerance on sides
        const playerRight = p.x + p.width * 0.8;
        const platLeft = plat.x;
        const platRight = plat.x + plat.width;

        const withinX = playerRight > platLeft && playerLeft < platRight;

        if (withinX) {
          // Check if player just passed through platform top
          const playerBottom = p.y + p.height;
          const playerPrevBottom = oldY + p.height;
          const platTop = plat.y;
          const platBottom = plat.y + plat.height;

          // Landing detection: player's bottom crosses platform top
          if (playerPrevBottom <= platTop && playerBottom >= platTop && playerBottom <= platBottom + 10) {
            this.handlePlatformLanding(plat, p);
            break;
          }
        }
      }
    }

    // Reset combo if falling too fast (missed platforms)
    if (p.vy > PHYSICS.MAX_FALL_SPEED * 0.8) {
      s.combo = 0;
    }

    // Trigger falling sound when player passes visible area (before game over)
    if (p.y - s.cameraY > s.screenHeight && !this.fallingTriggered) {
      this.fallingTriggered = true;
      if (this.onPlayerFalling) {
        this.onPlayerFalling();
      }
    }

    // Game over if falls below screen bottom (ONE LIFE ONLY)
    if (p.y - s.cameraY > s.screenHeight + 100) {
      this.gameState.phase = 'GAME_OVER';
    }
  }

  private updatePlatforms(dt: number) {
    const frameMultiplier = dt / 16.67;

    // Update all platforms
    for (const plat of this.gameState.platforms) {
      // Moving platforms
      if (plat.vx !== 0) {
        // Move platforms horizontally. vx is a unit speed, PLATFORM_SPEED sets the px/sec baseline.
        plat.x += plat.vx * PHYSICS.PLATFORM_SPEED * frameMultiplier;

        // Bounce off edges
        if (plat.x < 0) {
          plat.x = 0;
          plat.vx *= -1;
        } else if (plat.x + plat.width > this.gameState.screenWidth) {
          plat.x = this.gameState.screenWidth - plat.width;
          plat.vx *= -1;
        }
      }

      // Disappearing platforms - fade out after timer
      if (plat.type === 'disappearing' && plat.isDisappearing) {
        if (plat.disappearTimer !== undefined) {
          plat.disappearTimer -= dt;

          if (plat.disappearTimer <= 0) {
            // Start fading
            if (plat.opacity === undefined) plat.opacity = 1;
            plat.opacity -= dt / PHYSICS.DISAPPEAR_DURATION;

            if (plat.opacity <= 0) {
              plat.broken = true; // Mark for removal
            }
          }
        }
      }

      // Crumbling platforms - shake then fall
      if (plat.type === 'crumbling' && plat.isCrumbling) {
        if (plat.crumbleTimer !== undefined) {
          plat.crumbleTimer -= dt;

          if (plat.crumbleTimer > 0) {
            // Shaking phase - random horizontal offset
            plat.shakeOffset = (Math.random() - 0.5) * 6;
          } else {
            // Falling phase
            plat.shakeOffset = 0;
            if (plat.fallVy === undefined) plat.fallVy = 0;
            plat.fallVy += PHYSICS.GRAVITY * frameMultiplier * 0.5;
            plat.y += plat.fallVy * frameMultiplier;

            // Mark for removal when off screen
            if (plat.y > this.gameState.screenHeight + 100) {
              plat.broken = true;
            }
          }
        }
      }
    }
  }

  private scrollWorld() {
    const s = this.gameState; const p = s.player;
    const topThreshold = s.screenHeight * 0.4;
    if (p.y < topThreshold) {
      const dy = topThreshold - p.y;
      // Shift world down by dy to simulate camera moving up
      for (const plat of s.platforms) plat.y += dy;
      for (const item of s.items) item.y += dy;
      // Anchor player at threshold so dy doesn't accumulate across frames
      p.y = topThreshold;
      // Keep cameraY unchanged; rendering uses absolute coords.
    }
  }


  private createParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      this.gameState.particles.push({
        id: Math.random().toString(36).slice(2),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private addScreenShake(intensity: number) {
    this.gameState.screenShake = Math.max(this.gameState.screenShake, intensity);
  }

  private updateParticles(dt: number) {
    const frameMultiplier = dt / 16.67;

    this.gameState.particles = this.gameState.particles.filter(particle => {
      particle.x += particle.vx * frameMultiplier;
      particle.y += particle.vy * frameMultiplier;
      particle.vy += 0.2 * frameMultiplier; // gravity
      particle.life -= frameMultiplier;
      return particle.life > 0;
    });
  }

  private updateScreenShake(dt: number) {
    const frameMultiplier = dt / 16.67;
    if (this.gameState.screenShake > 0) {
      this.gameState.screenShake -= 0.5 * frameMultiplier;
      if (this.gameState.screenShake < 0) {
        this.gameState.screenShake = 0;
      }
    }
  }

  private generateReachablePlatformX(lastX: number, width: number, screenWidth: number, difficulty: number): number {
    // Horizontal reach approximation (fraction of screen width)
    const maxJumpDistance = screenWidth * (0.35 + 0.1 * difficulty); // 35% → 45%

    // Base reachable range - much more generous
    let minReachableX = Math.max(0, lastX - maxJumpDistance);
    let maxReachableX = Math.min(screenWidth - width, lastX + maxJumpDistance);

    // Ensure there's always a valid range
    if (minReachableX >= maxReachableX) {
      minReachableX = 0;
      maxReachableX = screenWidth - width;
    }

    // Preferred horizontal distance grows with difficulty (more lateral skill required)
    const preferredDistance = screenWidth * (0.12 + 0.18 * difficulty);
    const preferredMinX = Math.max(minReachableX, lastX - preferredDistance);
    const preferredMaxX = Math.min(maxReachableX, lastX + preferredDistance);

    // Use preferred range most of the time, full range occasionally for variety
    const usePreferred = Math.random() < 0.8; // 80% chance to use closer placement

    if (usePreferred && preferredMinX < preferredMaxX) {
      return this.randBetween(preferredMinX, preferredMaxX);
    } else {
      return this.randBetween(minReachableX, maxReachableX);
    }
  }

  private handlePlatformLanding(plat: Platform, player: any) {
    const s = this.gameState;

    // Snap to platform top
    player.y = plat.y - player.height;

    // Reset grounded state
    player.isGrounded = true;
    player.groundedFrames = 0; // Reset counter to prevent flicker

    // Audio callbacks are now handled per-platform-type in the switch below

    // Time-based combo logic: only count when landing on DIFFERENT platforms
    const COMBO_TIME_WINDOW = 1500; // 1.5 seconds in ms
    const currentTime = Date.now();

    // Check if this is a different platform than the last one we landed on for combo
    const isDifferentPlatform = s.lastComboPlatformId !== plat.id;

    if (isDifferentPlatform) {
      if (s.lastLandingTime > 0 && (currentTime - s.lastLandingTime) <= COMBO_TIME_WINDOW) {
        // Fast consecutive landing on DIFFERENT platform - increment combo
        // Spring platforms give bonus +2, others give +1
        if (plat.type === 'spring' && !plat.springUsed) {
          s.combo += 2;
        } else {
          s.combo++;
        }
      } else {
        // Too slow or first landing - reset combo to 1
        s.combo = 1;
      }
      s.lastLandingTime = currentTime;
      s.lastComboPlatformId = plat.id;
    }
    // If same platform, don't change combo or timing (prevents spam)

    // Award score ONLY if we haven't scored on this platform before
    if (!plat.scored) {
      plat.scored = true;
      const baseScore = GAME_CONFIG.SCORE_PER_PLATFORM;

      // Calculate combo bonus (only when combo >= 3)
      const comboBonus = s.combo >= 3 ? Math.floor(baseScore * (s.combo / GAME_CONFIG.COMBO_MULTIPLIER)) : 0;

      // Award score
      const totalScore = baseScore + comboBonus;
      s.score += totalScore;

      // Debug log only for significant events
      if (s.combo >= 3) {
        log.debug(`Combo hit! x${s.combo}`, { points: totalScore });
      }
    }

    // Handle different platform types
    switch (plat.type) {
      case 'spring':
        if (!plat.springUsed) {
          player.vy = PHYSICS.SPRING_VELOCITY;
          plat.springUsed = true;
          this.addScreenShake(10);
          this.createParticles(plat.x + plat.width / 2, plat.y, '#FFD700', 20);
          this.createParticles(plat.x + plat.width / 2, plat.y - 20, '#FFA500', 10);
          log.debug('Spring boost triggered');
          // Big boost sound
          if (this.onBigBoostLand) this.onBigBoostLand();
        } else {
          player.vy = PHYSICS.JUMP_VELOCITY;
          if (this.onPlatformLand) this.onPlatformLand();
        }
        break;

      case 'bouncy':
        // MORE DRAMATIC bouncy - higher jump, more particles, screen shake
        player.vy = PHYSICS.BOUNCY_VELOCITY;
        this.addScreenShake(8);
        // Burst of pink particles in multiple directions
        this.createParticles(plat.x + plat.width / 2, plat.y, '#FF69B4', 15); // Hot pink
        this.createParticles(plat.x + plat.width / 2, plat.y - 10, '#FF1493', 10); // Deep pink
        this.createParticles(plat.x + plat.width / 4, plat.y, '#FF69B4', 5);
        this.createParticles(plat.x + plat.width * 3/4, plat.y, '#FF69B4', 5);
        // Big boost sound
        if (this.onBigBoostLand) this.onBigBoostLand();
        break;

      case 'ice':
        // MORE DRAMATIC ice - strong slide, more particles, visual feedback
        player.vy = PHYSICS.JUMP_VELOCITY;
        player.isOnIce = true;
        // Determine slide direction based on player approach
        const slideDirection = player.vx >= 0 ? 1 : -1;
        player.vx = slideDirection * PHYSICS.ICE_SLIDE_FORCE + (Math.random() - 0.5) * 2;
        this.addScreenShake(3);
        // Ice crystal particles spraying in slide direction
        this.createParticles(plat.x + plat.width / 2, plat.y, '#87CEEB', 12); // Sky blue
        this.createParticles(plat.x + plat.width / 2, plat.y, '#E0FFFF', 8); // Light cyan
        this.createParticles(plat.x + plat.width / 2 + slideDirection * 20, plat.y - 5, '#FFFFFF', 6); // White
        // Special platform sound
        if (this.onSpecialPlatformLand) this.onSpecialPlatformLand();
        break;

      case 'conveyor':
        player.vy = PHYSICS.JUMP_VELOCITY;
        player.vx += PHYSICS.CONVEYOR_SPEED * (plat.conveyorDirection || 1);
        this.createParticles(plat.x + plat.width / 2, plat.y, '#808080', 5); // Gray
        // Special platform sound
        if (this.onSpecialPlatformLand) this.onSpecialPlatformLand();
        break;

      case 'breakable':
        player.vy = PHYSICS.JUMP_VELOCITY;
        plat.broken = true; // Only break THIS platform
        this.addScreenShake(6);
        // Wood/debris particles
        this.createParticles(plat.x + plat.width / 2, plat.y, '#8B4513', 12);
        this.createParticles(plat.x + plat.width / 4, plat.y + 5, '#A0522D', 6);
        this.createParticles(plat.x + plat.width * 3/4, plat.y + 5, '#D2691E', 6);
        // Breakable sound
        if (this.onBreakableLand) this.onBreakableLand();
        break;

      case 'disappearing':
        player.vy = PHYSICS.JUMP_VELOCITY;
        // Start disappear timer if not already started
        if (!plat.isDisappearing) {
          plat.isDisappearing = true;
          plat.disappearTimer = PHYSICS.DISAPPEAR_DELAY;
          plat.opacity = 1;
          this.createParticles(plat.x + plat.width / 2, plat.y, '#9370DB', 8); // Medium purple
        }
        // Special platform sound
        if (this.onSpecialPlatformLand) this.onSpecialPlatformLand();
        break;

      case 'crumbling':
        player.vy = PHYSICS.JUMP_VELOCITY;
        // Start crumble timer if not already started
        if (!plat.isCrumbling) {
          plat.isCrumbling = true;
          plat.crumbleTimer = PHYSICS.CRUMBLE_DELAY + PHYSICS.CRUMBLE_SHAKE_DURATION;
          plat.shakeOffset = 0;
          this.addScreenShake(4);
          this.createParticles(plat.x + plat.width / 2, plat.y, '#696969', 10); // Dim gray
          this.createParticles(plat.x + plat.width / 4, plat.y, '#808080', 5);
          this.createParticles(plat.x + plat.width * 3/4, plat.y, '#808080', 5);
        }
        // Special platform sound
        if (this.onSpecialPlatformLand) this.onSpecialPlatformLand();
        break;

      case 'moving':
        player.vy = PHYSICS.JUMP_VELOCITY;
        this.createParticles(plat.x + plat.width / 2, plat.y, '#C4FF00', 5);
        // Special platform sound for moving platforms
        if (this.onSpecialPlatformLand) this.onSpecialPlatformLand();
        break;

      default:
        player.vy = PHYSICS.JUMP_VELOCITY;
        this.createParticles(plat.x + plat.width / 2, plat.y, '#C4FF00', 5);
        // Normal platform sound
        if (this.onPlatformLand) this.onPlatformLand();
        break;
    }
  }

  private cleanupAndSpawnPlatforms() {
    const s = this.gameState;
    const { screenWidth, screenHeight } = s;

    // Remove platforms that are way below the visible screen OR broken
    const screenBottom = s.cameraY + s.screenHeight;

    s.platforms = s.platforms.filter(pl => {
      // Remove if below screen OR broken
      if (pl.y >= screenBottom + 200 || pl.broken) {
        return false;
      }
      return true;
    });

    // --- ELLIPSE-CONSTRAINED REACHABILITY ALGORITHM ---

    // 1. Calculate Difficulty Level (increases every 10 seconds)
    const difficultyLevel = Math.floor(s.gameTime / 10);

    // 2. Physics-based reachability with difficulty scaling
    // Max jump height is ~140px, so we keep platforms reachable but progressively harder
    // Height scaling: starts at 115px, shrinks by 5% per level, min 90px (still reachable)
    const scaledMaxHeight = Math.max(
      GAME_CONFIG.MAX_REACHABLE_HEIGHT * Math.pow(0.95, difficultyLevel),
      90 // Minimum max height (still reachable with single jump)
    );
    // Horizontal scaling: starts at 160px, shrinks by 8% per level, min 70px
    const scaledMaxHorizontal = Math.max(
      GAME_CONFIG.MAX_REACHABLE_HORIZONTAL * Math.pow(0.92, difficultyLevel),
      70 // Minimum max horizontal
    );

    // Minimum vertical gap increases slightly with difficulty (harder to chain jumps)
    // Starts at 55px, increases to max 80px at high difficulty
    const yOffsetMin = Math.min(55 + (difficultyLevel * 5), 80);

    // Platform Width: Shrinks 5% per level, min 45px (still landable)
    const initialPlatWidth = 110;
    const platWidth = Math.max(initialPlatWidth * Math.pow(0.95, difficultyLevel), 45);

    // 3. Generate Ahead
    // Find the highest platform (smallest y) to spawn relative to
    if (s.platforms.length === 0) return;

    // Sort by Y ascending (smallest Y first = highest up)
    const sortedPlatforms = [...s.platforms].sort((a, b) => a.y - b.y);
    const highestPlatform = sortedPlatforms[0];

    // Buffer: Generate if highest platform is within view or just above
    const generateThreshold = s.cameraY - screenHeight; // Keep 1 screen height buffered above

    if (highestPlatform.y > generateThreshold) {
      let currentHighest = highestPlatform;

      // Generate until we have enough buffer
      while (currentHighest.y > generateThreshold - 500) { // Buffer 500px more

        // --- ELLIPSE-CONSTRAINED POSITION GENERATION ---
        // Ensures: (horizontalGap/maxH)² + (verticalGap/maxV)² <= 1
        // This guarantees every platform is reachable with a single jump

        // Random vertical gap (always positive, platform above)
        const verticalGap = this.randBetween(yOffsetMin, Math.floor(scaledMaxHeight));

        // Calculate max allowed horizontal based on ellipse formula
        // h <= maxH * sqrt(1 - (v/maxV)²)
        const verticalRatio = verticalGap / scaledMaxHeight;
        const maxAllowedHorizontal = scaledMaxHorizontal * Math.sqrt(Math.max(0, 1 - verticalRatio * verticalRatio));

        // Random horizontal within allowed range (can be left or right)
        const horizontalGap = this.randBetween(0, Math.floor(maxAllowedHorizontal));
        const direction = Math.random() < 0.5 ? -1 : 1;

        // Calculate new position
        let newX = currentHighest.x + (horizontalGap * direction);
        const newY = currentHighest.y - verticalGap;

        // Clamp X to screen bounds
        newX = Math.max(0, Math.min(screenWidth - platWidth, newX));

        // Determine type based on difficulty - progressive introduction
        // Level 0 (0-10s): All normal
        // Level 1 (10-20s): 15% moving
        // Level 2 (20-30s): 25% special (moving, bouncy, disappearing)
        // Level 3 (30-40s): 35% special (add breakable, ice, crumbling)
        // Level 4+ (40s+): 45%+ special (add conveyor, spring)
        let platformType: Platform['type'] = 'normal';
        let conveyorDir: 1 | -1 = Math.random() < 0.5 ? -1 : 1;

        const rand = Math.random();

        if (difficultyLevel >= 1) {
          // Calculate special platform chance: starts at 15%, increases by 10% per level, caps at 60%
          const specialChance = Math.min(0.15 + (difficultyLevel - 1) * 0.10, 0.60);

          if (rand < specialChance) {
            const typeRand = Math.random();

            if (difficultyLevel === 1) {
              // Level 1: Only moving platforms
              platformType = 'moving';
            } else if (difficultyLevel === 2) {
              // Level 2: Moving (45%), Bouncy (30%), Disappearing (25%)
              if (typeRand < 0.45) platformType = 'moving';
              else if (typeRand < 0.75) platformType = 'bouncy';
              else platformType = 'disappearing';
            } else if (difficultyLevel === 3) {
              // Level 3: Moving (30%), Bouncy (20%), Breakable (15%), Ice (15%), Disappearing (10%), Crumbling (10%)
              if (typeRand < 0.30) platformType = 'moving';
              else if (typeRand < 0.50) platformType = 'bouncy';
              else if (typeRand < 0.65) platformType = 'breakable';
              else if (typeRand < 0.80) platformType = 'ice';
              else if (typeRand < 0.90) platformType = 'disappearing';
              else platformType = 'crumbling';
            } else {
              // Level 4+: All types with good variety
              if (typeRand < 0.20) platformType = 'moving';
              else if (typeRand < 0.35) platformType = 'breakable';
              else if (typeRand < 0.48) platformType = 'bouncy';
              else if (typeRand < 0.60) platformType = 'ice';
              else if (typeRand < 0.72) platformType = 'disappearing';
              else if (typeRand < 0.84) platformType = 'crumbling';
              else if (typeRand < 0.94) platformType = 'conveyor';
              else platformType = 'spring';
            }
          }
        }

        // Moving platform speed increases with difficulty (base speed + 50% per level, capped at 3x)
        const movingSpeedMultiplier = Math.min(1 + (difficultyLevel * 0.5), 3.0);
        const movingSpeed = GAME_CONFIG.MOVING_SPEED_BASE * movingSpeedMultiplier;
        const vx = platformType === 'moving' ? (Math.random() < 0.5 ? -movingSpeed : movingSpeed) : 0;

        const newPlat: Platform = {
          id: Math.random().toString(36).slice(2),
          x: newX,
          y: newY,
          width: platWidth,
          height: GAME_CONFIG.PLATFORM_HEIGHT,
          vx,
          type: platformType,
          conveyorDirection: platformType === 'conveyor' ? conveyorDir : undefined,
        };

        s.platforms.push(newPlat);

        // Attempt to spawn items using advanced patterns
        this.spawnItemWithPattern(newPlat, difficultyLevel, screenWidth);

        currentHighest = newPlat;
      }
    }
  }

  private randBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Select a spawn pattern based on difficulty level
   * Higher difficulty = harder patterns more likely
   */
  private selectSpawnPattern(difficulty: number): ItemSpawnPattern {
    const rand = Math.random();

    if (difficulty === 0) {
      // Easy: Only Gap Jumper (above platforms)
      return 'GAP_JUMPER';
    } else if (difficulty === 1) {
      // Medium: Gap Jumper, Opposite Side, Zigzag
      if (rand < 0.4) return 'GAP_JUMPER';
      if (rand < 0.7) return 'OPPOSITE_SIDE';
      return 'ZIGZAG_TRAIL';
    } else if (difficulty === 2) {
      // Hard: All patterns
      if (rand < 0.2) return 'GAP_JUMPER';
      if (rand < 0.4) return 'OPPOSITE_SIDE';
      if (rand < 0.6) return 'BELOW_PLATFORM';
      if (rand < 0.8) return 'MOVING_TARGET';
      return 'ZIGZAG_TRAIL';
    } else {
      // Very Hard (3+): Favor harder patterns
      if (rand < 0.1) return 'GAP_JUMPER';
      if (rand < 0.25) return 'OPPOSITE_SIDE';
      if (rand < 0.45) return 'BELOW_PLATFORM';
      if (rand < 0.7) return 'MOVING_TARGET';
      return 'ZIGZAG_TRAIL';
    }
  }

  /**
   * Calculate item score based on difficulty
   */
  private getItemScore(difficulty: number): number {
    const base = GAME_CONFIG.ITEM_SCORE_BASE;
    const max = GAME_CONFIG.ITEM_SCORE_MAX;
    // Scale from 100 to 200 over difficulty levels 0-3
    return Math.min(max, base + difficulty * 33);
  }

  /**
   * Spawn item(s) using advanced placement patterns
   */
  private spawnItemWithPattern(platform: Platform, difficulty: number, screenWidth: number): void {
    if (Math.random() >= GAME_CONFIG.SPAWN_ITEM_CHANCE) return;

    const s = this.gameState;
    const itemSize = GAME_CONFIG.ITEM_SIZE;
    const pattern = this.selectSpawnPattern(difficulty);

    // Decide item type
    const r = Math.random();
    const itemType: 'egg' | 'tomato' | 'pepper' = r < 0.33 ? 'egg' : r < 0.66 ? 'tomato' : 'pepper';

    switch (pattern) {
      case 'GAP_JUMPER': {
        // Item floats above the platform center - easy to get while jumping
        const itemX = platform.x + (platform.width - itemSize) / 2;
        const itemY = platform.y - itemSize - 40; // Float high above
        s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        break;
      }

      case 'OPPOSITE_SIDE': {
        // Item on the opposite side of the screen from the platform
        const platformCenterX = platform.x + platform.width / 2;
        const isOnLeft = platformCenterX < screenWidth / 2;
        // Place item on opposite side, requiring horizontal movement
        const itemX = isOnLeft
          ? screenWidth - itemSize - 30  // Far right
          : 30;                           // Far left
        const itemY = platform.y - itemSize - 20;
        s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        break;
      }

      case 'BELOW_PLATFORM': {
        // Item below the platform edge - risky grab
        const edge = Math.random() < 0.5 ? platform.x - itemSize : platform.x + platform.width;
        const itemX = Math.max(0, Math.min(screenWidth - itemSize, edge));
        const itemY = platform.y + 20; // Below platform level
        s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        break;
      }

      case 'MOVING_TARGET': {
        // Only spawn on moving platforms, item stays with platform
        if (platform.type !== 'moving') {
          // Fallback to gap jumper if not a moving platform
          const itemX = platform.x + (platform.width - itemSize) / 2;
          const itemY = platform.y - itemSize - 30;
          s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        } else {
          // Item on the moving platform itself
          const itemX = platform.x + (platform.width - itemSize) / 2;
          const itemY = platform.y - itemSize - 5; // Just above platform
          s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        }
        break;
      }

      case 'ZIGZAG_TRAIL': {
        // Create 2-3 items in a zigzag pattern above the platform
        const itemCount = 2 + (difficulty >= 2 ? 1 : 0); // 2 items early, 3 later
        const startY = platform.y - itemSize - 30;
        const verticalGap = 50;

        for (let i = 0; i < itemCount; i++) {
          // Alternate left and right
          const isLeft = i % 2 === 0;
          const baseX = platform.x + platform.width / 2;
          const offset = (isLeft ? -1 : 1) * (60 + i * 20);
          const itemX = Math.max(0, Math.min(screenWidth - itemSize, baseX + offset - itemSize / 2));
          const itemY = startY - i * verticalGap;
          s.items.push(this.createItem(itemX, itemY, itemSize, itemType));
        }
        break;
      }
    }
  }

  /**
   * Helper to create an item object
   */
  private createItem(x: number, y: number, size: number, type: 'egg' | 'tomato' | 'pepper'): Item {
    return {
      id: Math.random().toString(36).slice(2),
      x,
      y,
      width: size,
      height: size,
      type,
      collected: false
    };
  }
}

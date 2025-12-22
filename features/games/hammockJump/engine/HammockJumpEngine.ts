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
    canDoubleJump: boolean;
    isGrounded: boolean;
    groundedFrames: number; // Track frames since last grounded to prevent flicker
  };
  cameraY: number; // how far the world has scrolled up
  platforms: Platform[];
  particles: Particle[];
  screenShake: number;
  combo: number; // consecutive platform hits
  lastScoredPlatformId: string | null; // Track last platform that gave score
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
  type: 'normal' | 'moving' | 'breakable' | 'spring';
  broken?: boolean; // for breakable platforms
  springUsed?: boolean; // for spring platforms
  scored?: boolean; // track if this platform already gave score
}

export interface GameAssets {
  background: any;
  player: any;
}

const PHYSICS = {
  GRAVITY: 0.8, // px/frame (proper gravity)
  JUMP_VELOCITY: -15, // px/frame upward (strong bounce)
  SPRING_VELOCITY: -25, // px/frame upward (super bounce)
  DOUBLE_JUMP_VELOCITY: -12, // px/frame upward (double jump boost)
  HORIZONTAL_SPEED: 6, // px/frame (responsive movement)
  HORIZONTAL_BOOST: 4, // px/frame (double tap boost)
  MAX_FALL_SPEED: 20, // px/frame (terminal velocity)
  PLATFORM_SPEED: 100, // px/second baseline for moving platforms (scaled by frameMultiplier)
};

export const GAME_CONFIG = {
  PLAYER_SIZE: 64,
  PLATFORM_HEIGHT: 14,
  // Gap tuning: start easier (smaller vertical movement per hop), get MUCH harder (bigger gaps)
  BASE_PLATFORM_GAP: 80,        // px — initial average vertical gap (medium start)
  MAX_PLATFORM_GAP: 220,        // px — max gap at high difficulty (very sparse late game)
  // Width tuning: start wide (easy), get narrower (hard)
  PLATFORM_WIDTH_MIN_EASY: 100,
  PLATFORM_WIDTH_MIN_HARD: 40,  // Much narrower at high difficulty
  PLATFORM_WIDTH_MAX_EASY: 160,
  PLATFORM_WIDTH_MAX_HARD: 80,  // Smaller max width
  // Count tuning: start with more platforms visible, then reduce to increase challenge
  TARGET_COUNT_EASY: 16,        // fewer to start so screen isn't overcrowded
  TARGET_COUNT_HARD: 8,         // much fewer at high difficulty
  // Moving platform speed tuning
  MOVING_SPEED_BASE: 0.08,      // Faster base speed
  MOVING_SPEED_MAX: 0.18,       // Much faster at high difficulty
  // Scoring: points per platform landed (not continuous)
  SCORE_PER_PLATFORM: 10,       // Base score per platform
  COMBO_MULTIPLIER: 2,          // Bonus for combos
  // Sparsity controls: probability to skip spawning a platform (creates gaps)
  SPARSE_SKIP_PROB_EASY: 0.08,
  SPARSE_SKIP_PROB_HARD: 0.35,  // Much higher chance to skip platforms
  // Horizontal spacing: minimum separation between consecutive platforms
  MIN_H_SEPARATION_EASY: 0.10,  // as fraction of screen width
  MIN_H_SEPARATION_HARD: 0.28,  // Wider gaps
  // Item configs
  SPAWN_ITEM_CHANCE: 0.25, // 25% chance to spawn an item on a platform
  ITEM_SCORE: 15,
  ITEM_SIZE: 32,
} as const;

export class HammockGameEngine {
  private gameState: GameState;
  private lastUpdateTime = 0;
  private moveDir: -1 | 0 | 1 = 0;
  private moveAnalog = 0; // -1..1 from device tilt

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
        canDoubleJump: false,
        isGrounded: false,
        groundedFrames: 0,
      },
      cameraY: 0,
      platforms: [],
      particles: [],
      screenShake: 0,
      combo: 0,
      lastScoredPlatformId: null,
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

    // Generate initial platforms - some below player for starting, most above
    let lastX = screenWidth / 2; // Start from center

    // First, create a starting platform right below the player
    const startPlatformWidth = 120;
    const startPlatformX = Math.max(0, Math.min(screenWidth - startPlatformWidth, state.player.x - startPlatformWidth / 2));
    state.platforms.push({
      id: 'start',
      x: startPlatformX,
      y: state.player.y + state.player.height + 20,
      width: startPlatformWidth,
      height: GAME_CONFIG.PLATFORM_HEIGHT,
      vx: 0,
      type: 'normal'
    });

    // Create a few platforms below the player (but not below screen bottom)
    let y = state.player.y + state.player.height + 20 + gap;
    lastX = startPlatformX;
    const screenBottom = screenHeight; // Bottom of the screen

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

    // Now create platforms above the player
    y = state.player.y - gap;
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
      if (rand < 0.1 + bias * 0.4) return 'spring';
      if (rand < 0.25 + bias * 0.6) return 'breakable';
      if (rand < 0.45 + bias) return 'moving';
    } else if (heightRatio > 1.5) {
      const rand = Math.random();
      if (rand < 0.05 + bias * 0.3) return 'spring';
      if (rand < 0.15 + bias * 0.4) return 'breakable';
      if (rand < 0.3 + bias) return 'moving';
    } else if (heightRatio > 0.5) {
      const rand = Math.random();
      if (rand < 0.2 + bias * 0.8) return 'moving';
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
    this.gameState.gameTime = 0;
    this.gameState.items = [];

    // Reset movement
    this.moveDir = 0;
    this.moveAnalog = 0;

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

  // Double tap mechanic
  performDoubleJump(): void {
    const p = this.gameState.player;

    // Only allow double jump if player is in the air and hasn't used it yet
    if (!p.isGrounded && p.canDoubleJump) {
      // If player is tilting, give horizontal boost
      if (Math.abs(this.moveAnalog) > 0.1) {
        p.vx += this.moveAnalog * PHYSICS.HORIZONTAL_BOOST;
        p.vy = PHYSICS.DOUBLE_JUMP_VELOCITY * 0.8; // Smaller vertical boost when boosting horizontally
      } else {
        // Pure vertical double jump
        p.vy = PHYSICS.DOUBLE_JUMP_VELOCITY;
      }

      p.canDoubleJump = false; // Use up the double jump
      this.addScreenShake(3);
      this.createParticles(p.x + p.width / 2, p.y + p.height, '#00FFFF', 8); // Cyan particles for double jump
    }
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

      // Simple AABB collision check
      const collision =
        p.x < item.x + item.width &&
        p.x + p.width > item.x &&
        p.y < item.y + item.height &&
        p.y + p.height > item.y;

      if (collision) {
        // Collected!
        s.score += GAME_CONFIG.ITEM_SCORE;
        this.createParticles(item.x + item.width / 2, item.y + item.height / 2, '#FFD700', 5);
        log.debug(`Collected item: ${item.type}`, { score: GAME_CONFIG.ITEM_SCORE });
        return false; // Remove from list
      }

      return true;
    });
  }

  private updatePlayer(dt: number) {
    const s = this.gameState; const p = s.player;

    // Normalize dt to 60fps (16.67ms per frame)
    const frameMultiplier = dt / 16.67;

    // horizontal movement with wrap
    // Combined digital + analog input + velocity from boosts
    const input = Math.max(-1, Math.min(1, this.moveDir + this.moveAnalog));
    const horizontalMovement = input * PHYSICS.HORIZONTAL_SPEED * frameMultiplier;

    // Apply horizontal velocity (from double jump boosts) with decay
    p.vx *= 0.95; // Decay horizontal velocity
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
      // Only set to not grounded after a few frames of being airborne
      // This prevents flicker when bouncing off platforms
      if (p.vy < 0 && p.groundedFrames > 2) {
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

    // Game over if falls below screen bottom (ONE LIFE ONLY)
    if (p.y - s.cameraY > s.screenHeight + 100) {
      this.gameState.phase = 'GAME_OVER';
    }
  }

  private updatePlatforms(dt: number) {
    const frameMultiplier = dt / 16.67;

    // Update moving platforms
    for (const plat of this.gameState.platforms) {
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

    // Reset double jump and grounded state
    player.canDoubleJump = true;
    player.isGrounded = true;
    player.groundedFrames = 0; // Reset counter to prevent flicker

    // Award score ONLY if we haven't scored on this platform before
    if (!plat.scored) {
      plat.scored = true;
      const baseScore = GAME_CONFIG.SCORE_PER_PLATFORM;

      // Calculate combo bonus
      const comboBonus = s.combo > 1 ? Math.floor(baseScore * (s.combo / GAME_CONFIG.COMBO_MULTIPLIER)) : 0;

      // Award score
      const totalScore = baseScore + comboBonus;
      s.score += totalScore;

      // Debug log only for significant events
      if (s.combo > 2) {
        log.debug(`Combo hit! x${s.combo}`, { points: totalScore });
      }
    }

    // Handle different platform types
    switch (plat.type) {
      case 'spring':
        if (!plat.springUsed) {
          player.vy = PHYSICS.SPRING_VELOCITY;
          plat.springUsed = true;
          this.addScreenShake(8);
          this.createParticles(plat.x + plat.width / 2, plat.y, '#FFD700', 15);
          s.combo += 2; // Bonus combo for spring
          log.debug('Spring boost triggered');
        } else {
          player.vy = PHYSICS.JUMP_VELOCITY;
          s.combo++;
        }
        break;

      case 'breakable':
        player.vy = PHYSICS.JUMP_VELOCITY;
        plat.broken = true; // Only break THIS platform
        this.addScreenShake(4);
        this.createParticles(plat.x + plat.width / 2, plat.y, '#8B4513', 10);
        s.combo++;
        break;

      default:
        player.vy = PHYSICS.JUMP_VELOCITY;
        s.combo++;
        this.createParticles(plat.x + plat.width / 2, plat.y, '#C4FF00', 5);
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

    // --- NEW ALGORITHM: Time-Based Progressive Difficulty ---

    // 1. Calculate Difficulty Level (increases every 10 seconds)
    const difficultyLevel = Math.floor(s.gameTime / 10);

    // 2. Dynamic Parameters based on difficulty
    // x_offset: Shrinks 5% per level, min 40px. Controls horizontal reach.
    const initialXOffset = screenWidth / 3; // Start with 1/3 screen width reach
    const xOffset = Math.max(initialXOffset * Math.pow(0.95, difficultyLevel), 40);

    // y_offset_max: Shrinks 2% per level, min 120px. Controls max vertical gap.
    const initialYOffsetMax = 220; // Slightly higher than user suggestion for better flow
    const yOffsetMax = Math.max(initialYOffsetMax * Math.pow(0.98, difficultyLevel), 120);

    // y_offset_min: Fixed minimum gap (player height * 1.5 approx)
    const yOffsetMin = 80;

    // Platform Width: Shrinks 3% per level, min 50px.
    const initialPlatWidth = 110;
    const platWidth = Math.max(initialPlatWidth * Math.pow(0.97, difficultyLevel), 50);

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

        // --- ALWAYS REACHABLE LOGIC ---

        // Safe X: Reachable horizontally from previous
        const lowX = Math.max(0, currentHighest.x - xOffset);
        const highX = Math.min(screenWidth - platWidth, currentHighest.x + xOffset);
        const newX = this.randBetween(lowX, highX);

        // Safe Y: Reachable vertically (next higher up = smaller y)
        const lowY = currentHighest.y - yOffsetMax; // Farthest jumpable up
        const highY = currentHighest.y - yOffsetMin; // Closest up
        const newY = this.randBetween(lowY, highY);

        // Determine type based on difficulty
        // After level 3 (30s): Chance for moving/special platforms
        let platformType: Platform['type'] = 'normal';
        if (difficultyLevel >= 3) {
          const rand = Math.random();
          // Chance increases with difficulty
          const specialChance = 0.1 + (difficultyLevel * 0.02);

          if (rand < specialChance) {
            if (Math.random() < 0.5) platformType = 'moving';
            else if (Math.random() < 0.3) platformType = 'breakable';
            else platformType = 'spring';
          }
        }

        const vx = platformType === 'moving' ? (Math.random() < 0.5 ? -GAME_CONFIG.MOVING_SPEED_BASE : GAME_CONFIG.MOVING_SPEED_BASE) : 0;

        const newPlat: Platform = {
          id: Math.random().toString(36).slice(2),
          x: newX,
          y: newY,
          width: platWidth,
          height: GAME_CONFIG.PLATFORM_HEIGHT,
          vx,
          type: platformType
        };

        s.platforms.push(newPlat);

        // Attempt to spawn an item
        if (Math.random() < GAME_CONFIG.SPAWN_ITEM_CHANCE) {
          // Decide type
          const r = Math.random();
          let itemType: 'egg' | 'tomato' | 'pepper' = 'egg';
          if (r < 0.33) itemType = 'tomato';
          else if (r < 0.66) itemType = 'pepper';

          const itemSize = GAME_CONFIG.ITEM_SIZE;

          // Position: random X on platform (mostly), or slightly offset for air spawn
          // For now, place ON TOP of platform to ensure reachability
          // Center on platform with random offset
          const itemX = newPlat.x + (newPlat.width - itemSize) / 2 + (Math.random() - 0.5) * (newPlat.width * 0.5);
          const itemY = newPlat.y - itemSize - 10; // Float slightly above

          s.items.push({
            id: Math.random().toString(36).slice(2),
            x: itemX,
            y: itemY,
            width: itemSize,
            height: itemSize,
            type: itemType,
            collected: false
          });
        }

        currentHighest = newPlat;
      }
    }
  }

  private randBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

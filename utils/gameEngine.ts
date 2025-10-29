// Doodle Jump-style Engine for Hammock Jump
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
    width: number;
    height: number;
    hasShield?: boolean;
    shieldTime?: number;
  };
  cameraY: number; // how far the world has scrolled up
  platforms: Platform[];
  particles: Particle[];
  screenShake: number;
  combo: number; // consecutive platform hits
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
}

export interface GameAssets {
  background: any;
  player: any;
}

const PHYSICS = {
  GRAVITY: 0.8, // px/frame (proper gravity)
  JUMP_VELOCITY: -15, // px/frame upward (strong bounce)
  SPRING_VELOCITY: -25, // px/frame upward (super bounce)
  HORIZONTAL_SPEED: 6, // px/frame (responsive movement)
  MAX_FALL_SPEED: 20, // px/frame (terminal velocity)
};

export const GAME_CONFIG = {
  PLAYER_SIZE: 64,
  PLATFORM_HEIGHT: 14,
  BASE_PLATFORM_GAP: 80,
  MIN_PLATFORM_GAP: 50,
  PLATFORM_WIDTH_MIN: 55,
  PLATFORM_WIDTH_MAX: 110,
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
        width: playerSize,
        height: playerSize,
        hasShield: false,
        shieldTime: 0,
      },
      cameraY: 0,
      platforms: [],
      particles: [],
      screenShake: 0,
      combo: 0,
    };

    // seed platforms
    this.seedPlatforms(initial);
    return initial;
  }

  private seedPlatforms(state: GameState) {
    state.platforms = [];
    const { screenWidth, screenHeight } = state;
    const gap = GAME_CONFIG.BASE_PLATFORM_GAP;
    let y = screenHeight - 40;
    while (y > -screenHeight) {
      const width = this.randBetween(GAME_CONFIG.PLATFORM_WIDTH_MIN, GAME_CONFIG.PLATFORM_WIDTH_MAX);
      const x = this.randBetween(0, screenWidth - width);
      const platformType = this.getPlatformType(y, screenHeight);
      const vx = platformType === 'moving' ? (Math.random() < 0.5 ? -0.06 : 0.06) : 0;
      state.platforms.push({ 
        id: Math.random().toString(36).slice(2), 
        x, y, width, 
        height: GAME_CONFIG.PLATFORM_HEIGHT, 
        vx,
        type: platformType
      });
      y -= gap;
    }
    // ensure a solid platform under the player
    const baseWidth = 120;
    const baseX = Math.max(0, Math.min(screenWidth - baseWidth, state.player.x - baseWidth / 2));
    state.platforms.push({ 
      id: 'base', 
      x: baseX, 
      y: state.player.y + state.player.height, 
      width: baseWidth, 
      height: GAME_CONFIG.PLATFORM_HEIGHT, 
      vx: 0,
      type: 'normal'
    });
  }

  private getPlatformType(y: number, screenHeight: number): Platform['type'] {
    const heightRatio = Math.abs(y) / screenHeight;
    
    // Higher up = more special platforms
    if (heightRatio > 3) {
      const rand = Math.random();
      if (rand < 0.1) return 'spring';
      if (rand < 0.25) return 'breakable';
      if (rand < 0.45) return 'moving';
    } else if (heightRatio > 1.5) {
      const rand = Math.random();
      if (rand < 0.05) return 'spring';
      if (rand < 0.15) return 'breakable';
      if (rand < 0.3) return 'moving';
    } else if (heightRatio > 0.5) {
      const rand = Math.random();
      if (rand < 0.2) return 'moving';
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
    // Low-pass filter to smooth sudden spikes
    const alpha = 0.2;
    this.moveAnalog = Math.max(-1, Math.min(1, alpha * value + (1 - alpha) * this.moveAnalog));
  }
  
  // Legacy method name for compatibility
  setTilt(value: number) {
    this.setMoveAnalog(value);
  }

  update(currentTime: number): void {
    if (this.gameState.phase !== 'PLAYING') return;
    if (this.lastUpdateTime === 0) { this.lastUpdateTime = currentTime; return; }
    const dt = Math.min(34, currentTime - this.lastUpdateTime); // clamp
    this.lastUpdateTime = currentTime;

    this.updatePlayer(dt);
    this.updatePlatforms(dt);
    this.updateParticles(dt);
    this.updateScreenShake(dt);
    this.scrollWorld();
    this.cleanupAndSpawnPlatforms();
  }

  private updatePlayer(dt: number) {
    const s = this.gameState; const p = s.player;
    
    // Normalize dt to 60fps (16.67ms per frame)
    const frameMultiplier = dt / 16.67;
    
    // horizontal movement with wrap
    // Combined digital + analog input
    const input = Math.max(-1, Math.min(1, this.moveDir + this.moveAnalog));
    p.x += input * PHYSICS.HORIZONTAL_SPEED * frameMultiplier;
    
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

    // Award XP for reaching new heights (moving upward only)
    if (p.y < s.maxHeight) {
      const heightGained = s.maxHeight - p.y;
      // Award 1 point per pixel of height gained (this is the main scoring mechanism)
      s.score += Math.floor(heightGained);
      s.maxHeight = p.y; // Update max height
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
        plat.x += plat.vx * 100 * frameMultiplier; // Scale up movement speed
        
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
      p.y += dy;
      s.cameraY -= dy;
      // move platforms down by dy
      for (const plat of s.platforms) plat.y += dy;
      // Don't award score here - it's already awarded in updatePlayer based on height
    }
  }

  private cleanupAndSpawnPlatforms() {
    const s = this.gameState;
    const minY = Math.min(...s.platforms.map(pl => pl.y));
    // remove platforms below screen
    s.platforms = s.platforms.filter(pl => pl.y - s.cameraY < s.screenHeight + 40);
    // spawn above
    const difficulty = Math.min(1, s.score / 3000);
    const gap = GAME_CONFIG.BASE_PLATFORM_GAP - (GAME_CONFIG.BASE_PLATFORM_GAP - GAME_CONFIG.MIN_PLATFORM_GAP) * difficulty;
    let y = minY - gap;
    while (s.platforms.length < 20) {
      const width = this.randBetween(GAME_CONFIG.PLATFORM_WIDTH_MIN, GAME_CONFIG.PLATFORM_WIDTH_MAX);
      const x = this.randBetween(0, s.screenWidth - width);
      const platformType = this.getPlatformType(y, s.screenHeight);
      const vx = platformType === 'moving' ? (Math.random() < 0.5 ? -0.06 : 0.06) : 0;
      s.platforms.push({ 
        id: Math.random().toString(36).slice(2), 
        x, y, width, 
        height: GAME_CONFIG.PLATFORM_HEIGHT, 
        vx,
        type: platformType
      });
      y -= gap;
    }
  }

  private handlePlatformLanding(plat: Platform, player: any) {
    const s = this.gameState;
    
    // Snap to platform top
    player.y = plat.y - player.height;
    
    // Handle different platform types (NO SCORING HERE - only height gives points)
    switch (plat.type) {
      case 'spring':
        if (!plat.springUsed) {
          player.vy = PHYSICS.SPRING_VELOCITY;
          plat.springUsed = true;
          this.addScreenShake(8);
          this.createParticles(plat.x + plat.width / 2, plat.y, '#FFD700', 15);
          s.combo += 2; // Bonus combo for spring
        } else {
          player.vy = PHYSICS.JUMP_VELOCITY;
          s.combo++;
        }
        break;
        
      case 'breakable':
        player.vy = PHYSICS.JUMP_VELOCITY;
        plat.broken = true;
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
    
    // No bonus scoring here - only height gained gives points
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

  private randBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
